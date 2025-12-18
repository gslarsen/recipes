#!/usr/bin/env python3
"""
Food Network Recipe Scraper - Browser-based version

Uses Playwright to automate a real browser, which handles:
- JavaScript-rendered content
- Bot detection / Akamai protection
- Cookie-based authentication

Usage:
    # First time - will open browser for you to log in
    python browser_scraper.py login

    # After logging in - scrape your saved recipes
    python browser_scraper.py scrape-saved

    # Scrape a single recipe
    python browser_scraper.py scrape "https://www.foodnetwork.com/recipes/..."
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, Page, Browser
from rich.console import Console
from rich.panel import Panel
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
)

from scraper import Recipe, save_recipes

console = Console()

# Directory to store browser state (cookies, localStorage, etc.)
STATE_DIR = Path(__file__).parent / ".browser_state"
STATE_FILE = STATE_DIR / "state.json"


def get_browser(playwright, headless: bool = True) -> Browser:
    """Launch browser with appropriate settings."""
    return playwright.chromium.launch(
        headless=headless,
        args=[
            "--disable-blink-features=AutomationControlled",
        ],
    )


def get_context(browser: Browser, state_file: Path = STATE_FILE):
    """Create browser context, loading saved state if available."""
    STATE_DIR.mkdir(exist_ok=True)

    if state_file.exists():
        console.print("[dim]Loading saved browser state...[/dim]")
        return browser.new_context(storage_state=str(state_file))
    else:
        return browser.new_context()


def save_state(context, state_file: Path = STATE_FILE):
    """Save browser state for future sessions."""
    STATE_DIR.mkdir(exist_ok=True)
    context.storage_state(path=str(state_file))
    console.print(f"[green]✓ Browser state saved to {state_file}[/green]")


def do_login(args):
    """Open browser for user to log in manually."""
    console.print(
        Panel(
            "[bold]Browser Login[/bold]\n\n"
            "A browser window will open. Please:\n"
            "1. Log into your Food Network account\n"
            "2. Navigate to your saved recipes to verify login\n"
            "3. Close the browser window when done\n\n"
            "[dim]Your session will be saved for future scraping.[/dim]",
            border_style="cyan",
        )
    )

    with sync_playwright() as p:
        browser = get_browser(p, headless=False)
        context = browser.new_context()
        page = context.new_page()

        # Go to Food Network login page
        page.goto("https://www.foodnetwork.com/")

        console.print("\n[yellow]Waiting for you to log in...[/yellow]")
        console.print("[dim]Close the browser window when you're done.[/dim]\n")

        # Wait for browser to be closed by user
        try:
            page.wait_for_event("close", timeout=0)
        except Exception:
            pass

        # Save state before closing
        save_state(context)
        browser.close()

    console.print("\n[green]✓ Login complete! You can now run:[/green]")
    console.print("  python browser_scraper.py scrape-saved")


def extract_recipe_from_page(page: Page, url: str) -> Recipe:
    """Extract recipe data from a page."""
    # Try to get JSON-LD data first (most reliable)
    json_ld_data = page.evaluate(
        """() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
            try {
                const data = JSON.parse(script.textContent);
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item['@type'] === 'Recipe') return item;
                    }
                } else if (data['@type'] === 'Recipe') {
                    return data;
                } else if (data['@graph']) {
                    for (const item of data['@graph']) {
                        if (item['@type'] === 'Recipe') return item;
                    }
                }
            } catch (e) {}
        }
        return null;
    }"""
    )

    if json_ld_data:
        return parse_json_ld(json_ld_data, url)

    # Fallback to HTML parsing
    title = page.title() or "Untitled Recipe"
    title_elem = page.query_selector("h1")
    if title_elem:
        title = title_elem.inner_text().strip()

    return Recipe(
        title=title,
        url=url,
        ingredients=[],
        instructions=[],
    )


def parse_json_ld(data: dict, url: str) -> Recipe:
    """Parse recipe from JSON-LD data."""

    def get_time(time_str):
        if not time_str:
            return None
        match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?", time_str)
        if match:
            hours, minutes = match.groups()
            parts = []
            if hours:
                parts.append(f"{hours}h")
            if minutes:
                parts.append(f"{minutes}m")
            return " ".join(parts) if parts else None
        return time_str

    def get_instructions(instructions):
        if not instructions:
            return []
        if isinstance(instructions, str):
            return [s.strip() for s in instructions.split("\n") if s.strip()]
        if isinstance(instructions, list):
            result = []
            for item in instructions:
                if isinstance(item, str):
                    result.append(item)
                elif isinstance(item, dict):
                    if item.get("@type") == "HowToStep":
                        result.append(item.get("text", ""))
                    elif item.get("@type") == "HowToSection":
                        section_name = item.get("name", "")
                        if section_name:
                            result.append(f"**{section_name}**")
                        for step in item.get("itemListElement", []):
                            if isinstance(step, dict):
                                result.append(step.get("text", ""))
            return [s for s in result if s]
        return []

    def get_ingredients(ingredients):
        if not ingredients:
            return []
        if isinstance(ingredients, list):
            return [str(i) for i in ingredients]
        return []

    nutrition = {}
    if "nutrition" in data and isinstance(data["nutrition"], dict):
        nutrition_data = data["nutrition"]
        nutrition_fields = [
            ("calories", "Calories"),
            ("fatContent", "Fat"),
            ("saturatedFatContent", "Saturated Fat"),
            ("cholesterolContent", "Cholesterol"),
            ("sodiumContent", "Sodium"),
            ("carbohydrateContent", "Carbohydrates"),
            ("fiberContent", "Fiber"),
            ("sugarContent", "Sugar"),
            ("proteinContent", "Protein"),
        ]
        for field, label in nutrition_fields:
            if field in nutrition_data:
                nutrition[label] = nutrition_data[field]

    author = None
    if "author" in data:
        author_data = data["author"]
        if isinstance(author_data, str):
            author = author_data
        elif isinstance(author_data, dict):
            author = author_data.get("name")
        elif isinstance(author_data, list) and author_data:
            first_author = author_data[0]
            author = (
                first_author.get("name")
                if isinstance(first_author, dict)
                else str(first_author)
            )

    image_url = None
    if "image" in data:
        image_data = data["image"]
        if isinstance(image_data, str):
            image_url = image_data
        elif isinstance(image_data, dict):
            image_url = image_data.get("url")
        elif isinstance(image_data, list) and image_data:
            first_image = image_data[0]
            image_url = (
                first_image.get("url")
                if isinstance(first_image, dict)
                else str(first_image)
            )

    categories = []
    if "recipeCategory" in data:
        cat = data["recipeCategory"]
        categories = cat if isinstance(cat, list) else [cat]
    if "recipeCuisine" in data:
        cuisine = data["recipeCuisine"]
        cuisines = cuisine if isinstance(cuisine, list) else [cuisine]
        categories.extend(cuisines)

    return Recipe(
        title=data.get("name", "Untitled Recipe"),
        url=url,
        author=author,
        description=data.get("description"),
        prep_time=get_time(data.get("prepTime")),
        cook_time=get_time(data.get("cookTime")),
        total_time=get_time(data.get("totalTime")),
        servings=data.get("recipeYield"),
        difficulty=data.get("difficulty"),
        ingredients=get_ingredients(data.get("recipeIngredient")),
        instructions=get_instructions(data.get("recipeInstructions")),
        image_url=image_url,
        categories=categories,
        nutrition=nutrition,
    )


def scrape_single(args):
    """Scrape a single recipe using browser."""
    with sync_playwright() as p:
        browser = get_browser(p, headless=not args.visible)
        context = get_context(browser)
        page = context.new_page()

        console.print(f"[cyan]Scraping: {args.url}[/cyan]")
        page.goto(args.url, wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(1500)  # Let JS render

        recipe = extract_recipe_from_page(page, args.url)
        save_recipes([recipe], args.output)

        console.print(f"[green]✓ Saved: {recipe.title}[/green]")

        browser.close()


def scrape_saved(args):
    """Scrape all saved recipes using browser."""
    if not STATE_FILE.exists():
        console.print(
            "[red]No saved login found. Please run 'python browser_scraper.py login' first.[/red]"
        )
        sys.exit(1)

    with sync_playwright() as p:
        browser = get_browser(p, headless=not args.visible)
        context = get_context(browser)
        page = context.new_page()

        saves_page_url = (
            "https://www.foodnetwork.com/saves#/?section=recipes&sort=newest"
        )

        console.print("[cyan]Loading saves page...[/cyan]")
        try:
            page.goto(saves_page_url, wait_until="domcontentloaded", timeout=15000)
        except Exception as e:
            console.print(f"[red]Navigation error: {e}[/red]")
            browser.close()
            sys.exit(1)

        page.wait_for_timeout(4000)

        if "login" in page.url.lower() or "sign-in" in page.url.lower():
            console.print(
                "[yellow]Redirected to login - session may have expired.[/yellow]"
            )
            console.print("Run 'python browser_scraper.py login' to log in again.")
            browser.close()
            sys.exit(1)

        # NEW APPROACH: Open each card in a new tab using Ctrl/Cmd+Click
        # This preserves the main page scroll position (virtualized scrolling issue)

        recipe_urls = []  # List of (title, url) tuples
        seen_titles = set()
        no_new_count = 0
        scroll_position = 0

        # Use request interception to capture URL when clicking
        captured_url = []

        def handle_request(request):
            url = request.url
            if "/recipes/" in url and "foodnetwork.com" in url:
                captured_url.append(url)

        page.on("request", handle_request)

        console.print("[cyan]Collecting recipe URLs...[/cyan]")

        while no_new_count < 20:  # Patient scrolling
            # Find ONE new card to process
            cards = page.query_selector_all(".cards__card-link")
            found_new = False

            for card in cards:
                try:
                    title_elem = card.query_selector(".card__title, h2")
                    if not title_elem:
                        continue
                    title_text = title_elem.inner_text().strip()
                    if (
                        not title_text
                        or "Import" in title_text
                        or "Create" in title_text
                    ):
                        continue
                    if title_text in seen_titles:
                        continue

                    # Found a new card!
                    seen_titles.add(title_text)
                    found_new = True
                    no_new_count = 0

                    # Click the card to capture URL via request handler
                    captured_url.clear()
                    card.click()
                    page.wait_for_timeout(400)  # Brief wait for request to fire

                    if captured_url:
                        recipe_urls.append((title_text, captured_url[0]))
                        console.print(
                            f"[cyan]Collected {len(recipe_urls)} URLs...[/cyan]",
                            end="\r",
                        )

                    # Navigate back to saves page
                    page.goto(
                        saves_page_url,
                        wait_until="domcontentloaded",
                        timeout=15000,
                    )
                    page.wait_for_timeout(1500)

                    # Scroll back to approximate position (cards ~120px each)
                    target_scroll = len(recipe_urls) * 120
                    page.evaluate(f"window.scrollTo(0, {target_scroll})")
                    page.wait_for_timeout(800)

                    # Break to re-query fresh cards
                    break

                except Exception as e:
                    if args.debug:
                        console.print(f"[yellow]Error: {e}[/yellow]")
                    # Try to recover
                    try:
                        page.goto(
                            saves_page_url, wait_until="domcontentloaded", timeout=15000
                        )
                        page.wait_for_timeout(1000)
                    except:
                        pass
                    break

            if not found_new:
                no_new_count += 1
                # Scroll down to load more cards
                scroll_position += 500
                page.evaluate(f"window.scrollTo(0, {scroll_position})")
                page.wait_for_timeout(800)

        console.print()
        console.print(f"[green]Collected {len(recipe_urls)} recipe URLs![/green]")

        if not recipe_urls:
            console.print("[yellow]No saved recipes found.[/yellow]")
            console.print(
                "[dim]Make sure you have saved recipes and are properly logged in.[/dim]"
            )
            browser.close()
            sys.exit(1)

        if args.limit:
            recipe_urls = recipe_urls[: args.limit]

        # PHASE 2: Scrape each recipe URL directly
        console.print(f"\n[cyan]Phase 2: Scraping {len(recipe_urls)} recipes...[/cyan]")

        recipes = []
        failed = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Scraping recipes...", total=len(recipe_urls))

            for title, url in recipe_urls:
                progress.update(task, description=f"Scraping: {title[:30]}...")

                # Try up to 3 times with increasing wait
                success = False
                for attempt in range(3):
                    try:
                        # Navigate with longer timeout
                        page.goto(url, wait_until="load", timeout=30000)
                        page.wait_for_timeout(2000)  # Let page fully settle

                        recipe = extract_recipe_from_page(page, url)
                        recipe.title = title
                        recipes.append(recipe)
                        success = True
                        break

                    except Exception as e:
                        if attempt < 2:
                            page.wait_for_timeout(2000)  # Wait before retry
                        else:
                            if args.debug:
                                console.print(
                                    f"[red]Failed to scrape {title}: {e}[/red]"
                                )
                            failed.append((title, url))

                progress.advance(task)

        if recipes:
            save_recipes(recipes, args.output)
            console.print(f"\n[green]✓ Scraped {len(recipes)} recipes![/green]")

        if failed:
            console.print(f"[yellow]Failed to scrape {len(failed)} recipes[/yellow]")
            # Save failed URLs to a file so user can retry
            with open("failed_recipes.txt", "w") as f:
                for title, url in failed:
                    f.write(f"{url}\n")
            console.print("[dim]Failed URLs saved to failed_recipes.txt[/dim]")

        # Save updated state
        save_state(context)
        browser.close()


def list_all_titles(args):
    """Diagnostic: scroll through saves page and collect ALL titles without clicking."""
    console = Console()

    with sync_playwright() as p:
        browser = get_browser(p, headless=not args.visible)
        context = get_context(browser)
        page = context.new_page()

        saves_page_url = (
            "https://www.foodnetwork.com/saves#/?section=recipes&sort=newest"
        )

        console.print("[cyan]Loading saves page...[/cyan]")
        try:
            page.goto(saves_page_url, wait_until="domcontentloaded", timeout=15000)
        except Exception as e:
            console.print(f"[red]Navigation issue: {e}[/red]")
            browser.close()
            sys.exit(1)

        page.wait_for_timeout(3000)

        if "login" in page.url.lower() or "sign-in" in page.url.lower():
            console.print(
                "[yellow]Redirected to login - session may have expired.[/yellow]"
            )
            browser.close()
            sys.exit(1)

        all_titles = set()
        no_new_count = 0
        scroll_position = 0

        console.print("[cyan]Scrolling through all recipes to collect titles...[/cyan]")

        while no_new_count < 15:  # More patient scrolling
            # Scroll down
            scroll_position += 600
            page.evaluate(f"window.scrollTo(0, {scroll_position})")
            page.wait_for_timeout(800)

            # Find all cards and extract titles
            cards = page.query_selector_all(".cards__card-link")
            new_found = 0

            for card in cards:
                title_elem = card.query_selector(".card__title, h2")
                if title_elem:
                    title_text = title_elem.inner_text().strip()
                    if (
                        title_text
                        and "Import" not in title_text
                        and "Create" not in title_text
                    ):
                        if title_text not in all_titles:
                            all_titles.add(title_text)
                            new_found += 1

            if new_found == 0:
                no_new_count += 1
            else:
                no_new_count = 0

            console.print(
                f"[cyan]Found {len(all_titles)} titles so far...[/cyan]", end="\r"
            )

        console.print()
        console.print(f"[green]Total unique titles found: {len(all_titles)}[/green]")

        # Save to file
        sorted_titles = sorted(all_titles)
        with open(args.output, "w") as f:
            for title in sorted_titles:
                f.write(f"{title}\n")

        console.print(f"[green]Saved to {args.output}[/green]")

        browser.close()


def scrape_missing(args):
    """Find and scrape missing recipes using the SEARCH on the saves page."""
    if not os.path.exists(args.titles_file):
        console.print(f"[red]File not found: {args.titles_file}[/red]")
        sys.exit(1)

    with open(args.titles_file) as f:
        missing_titles = [line.strip() for line in f if line.strip()]

    if not missing_titles:
        console.print("[yellow]No titles found in file.[/yellow]")
        sys.exit(1)

    console.print(
        f"[cyan]Searching for {len(missing_titles)} missing recipes...[/cyan]"
    )

    with sync_playwright() as p:
        browser = get_browser(p, headless=not args.visible)
        context = get_context(browser)
        page = context.new_page()

        # Capture URLs when clicking cards
        captured_url = []

        def handle_request(request):
            url = request.url
            if "/recipes/" in url and "foodnetwork.com" in url:
                captured_url.append(url)

        page.on("request", handle_request)

        saves_page_url = (
            "https://www.foodnetwork.com/saves#/?section=recipes&sort=newest"
        )

        console.print("[cyan]Loading saves page...[/cyan]")
        page.goto(saves_page_url, wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(4000)

        if "login" in page.url.lower() or "sign-in" in page.url.lower():
            console.print("[yellow]Session expired. Run 'login' first.[/yellow]")
            browser.close()
            sys.exit(1)

        # Use the search feature on saves page
        recipe_urls = []  # (title, url) tuples
        failed = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Searching...", total=len(missing_titles))

            for title in missing_titles:
                progress.update(task, description=f"Searching: {title[:30]}...")

                try:
                    # Go to saves page fresh for each search
                    page.goto(
                        saves_page_url, wait_until="domcontentloaded", timeout=15000
                    )
                    page.wait_for_timeout(2000)

                    # Click the search icon to reveal search input
                    search_icon = page.query_selector(
                        '.actions--right__search-icon, [class*="search-icon"]'
                    )
                    if search_icon:
                        search_icon.click()
                        page.wait_for_timeout(800)

                    # Find and use the search input
                    search_input = page.query_selector("#search, input.search__input")
                    if search_input:
                        search_input.fill(title)
                        page.wait_for_timeout(1500)  # Wait for filter

                        # Find matching card
                        cards = page.query_selector_all(".cards__card-link")
                        found = False

                        for card in cards:
                            title_elem = card.query_selector(".card__title, h2")
                            if title_elem:
                                card_title = title_elem.inner_text().strip()
                                if (
                                    card_title
                                    and "Import" not in card_title
                                    and "Create" not in card_title
                                ):
                                    # Check if title matches (case insensitive)
                                    if card_title.lower() == title.lower():
                                        captured_url.clear()
                                        card.click()
                                        page.wait_for_timeout(800)
                                        if captured_url:
                                            recipe_urls.append((title, captured_url[0]))
                                            found = True
                                        break

                        if not found:
                            failed.append(title)
                    else:
                        failed.append(title)

                except Exception as e:
                    if args.debug:
                        console.print(f"[yellow]Error with {title}: {e}[/yellow]")
                    failed.append(title)

                progress.advance(task)

        console.print(
            f"\n[green]Found {len(recipe_urls)} of {len(missing_titles)} recipes![/green]"
        )

        if not recipe_urls:
            console.print("[yellow]No recipes found.[/yellow]")
            browser.close()
            sys.exit(1)

        # Phase 2: Scrape each found URL
        console.print(f"\n[cyan]Scraping {len(recipe_urls)} recipes...[/cyan]")
        recipes = []
        scrape_failed = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Scraping...", total=len(recipe_urls))

            for title, url in recipe_urls:
                progress.update(task, description=f"Scraping: {title[:30]}...")
                try:
                    page.goto(url, wait_until="load", timeout=30000)
                    page.wait_for_timeout(2000)
                    recipe = extract_recipe_from_page(page, url)
                    recipe.title = title
                    recipes.append(recipe)
                except Exception as e:
                    if args.debug:
                        console.print(f"[red]Error scraping {title}: {e}[/red]")
                    scrape_failed.append(title)
                progress.advance(task)

        if recipes:
            save_recipes(recipes, args.output)
            console.print(f"\n[green]✓ Scraped {len(recipes)} recipes![/green]")

        if failed:
            console.print(f"\n[yellow]Could not find {len(failed)} recipes:[/yellow]")
            for title in failed[:10]:
                console.print(f"  [dim]• {title}[/dim]")
            if len(failed) > 10:
                console.print(f"  [dim]... and {len(failed) - 10} more[/dim]")

        browser.close()


def main():
    parser = argparse.ArgumentParser(
        description="Food Network Recipe Scraper (Browser-based)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Login command
    login_parser = subparsers.add_parser("login", help="Open browser to log in")
    login_parser.set_defaults(func=do_login)

    # Scrape single recipe
    scrape_parser = subparsers.add_parser("scrape", help="Scrape a single recipe")
    scrape_parser.add_argument("url", help="Recipe URL to scrape")
    scrape_parser.add_argument(
        "--output", "-o", default="output", help="Output directory"
    )
    scrape_parser.add_argument(
        "--visible", "-v", action="store_true", help="Show browser window"
    )
    scrape_parser.set_defaults(func=scrape_single)

    # Scrape saved recipes
    saved_parser = subparsers.add_parser(
        "scrape-saved", help="Scrape your saved recipes"
    )
    saved_parser.add_argument(
        "--output", "-o", default="output", help="Output directory"
    )
    saved_parser.add_argument(
        "--limit", "-l", type=int, help="Maximum recipes to scrape"
    )
    saved_parser.add_argument(
        "--visible", "-v", action="store_true", help="Show browser window"
    )
    saved_parser.add_argument(
        "--debug", "-d", action="store_true", help="Show debug info"
    )
    saved_parser.set_defaults(func=scrape_saved)

    # List titles command (diagnostic)
    list_parser = subparsers.add_parser(
        "list-titles", help="List all recipe titles from saves page (diagnostic)"
    )
    list_parser.add_argument(
        "--visible", "-v", action="store_true", help="Show browser window"
    )
    list_parser.add_argument(
        "--output", "-o", default="all_titles.txt", help="Output file for titles"
    )
    list_parser.set_defaults(func=list_all_titles)

    # Scrape missing recipes by title search
    missing_parser = subparsers.add_parser(
        "scrape-missing", help="Search for and scrape recipes by title"
    )
    missing_parser.add_argument(
        "titles_file", help="File containing recipe titles (one per line)"
    )
    missing_parser.add_argument(
        "--output", "-o", default="output", help="Output directory"
    )
    missing_parser.add_argument(
        "--visible", "-v", action="store_true", help="Show browser window"
    )
    missing_parser.add_argument(
        "--debug", "-d", action="store_true", help="Show debug info"
    )
    missing_parser.set_defaults(func=scrape_missing)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    console.print(
        Panel.fit(
            "[bold]Food Network Recipe Scraper[/bold]\n[dim]Browser-based version[/dim]",
            border_style="blue",
        )
    )

    args.func(args)


if __name__ == "__main__":
    main()
