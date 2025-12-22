#!/usr/bin/env python3
"""
Scrape private notes from Food Network recipe pages.

This script visits each recipe URL in all_recipes_final.json and extracts
any "My Private Notes" that Pam has added to those recipes.

Usage:
    python scrape_notes.py

Options:
    --visible       Show browser window while scraping
    --limit N       Only scrape first N recipes (for testing)
    --dry-run       Just show what would be scraped, don't modify files
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

from playwright.sync_api import sync_playwright
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn

from browser_scraper import get_browser, get_context, STATE_FILE

console = Console()


def extract_private_notes(page) -> str | None:
    """Extract private notes from a Food Network recipe page."""
    # Wait a moment for dynamic content to load
    page.wait_for_timeout(1500)

    # Try multiple selectors for the notes content
    selectors = [
        ".private-notes__note-content",
        ".private-notes__notes p",
        "[class*='private-notes'] p",
        ".private-notes-body p",
    ]

    for selector in selectors:
        try:
            elem = page.query_selector(selector)
            if elem:
                text = elem.inner_text().strip()
                if text and len(text) > 0:
                    return text
        except Exception:
            continue

    return None


def main():
    parser = argparse.ArgumentParser(description="Scrape private notes from Food Network recipes")
    parser.add_argument("--visible", action="store_true", help="Show browser window")
    parser.add_argument("--limit", type=int, help="Limit number of recipes to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't modify files, just show results")
    args = parser.parse_args()

    # Load existing recipes
    recipes_file = Path("output/all_recipes_final.json")
    if not recipes_file.exists():
        console.print("[red]Error: output/all_recipes_final.json not found[/red]")
        sys.exit(1)

    with open(recipes_file) as f:
        recipes = json.load(f)

    console.print(f"[cyan]Loaded {len(recipes)} recipes[/cyan]")

    # Filter to only Food Network URLs (notes won't exist on external/saves pages)
    fn_recipes = [
        r for r in recipes
        if r.get("url") and "foodnetwork.com/recipes/" in r.get("url", "")
        and "/saves" not in r.get("url", "")
    ]

    console.print(f"[cyan]Found {len(fn_recipes)} Food Network recipe URLs to check[/cyan]")

    if args.limit:
        fn_recipes = fn_recipes[:args.limit]
        console.print(f"[yellow]Limited to {args.limit} recipes[/yellow]")

    if not STATE_FILE.exists():
        console.print("[red]No login session found. Run 'python browser_scraper.py login' first.[/red]")
        sys.exit(1)

    if args.dry_run:
        console.print("[yellow]DRY RUN - no files will be modified[/yellow]")

    # Track results
    notes_found = []

    with sync_playwright() as p:
        browser = get_browser(p, headless=not args.visible)
        context = get_context(browser)
        page = context.new_page()

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Scraping notes...", total=len(fn_recipes))

            for recipe in fn_recipes:
                url = recipe.get("url")
                title = recipe.get("title", "Unknown")

                progress.update(task, description=f"[cyan]{title[:40]}...[/cyan]")

                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=15000)
                    notes = extract_private_notes(page)

                    if notes:
                        console.print(f"[green]✓ Found note for: {title}[/green]")
                        console.print(f"  [dim]{notes[:80]}{'...' if len(notes) > 80 else ''}[/dim]")

                        notes_found.append({
                            "title": title,
                            "url": url,
                            "notes": notes
                        })

                        # Update the recipe in memory
                        recipe["private_notes"] = notes

                except Exception as e:
                    console.print(f"[red]Error on {title}: {e}[/red]")

                progress.advance(task)

        browser.close()

    # Summary
    console.print(f"\n[bold]Summary:[/bold]")
    console.print(f"  Recipes checked: {len(fn_recipes)}")
    console.print(f"  Notes found: {len(notes_found)}")

    if not args.dry_run and notes_found:
        # Save updated recipes with notes
        with open(recipes_file, "w") as f:
            json.dump(recipes, f, indent=2)
        console.print(f"[green]✓ Updated {recipes_file} with private_notes field[/green]")

        # Save separate file with just recipes that have notes
        notes_file = Path("output/recipes_with_notes.json")
        with open(notes_file, "w") as f:
            json.dump(notes_found, f, indent=2)
        console.print(f"[green]✓ Created {notes_file} with {len(notes_found)} recipes[/green]")

    elif args.dry_run and notes_found:
        console.print("\n[yellow]DRY RUN - Would have saved:[/yellow]")
        for item in notes_found:
            console.print(f"  - {item['title']}")
            console.print(f"    Note: {item['notes'][:60]}...")


if __name__ == "__main__":
    main()

