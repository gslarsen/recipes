"""
Food Network Recipe Scraper

This module provides functionality to scrape recipes from Food Network.
It handles authentication, recipe discovery, and data extraction.
"""

import json
import re
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()


@dataclass
class Recipe:
    """Represents a scraped recipe."""
    title: str
    url: str
    author: Optional[str] = None
    description: Optional[str] = None
    prep_time: Optional[str] = None
    cook_time: Optional[str] = None
    total_time: Optional[str] = None
    servings: Optional[str] = None
    difficulty: Optional[str] = None
    ingredients: list[str] = None
    instructions: list[str] = None
    image_url: Optional[str] = None
    categories: list[str] = None
    nutrition: dict = None

    def __post_init__(self):
        if self.ingredients is None:
            self.ingredients = []
        if self.instructions is None:
            self.instructions = []
        if self.categories is None:
            self.categories = []
        if self.nutrition is None:
            self.nutrition = {}

    def to_markdown(self) -> str:
        """Convert recipe to Markdown format."""
        lines = [f"# {self.title}", ""]

        if self.author:
            lines.extend([f"**Author:** {self.author}", ""])

        if self.description:
            lines.extend([f"> {self.description}", ""])

        if self.image_url:
            lines.extend([f"![{self.title}]({self.image_url})", ""])

        # Time and servings info
        info_parts = []
        if self.prep_time:
            info_parts.append(f"**Prep Time:** {self.prep_time}")
        if self.cook_time:
            info_parts.append(f"**Cook Time:** {self.cook_time}")
        if self.total_time:
            info_parts.append(f"**Total Time:** {self.total_time}")
        if self.servings:
            info_parts.append(f"**Servings:** {self.servings}")
        if self.difficulty:
            info_parts.append(f"**Difficulty:** {self.difficulty}")

        if info_parts:
            lines.extend([" | ".join(info_parts), ""])

        if self.categories:
            lines.extend([f"**Categories:** {', '.join(self.categories)}", ""])

        # Ingredients
        if self.ingredients:
            lines.extend(["## Ingredients", ""])
            for ingredient in self.ingredients:
                lines.append(f"- {ingredient}")
            lines.append("")

        # Instructions
        if self.instructions:
            lines.extend(["## Instructions", ""])
            for i, instruction in enumerate(self.instructions, 1):
                lines.append(f"{i}. {instruction}")
            lines.append("")

        # Nutrition
        if self.nutrition:
            lines.extend(["## Nutrition Information", ""])
            for key, value in self.nutrition.items():
                lines.append(f"- **{key}:** {value}")
            lines.append("")

        lines.extend(["---", f"*Source: [{self.url}]({self.url})*"])

        return "\n".join(lines)


class FoodNetworkScraper:
    """Scraper for Food Network recipes."""

    BASE_URL = "https://www.foodnetwork.com"

    def __init__(self, delay: float = 1.0):
        """
        Initialize the scraper.

        Args:
            delay: Seconds to wait between requests (be respectful!)
        """
        self.session = requests.Session()
        self.delay = delay
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Connection": "keep-alive",
        })

    def set_cookies(self, cookies: dict):
        """
        Set authentication cookies from your browser session.

        Args:
            cookies: Dictionary of cookie name-value pairs
        """
        for name, value in cookies.items():
            self.session.cookies.set(name, value, domain=".foodnetwork.com")
        console.print("[green]✓[/green] Cookies set successfully")

    def load_cookies_from_file(self, filepath: str):
        """
        Load cookies from a JSON file.

        Args:
            filepath: Path to JSON file containing cookies
        """
        with open(filepath, 'r') as f:
            cookies = json.load(f)
        self.set_cookies(cookies)

    def _get_page(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch a page and return parsed BeautifulSoup object."""
        try:
            time.sleep(self.delay)
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return BeautifulSoup(response.text, 'lxml')
        except requests.RequestException as e:
            console.print(f"[red]Error fetching {url}: {e}[/red]")
            return None

    def _extract_json_ld(self, soup: BeautifulSoup) -> Optional[dict]:
        """Extract structured recipe data from JSON-LD script tags."""
        scripts = soup.find_all('script', type='application/ld+json')
        for script in scripts:
            try:
                data = json.loads(script.string)
                # Handle both single object and array formats
                if isinstance(data, list):
                    for item in data:
                        if item.get('@type') == 'Recipe':
                            return item
                elif data.get('@type') == 'Recipe':
                    return data
                elif '@graph' in data:
                    for item in data['@graph']:
                        if item.get('@type') == 'Recipe':
                            return item
            except (json.JSONDecodeError, TypeError):
                continue
        return None

    def scrape_recipe(self, url: str) -> Optional[Recipe]:
        """
        Scrape a single recipe from its URL.

        Args:
            url: Full URL to the recipe page

        Returns:
            Recipe object or None if scraping failed
        """
        console.print(f"[dim]Scraping: {url}[/dim]")

        soup = self._get_page(url)
        if not soup:
            return None

        # Try to get structured data first (most reliable)
        json_ld = self._extract_json_ld(soup)

        if json_ld:
            return self._parse_json_ld(json_ld, url)

        # Fall back to HTML parsing
        return self._parse_html(soup, url)

    def _parse_json_ld(self, data: dict, url: str) -> Recipe:
        """Parse recipe from JSON-LD structured data."""

        def get_time(time_str):
            """Convert ISO 8601 duration to readable format."""
            if not time_str:
                return None
            # Parse PT1H30M format
            match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', time_str)
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
            """Extract instruction text from various formats."""
            if not instructions:
                return []
            if isinstance(instructions, str):
                return [s.strip() for s in instructions.split('\n') if s.strip()]
            if isinstance(instructions, list):
                result = []
                for item in instructions:
                    if isinstance(item, str):
                        result.append(item)
                    elif isinstance(item, dict):
                        if item.get('@type') == 'HowToStep':
                            result.append(item.get('text', ''))
                        elif item.get('@type') == 'HowToSection':
                            # Handle sections with nested steps
                            section_name = item.get('name', '')
                            if section_name:
                                result.append(f"**{section_name}**")
                            for step in item.get('itemListElement', []):
                                if isinstance(step, dict):
                                    result.append(step.get('text', ''))
                return [s for s in result if s]
            return []

        def get_ingredients(ingredients):
            """Extract ingredients from various formats."""
            if not ingredients:
                return []
            if isinstance(ingredients, list):
                return [str(i) for i in ingredients]
            return []

        nutrition = {}
        if 'nutrition' in data and isinstance(data['nutrition'], dict):
            nutrition_data = data['nutrition']
            nutrition_fields = [
                ('calories', 'Calories'),
                ('fatContent', 'Fat'),
                ('saturatedFatContent', 'Saturated Fat'),
                ('cholesterolContent', 'Cholesterol'),
                ('sodiumContent', 'Sodium'),
                ('carbohydrateContent', 'Carbohydrates'),
                ('fiberContent', 'Fiber'),
                ('sugarContent', 'Sugar'),
                ('proteinContent', 'Protein'),
            ]
            for field, label in nutrition_fields:
                if field in nutrition_data:
                    nutrition[label] = nutrition_data[field]

        # Get author
        author = None
        if 'author' in data:
            author_data = data['author']
            if isinstance(author_data, str):
                author = author_data
            elif isinstance(author_data, dict):
                author = author_data.get('name')
            elif isinstance(author_data, list) and author_data:
                first_author = author_data[0]
                author = first_author.get('name') if isinstance(first_author, dict) else str(first_author)

        # Get image URL
        image_url = None
        if 'image' in data:
            image_data = data['image']
            if isinstance(image_data, str):
                image_url = image_data
            elif isinstance(image_data, dict):
                image_url = image_data.get('url')
            elif isinstance(image_data, list) and image_data:
                first_image = image_data[0]
                image_url = first_image.get('url') if isinstance(first_image, dict) else str(first_image)

        # Get categories
        categories = []
        if 'recipeCategory' in data:
            cat = data['recipeCategory']
            categories = cat if isinstance(cat, list) else [cat]
        if 'recipeCuisine' in data:
            cuisine = data['recipeCuisine']
            cuisines = cuisine if isinstance(cuisine, list) else [cuisine]
            categories.extend(cuisines)

        return Recipe(
            title=data.get('name', 'Untitled Recipe'),
            url=url,
            author=author,
            description=data.get('description'),
            prep_time=get_time(data.get('prepTime')),
            cook_time=get_time(data.get('cookTime')),
            total_time=get_time(data.get('totalTime')),
            servings=data.get('recipeYield'),
            difficulty=data.get('difficulty'),
            ingredients=get_ingredients(data.get('recipeIngredient')),
            instructions=get_instructions(data.get('recipeInstructions')),
            image_url=image_url,
            categories=categories,
            nutrition=nutrition,
        )

    def _parse_html(self, soup: BeautifulSoup, url: str) -> Recipe:
        """Parse recipe from HTML when JSON-LD is not available."""

        # Title
        title = "Untitled Recipe"
        title_elem = soup.find('h1', class_=re.compile(r'title|headline', re.I))
        if title_elem:
            title = title_elem.get_text(strip=True)
        elif soup.find('h1'):
            title = soup.find('h1').get_text(strip=True)

        # Author
        author = None
        author_elem = soup.find(class_=re.compile(r'author|byline|chef', re.I))
        if author_elem:
            author = author_elem.get_text(strip=True)

        # Description
        description = None
        desc_elem = soup.find(class_=re.compile(r'description|summary|intro', re.I))
        if desc_elem:
            description = desc_elem.get_text(strip=True)

        # Ingredients
        ingredients = []
        ingredient_container = soup.find(class_=re.compile(r'ingredient', re.I))
        if ingredient_container:
            for item in ingredient_container.find_all(['li', 'p', 'span']):
                text = item.get_text(strip=True)
                if text and len(text) > 2:
                    ingredients.append(text)

        # Instructions
        instructions = []
        instruction_container = soup.find(class_=re.compile(r'instruction|direction|method|step', re.I))
        if instruction_container:
            for item in instruction_container.find_all(['li', 'p']):
                text = item.get_text(strip=True)
                if text and len(text) > 5:
                    instructions.append(text)

        # Image
        image_url = None
        img = soup.find('img', class_=re.compile(r'recipe|hero|main', re.I))
        if img:
            image_url = img.get('src') or img.get('data-src')

        return Recipe(
            title=title,
            url=url,
            author=author,
            description=description,
            ingredients=ingredients,
            instructions=instructions,
            image_url=image_url,
        )

    def get_saved_recipes_urls(self) -> list[str]:
        """
        Get URLs of saved/favorited recipes from your account.

        Note: This requires authentication cookies to be set.

        Returns:
            List of recipe URLs
        """
        # Food Network saved recipes are typically at this URL
        saved_url = f"{self.BASE_URL}/profiles/saved-recipes"

        console.print("[cyan]Fetching saved recipes...[/cyan]")

        urls = []
        page = 1

        while True:
            page_url = f"{saved_url}?page={page}" if page > 1 else saved_url
            soup = self._get_page(page_url)

            if not soup:
                break

            # Look for recipe links
            found_any = False
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '/recipes/' in href and href not in urls:
                    full_url = urljoin(self.BASE_URL, href)
                    # Filter out non-recipe pages
                    if '/recipes/' in full_url and not any(x in full_url for x in ['/photos/', '/videos/', '/packages/']):
                        urls.append(full_url)
                        found_any = True

            # Check for next page
            next_link = soup.find('a', class_=re.compile(r'next|pagination', re.I))
            if not next_link or not found_any:
                break

            page += 1
            if page > 50:  # Safety limit
                break

        console.print(f"[green]Found {len(urls)} recipe URLs[/green]")
        return urls

    def scrape_recipe_list_page(self, url: str) -> list[str]:
        """
        Scrape recipe URLs from a list/collection page.

        Args:
            url: URL of the recipe list page

        Returns:
            List of recipe URLs found on the page
        """
        soup = self._get_page(url)
        if not soup:
            return []

        urls = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/recipes/' in href:
                full_url = urljoin(self.BASE_URL, href)
                # Ensure it's a recipe detail page (usually has recipe name in path)
                parsed = urlparse(full_url)
                path_parts = [p for p in parsed.path.split('/') if p]
                if len(path_parts) >= 2 and path_parts[0] == 'recipes':
                    if full_url not in urls:
                        urls.append(full_url)

        return urls


def save_recipes(recipes: list[Recipe], output_dir: str = "output"):
    """
    Save recipes to JSON and Markdown files.

    Args:
        recipes: List of Recipe objects
        output_dir: Directory to save files
    """
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)

    # Create subdirectories
    json_dir = output_path / "json"
    markdown_dir = output_path / "markdown"
    json_dir.mkdir(exist_ok=True)
    markdown_dir.mkdir(exist_ok=True)

    # Save each recipe
    for recipe in recipes:
        # Create safe filename
        safe_name = re.sub(r'[^\w\s-]', '', recipe.title)
        safe_name = re.sub(r'[-\s]+', '-', safe_name).strip('-').lower()
        safe_name = safe_name[:80]  # Limit length

        # Save JSON
        json_path = json_dir / f"{safe_name}.json"
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(asdict(recipe), f, indent=2, ensure_ascii=False)

        # Save Markdown
        md_path = markdown_dir / f"{safe_name}.md"
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(recipe.to_markdown())

    # Save combined JSON
    all_recipes_path = output_path / "all_recipes.json"
    with open(all_recipes_path, 'w', encoding='utf-8') as f:
        json.dump([asdict(r) for r in recipes], f, indent=2, ensure_ascii=False)

    console.print(f"[green]✓ Saved {len(recipes)} recipes to {output_dir}/[/green]")
    console.print(f"  - Individual JSON files: {json_dir}/")
    console.print(f"  - Individual Markdown files: {markdown_dir}/")
    console.print(f"  - Combined JSON: {all_recipes_path}")


if __name__ == "__main__":
    # Example usage
    console.print("[bold blue]Food Network Recipe Scraper[/bold blue]")
    console.print("See README.md for usage instructions")

