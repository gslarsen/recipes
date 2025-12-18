#!/usr/bin/env python3
"""
Quick script to scrape a single recipe URL and add it to the collection.

Usage:
    python scrape_url.py "https://www.foodnetwork.com/recipes/..."

Or multiple URLs:
    python scrape_url.py url1 url2 url3
"""

import sys
import json
import os
import re
from pathlib import Path
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from playwright.sync_api import sync_playwright
from rich.console import Console
from browser_scraper import (
    get_browser,
    get_context,
    extract_recipe_from_page,
    STATE_FILE,
)
from scraper import save_recipes

console = Console()


def generate_markdown(recipe):
    """Convert a recipe dict to markdown format."""
    lines = []
    title = recipe.get("title", "Untitled Recipe")
    lines.append(f"# {title}")
    lines.append("")

    if recipe.get("url"):
        lines.append(f"**Source:** [{recipe['url']}]({recipe['url']})")
        lines.append("")

    if recipe.get("author"):
        lines.append(f"**By:** {recipe['author']}")
        lines.append("")

    if recipe.get("description"):
        lines.append(f"> {recipe['description']}")
        lines.append("")

    info = []
    if recipe.get("prep_time"): info.append(f"**Prep:** {recipe['prep_time']}")
    if recipe.get("cook_time"): info.append(f"**Cook:** {recipe['cook_time']}")
    if recipe.get("total_time"): info.append(f"**Total:** {recipe['total_time']}")
    if recipe.get("servings"): info.append(f"**Servings:** {recipe['servings']}")
    if info:
        lines.append(" | ".join(info))
        lines.append("")

    ingredients = recipe.get("ingredients", [])
    if ingredients:
        lines.append("## Ingredients")
        lines.append("")
        for ing in ingredients:
            lines.append(f"- {ing}")
        lines.append("")

    instructions = recipe.get("instructions", [])
    if instructions:
        lines.append("## Instructions")
        lines.append("")
        for i, step in enumerate(instructions, 1):
            lines.append(f"{i}. {step}")
            lines.append("")

    nutrition = recipe.get("nutrition", {})
    if nutrition:
        lines.append("## Nutrition")
        lines.append("")
        for key, value in nutrition.items():
            lines.append(f"- **{key}:** {value}")
        lines.append("")

    return "\n".join(lines)


def scrape_single_url(url: str, page) -> dict:
    """Scrape a single recipe URL and return the recipe dict."""
    page.goto(url, wait_until="load", timeout=30000)
    page.wait_for_timeout(2000)
    recipe = extract_recipe_from_page(page, url)
    return recipe


def main():
    if len(sys.argv) < 2:
        console.print("[yellow]Usage: python scrape_url.py <url> [url2] [url3] ...[/yellow]")
        console.print("\nExample:")
        console.print('  python scrape_url.py "https://www.foodnetwork.com/recipes/ina-garten/..."')
        sys.exit(1)

    urls = sys.argv[1:]
    console.print(f"[cyan]Scraping {len(urls)} recipe(s)...[/cyan]")

    if not STATE_FILE.exists():
        console.print("[red]No login session found. Run 'python browser_scraper.py login' first.[/red]")
        sys.exit(1)

    with sync_playwright() as p:
        browser = get_browser(p, headless=False)
        context = get_context(browser)
        page = context.new_page()

        recipes = []
        for url in urls:
            try:
                console.print(f"[cyan]Scraping: {url[:60]}...[/cyan]")
                recipe = scrape_single_url(url, page)
                recipes.append(recipe)
                console.print(f"[green]✓ {recipe.title}[/green]")
            except Exception as e:
                console.print(f"[red]Failed to scrape {url}: {e}[/red]")

        browser.close()

    if recipes:
        # Save to output directory
        save_recipes(recipes, "output")

        # Also append to the final collection
        final_file = Path("output/all_recipes_final.json")
        if final_file.exists():
            with open(final_file) as f:
                existing = json.load(f)

            # Add new recipes (dedupe by URL to allow same-title recipes by different chefs)
            existing_urls = {r.get("url") for r in existing}
            new_count = 0
            for recipe in recipes:
                recipe_dict = recipe.__dict__ if hasattr(recipe, '__dict__') else recipe
                if recipe_dict.get("url") not in existing_urls:
                    # Add date_added timestamp for sorting by "Newest"
                    recipe_dict["date_added"] = datetime.now().isoformat()
                    existing.append(recipe_dict)
                    new_count += 1

            with open(final_file, "w") as f:
                json.dump(existing, f, indent=2)

            console.print(f"\n[green]✓ Added {new_count} new recipe(s) to all_recipes_final.json[/green]")
            console.print(f"[green]  Total recipes in collection: {len(existing)}[/green]")

        # Also save to markdown_final
        md_final_dir = Path("output/markdown_final")
        if md_final_dir.exists():
            for recipe in recipes:
                recipe_dict = recipe.__dict__ if hasattr(recipe, '__dict__') else recipe
                title = recipe_dict.get("title", "untitled")
                # Slugify
                slug = title.lower()
                slug = re.sub(r'[^\w\s-]', '', slug)
                slug = re.sub(r'[-\s]+', '-', slug).strip('-')

                md_content = generate_markdown(recipe_dict)
                with open(md_final_dir / f"{slug}.md", "w") as f:
                    f.write(md_content)
            console.print(f"[green]✓ Added to output/markdown_final/[/green]")

        console.print(f"\n[green]✓ Scraped {len(recipes)} recipe(s)![/green]")


if __name__ == "__main__":
    main()

