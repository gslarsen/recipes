#!/usr/bin/env python3
"""
Food Network Recipe Scraper - Command Line Interface

Usage examples:
    # Scrape a single recipe
    python cli.py scrape https://www.foodnetwork.com/recipes/food-network-kitchen/pancakes-recipe-1913844

    # Scrape multiple recipes from a file
    python cli.py scrape-list urls.txt

    # Scrape all recipes from a collection/list page
    python cli.py scrape-collection "https://www.foodnetwork.com/recipes/photos/our-best-chicken-recipes"

    # Scrape your saved recipes (requires cookies)
    python cli.py scrape-saved --cookies cookies.json
"""

import argparse
import json
import sys
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.table import Table

from scraper import FoodNetworkScraper, Recipe, save_recipes

console = Console()


def scrape_single(args):
    """Scrape a single recipe URL."""
    scraper = FoodNetworkScraper(delay=args.delay)

    if args.cookies:
        scraper.load_cookies_from_file(args.cookies)

    recipe = scraper.scrape_recipe(args.url)

    if recipe:
        save_recipes([recipe], args.output)
        display_recipe_summary([recipe])
    else:
        console.print("[red]Failed to scrape recipe[/red]")
        sys.exit(1)


def scrape_list(args):
    """Scrape recipes from a file containing URLs."""
    urls_file = Path(args.file)
    if not urls_file.exists():
        console.print(f"[red]File not found: {args.file}[/red]")
        sys.exit(1)

    urls = [line.strip() for line in urls_file.read_text().splitlines() if line.strip() and not line.startswith('#')]

    if not urls:
        console.print("[yellow]No URLs found in file[/yellow]")
        sys.exit(1)

    console.print(f"[cyan]Found {len(urls)} URLs to scrape[/cyan]")

    scraper = FoodNetworkScraper(delay=args.delay)
    if args.cookies:
        scraper.load_cookies_from_file(args.cookies)

    recipes = []
    failed = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Scraping recipes...", total=len(urls))

        for url in urls:
            progress.update(task, description=f"Scraping: {url[:50]}...")
            recipe = scraper.scrape_recipe(url)
            if recipe:
                recipes.append(recipe)
            else:
                failed.append(url)
            progress.advance(task)

    if recipes:
        save_recipes(recipes, args.output)
        display_recipe_summary(recipes)

    if failed:
        console.print(f"\n[yellow]Failed to scrape {len(failed)} recipes:[/yellow]")
        for url in failed:
            console.print(f"  - {url}")


def scrape_collection(args):
    """Scrape all recipes from a collection/list page."""
    scraper = FoodNetworkScraper(delay=args.delay)

    if args.cookies:
        scraper.load_cookies_from_file(args.cookies)

    console.print(f"[cyan]Discovering recipes from collection page...[/cyan]")
    urls = scraper.scrape_recipe_list_page(args.url)

    if not urls:
        console.print("[yellow]No recipes found on page[/yellow]")
        sys.exit(1)

    console.print(f"[green]Found {len(urls)} recipes[/green]")

    if args.limit:
        urls = urls[:args.limit]
        console.print(f"[dim]Limited to {args.limit} recipes[/dim]")

    recipes = []
    failed = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Scraping recipes...", total=len(urls))

        for url in urls:
            progress.update(task, description=f"Scraping: {url.split('/')[-1][:40]}...")
            recipe = scraper.scrape_recipe(url)
            if recipe:
                recipes.append(recipe)
            else:
                failed.append(url)
            progress.advance(task)

    if recipes:
        save_recipes(recipes, args.output)
        display_recipe_summary(recipes)

    if failed:
        console.print(f"\n[yellow]Failed to scrape {len(failed)} recipes[/yellow]")


def scrape_saved(args):
    """Scrape your saved/favorited recipes."""
    scraper = FoodNetworkScraper(delay=args.delay)

    if not args.cookies:
        console.print("[red]Error: --cookies is required for scraping saved recipes[/red]")
        console.print("See README.md for instructions on exporting your browser cookies.")
        sys.exit(1)

    scraper.load_cookies_from_file(args.cookies)

    urls = scraper.get_saved_recipes_urls()

    if not urls:
        console.print("[yellow]No saved recipes found. Make sure your cookies are valid.[/yellow]")
        sys.exit(1)

    if args.limit:
        urls = urls[:args.limit]

    recipes = []
    failed = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Scraping recipes...", total=len(urls))

        for url in urls:
            progress.update(task, description=f"Scraping: {url.split('/')[-1][:40]}...")
            recipe = scraper.scrape_recipe(url)
            if recipe:
                recipes.append(recipe)
            else:
                failed.append(url)
            progress.advance(task)

    if recipes:
        save_recipes(recipes, args.output)
        display_recipe_summary(recipes)

    if failed:
        console.print(f"\n[yellow]Failed to scrape {len(failed)} recipes[/yellow]")


def display_recipe_summary(recipes: list[Recipe]):
    """Display a summary table of scraped recipes."""
    table = Table(title="Scraped Recipes", show_lines=True)
    table.add_column("Title", style="cyan", max_width=40)
    table.add_column("Author", style="green", max_width=20)
    table.add_column("Ingredients", justify="right")
    table.add_column("Steps", justify="right")

    for recipe in recipes:
        table.add_row(
            recipe.title[:40] + "..." if len(recipe.title) > 40 else recipe.title,
            recipe.author or "-",
            str(len(recipe.ingredients)),
            str(len(recipe.instructions)),
        )

    console.print()
    console.print(table)


def export_cookies_help(args):
    """Show help for exporting browser cookies."""
    help_text = """
[bold cyan]How to Export Cookies from Your Browser[/bold cyan]

To scrape your saved recipes, you need to export your authentication cookies from your browser.

[bold]Option 1: Using Browser Developer Tools (Manual)[/bold]

1. Log into Food Network in your browser
2. Open Developer Tools (F12 or Cmd+Shift+I)
3. Go to Application/Storage > Cookies > foodnetwork.com
4. Look for cookies like: authId, userId, sessionId, etc.
5. Create a JSON file with these cookies:

   {
       "cookie_name": "cookie_value",
       "another_cookie": "another_value"
   }

[bold]Option 2: Using EditThisCookie Extension (Recommended)[/bold]

1. Install "EditThisCookie" browser extension
2. Log into Food Network
3. Click the extension icon
4. Click "Export" to copy cookies as JSON
5. Paste into a file called cookies.json
6. The format should be converted - see README for details

[bold]Option 3: Using Cookie-Editor Extension[/bold]

1. Install "Cookie-Editor" browser extension
2. Log into Food Network
3. Click the extension icon
4. Click "Export" > "Export as JSON"
5. Save to cookies.json

[dim]Note: Cookies expire, so you may need to re-export them periodically.[/dim]
    """
    console.print(Panel(help_text, title="Cookie Export Help"))


def main():
    parser = argparse.ArgumentParser(
        description="Food Network Recipe Scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s scrape https://www.foodnetwork.com/recipes/ina-garten/perfect-roast-chicken-recipe-1940592
  %(prog)s scrape-list my_recipes.txt --output my_recipes
  %(prog)s scrape-collection "https://www.foodnetwork.com/recipes/photos/our-best-pasta-recipes" --limit 10
  %(prog)s scrape-saved --cookies cookies.json
  %(prog)s cookie-help
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Scrape single recipe
    scrape_parser = subparsers.add_parser("scrape", help="Scrape a single recipe")
    scrape_parser.add_argument("url", help="Recipe URL to scrape")
    scrape_parser.add_argument("--output", "-o", default="output", help="Output directory (default: output)")
    scrape_parser.add_argument("--cookies", "-c", help="Path to cookies JSON file")
    scrape_parser.add_argument("--delay", "-d", type=float, default=1.0, help="Delay between requests in seconds (default: 1.0)")
    scrape_parser.set_defaults(func=scrape_single)

    # Scrape from URL list file
    list_parser = subparsers.add_parser("scrape-list", help="Scrape recipes from a file of URLs")
    list_parser.add_argument("file", help="File containing recipe URLs (one per line)")
    list_parser.add_argument("--output", "-o", default="output", help="Output directory (default: output)")
    list_parser.add_argument("--cookies", "-c", help="Path to cookies JSON file")
    list_parser.add_argument("--delay", "-d", type=float, default=1.0, help="Delay between requests in seconds (default: 1.0)")
    list_parser.set_defaults(func=scrape_list)

    # Scrape collection page
    collection_parser = subparsers.add_parser("scrape-collection", help="Scrape all recipes from a collection page")
    collection_parser.add_argument("url", help="Collection/list page URL")
    collection_parser.add_argument("--output", "-o", default="output", help="Output directory (default: output)")
    collection_parser.add_argument("--cookies", "-c", help="Path to cookies JSON file")
    collection_parser.add_argument("--limit", "-l", type=int, help="Maximum number of recipes to scrape")
    collection_parser.add_argument("--delay", "-d", type=float, default=1.0, help="Delay between requests in seconds (default: 1.0)")
    collection_parser.set_defaults(func=scrape_collection)

    # Scrape saved recipes
    saved_parser = subparsers.add_parser("scrape-saved", help="Scrape your saved/favorited recipes")
    saved_parser.add_argument("--cookies", "-c", required=True, help="Path to cookies JSON file (required)")
    saved_parser.add_argument("--output", "-o", default="output", help="Output directory (default: output)")
    saved_parser.add_argument("--limit", "-l", type=int, help="Maximum number of recipes to scrape")
    saved_parser.add_argument("--delay", "-d", type=float, default=1.5, help="Delay between requests in seconds (default: 1.5)")
    saved_parser.set_defaults(func=scrape_saved)

    # Cookie help
    cookie_parser = subparsers.add_parser("cookie-help", help="Show help for exporting browser cookies")
    cookie_parser.set_defaults(func=export_cookies_help)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    console.print(Panel.fit(
        "[bold]Food Network Recipe Scraper[/bold]\n[dim]Backup your favorite recipes[/dim]",
        border_style="blue"
    ))

    args.func(args)


if __name__ == "__main__":
    main()

