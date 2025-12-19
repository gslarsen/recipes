"""
Firebase Cloud Functions for Pam's Recipe Collection
Handles URL scraping for "Import from Web" feature
"""

import json
import re
from datetime import datetime

from firebase_functions import https_fn
from firebase_admin import initialize_app, firestore

# Initialize Firebase Admin
app = initialize_app()


@https_fn.on_call()
def scrape_recipe(req: https_fn.CallableRequest) -> dict:
    """
    Scrape a recipe from a URL and save it to Firestore.

    Args:
        req: The request object containing the URL to scrape

    Returns:
        dict with success status and recipe data or error message
    """
    # Import here to avoid startup timeout
    import requests
    from bs4 import BeautifulSoup

    # Check authentication
    if not req.auth:
        return {"success": False, "error": "You must be signed in to import recipes."}

    # Get URL from request
    url = req.data.get("url", "").strip()
    if not url:
        return {"success": False, "error": "Please provide a recipe URL."}

    # Validate URL
    if not url.startswith(("http://", "https://")):
        return {"success": False, "error": "Please provide a valid URL starting with http:// or https://"}

    try:
        # Fetch the page
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.text, "html.parser")

        # Try to extract JSON-LD recipe data
        recipe_data = extract_json_ld_recipe(soup, url)

        if not recipe_data:
            # Fallback to HTML parsing
            recipe_data = extract_html_recipe(soup, url)

        if not recipe_data or not recipe_data.get("title"):
            return {"success": False, "error": "Could not find recipe data on this page. Try a different URL."}

        # Add metadata
        recipe_data["date_added"] = datetime.now().isoformat()
        recipe_data["source"] = "imported"
        recipe_data["imported_by"] = req.auth.uid

        # Check for duplicates
        db = firestore.client()
        existing = db.collection("recipes").where("url", "==", url).limit(1).get()
        if list(existing):
            return {"success": False, "error": "This recipe has already been imported."}

        # Save to Firestore
        doc_ref = db.collection("recipes").add(recipe_data)

        return {
            "success": True,
            "recipe": {
                "id": doc_ref[1].id,
                "title": recipe_data.get("title"),
            }
        }

    except requests.exceptions.Timeout:
        return {"success": False, "error": "The website took too long to respond. Please try again."}
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"Could not access the website: {str(e)}"}
    except Exception as e:
        print(f"Error scraping recipe: {e}")
        return {"success": False, "error": "An unexpected error occurred. Please try again."}


def extract_json_ld_recipe(soup, url: str) -> dict | None:
    """Extract recipe data from JSON-LD structured data."""

    scripts = soup.find_all("script", type="application/ld+json")

    for script in scripts:
        try:
            data = json.loads(script.string)
            recipe = find_recipe_in_json_ld(data)
            if recipe:
                return parse_json_ld_recipe(recipe, url)
        except (json.JSONDecodeError, TypeError):
            continue

    return None


def find_recipe_in_json_ld(data) -> dict | None:
    """Find Recipe object in JSON-LD data (handles various structures)."""

    if isinstance(data, dict):
        if data.get("@type") == "Recipe":
            return data
        if "@graph" in data:
            for item in data["@graph"]:
                if isinstance(item, dict) and item.get("@type") == "Recipe":
                    return item
    elif isinstance(data, list):
        for item in data:
            result = find_recipe_in_json_ld(item)
            if result:
                return result

    return None


def parse_json_ld_recipe(data: dict, url: str) -> dict:
    """Parse a JSON-LD Recipe object into our format."""

    recipe = {
        "title": data.get("name", "Untitled Recipe"),
        "url": url,
        "description": data.get("description"),
        "prep_time": data.get("prepTime"),
        "cook_time": data.get("cookTime"),
        "total_time": data.get("totalTime"),
        "servings": parse_yield(data.get("recipeYield")),
        "ingredients": parse_ingredients(data.get("recipeIngredient", [])),
        "instructions": parse_instructions(data.get("recipeInstructions", [])),
        "image_url": parse_image(data.get("image")),
        "author": parse_author(data.get("author")),
        "categories": parse_categories(data),
        "nutrition": parse_nutrition(data.get("nutrition")),
    }

    # Remove None values
    return {k: v for k, v in recipe.items() if v is not None}


def parse_yield(yield_data) -> str | None:
    """Parse recipe yield/servings."""
    if not yield_data:
        return None
    if isinstance(yield_data, list):
        yield_data = yield_data[0] if yield_data else None
    return str(yield_data) if yield_data else None


def parse_ingredients(ingredients) -> list:
    """Parse ingredients list."""
    if not ingredients:
        return []
    if isinstance(ingredients, str):
        return [ingredients]
    return [str(ing) for ing in ingredients if ing]


def parse_instructions(instructions) -> list:
    """Parse instructions list (handles HowToStep, HowToSection, strings)."""
    if not instructions:
        return []

    result = []

    if isinstance(instructions, str):
        return [s.strip() for s in instructions.split("\n") if s.strip()]

    for item in instructions:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            if item.get("@type") == "HowToStep":
                text = item.get("text", "")
                if text:
                    result.append(text)
            elif item.get("@type") == "HowToSection":
                section_name = item.get("name", "")
                if section_name:
                    result.append(f"**{section_name}**")
                for step in item.get("itemListElement", []):
                    if isinstance(step, dict) and step.get("text"):
                        result.append(step["text"])

    return [s for s in result if s]


def parse_image(image_data) -> str | None:
    """Parse image URL from various formats."""
    if not image_data:
        return None
    if isinstance(image_data, str):
        return image_data
    if isinstance(image_data, dict):
        return image_data.get("url")
    if isinstance(image_data, list) and image_data:
        first = image_data[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("url")
    return None


def parse_author(author_data) -> str | None:
    """Parse author from various formats."""
    if not author_data:
        return None
    if isinstance(author_data, str):
        return author_data
    if isinstance(author_data, dict):
        return author_data.get("name")
    if isinstance(author_data, list) and author_data:
        first = author_data[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("name")
    return None


def parse_categories(data: dict) -> list:
    """Parse recipe categories and cuisine."""
    categories = []

    if "recipeCategory" in data:
        cat = data["recipeCategory"]
        if isinstance(cat, list):
            categories.extend(cat)
        else:
            categories.append(cat)

    if "recipeCuisine" in data:
        cuisine = data["recipeCuisine"]
        if isinstance(cuisine, list):
            categories.extend(cuisine)
        else:
            categories.append(cuisine)

    return categories if categories else None


def parse_nutrition(nutrition_data) -> dict | None:
    """Parse nutrition information."""
    if not nutrition_data or not isinstance(nutrition_data, dict):
        return None

    fields = [
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

    result = {}
    for field, label in fields:
        if field in nutrition_data:
            result[label] = nutrition_data[field]

    return result if result else None


def extract_html_recipe(soup, url: str) -> dict | None:
    """Fallback: Extract recipe from common HTML patterns."""

    # Try to get title
    title = None
    title_selectors = [
        "h1.recipe-title",
        "h1.entry-title",
        ".recipe-name",
        "h1",
    ]
    for selector in title_selectors:
        el = soup.select_one(selector)
        if el:
            title = el.get_text(strip=True)
            break

    if not title:
        return None

    # Try to get ingredients
    ingredients = []
    ingredient_selectors = [
        ".wprm-recipe-ingredient",
        ".tasty-recipes-ingredients li",
        '[itemprop="recipeIngredient"]',
        ".recipe-ingredients li",
        ".ingredients li",
    ]
    for selector in ingredient_selectors:
        items = soup.select(selector)
        if items:
            ingredients = [item.get_text(strip=True) for item in items]
            break

    # Try to get instructions
    instructions = []
    instruction_selectors = [
        ".wprm-recipe-instruction",
        ".tasty-recipes-instructions li",
        '[itemprop="recipeInstructions"]',
        ".recipe-instructions li",
        ".instructions li",
        ".recipe-directions li",
    ]
    for selector in instruction_selectors:
        items = soup.select(selector)
        if items:
            instructions = [item.get_text(strip=True) for item in items]
            break

    # Try to get image
    image_url = None
    img_selectors = [
        ".recipe-image img",
        ".entry-content img",
        '[itemprop="image"]',
        ".post-thumbnail img",
    ]
    for selector in img_selectors:
        el = soup.select_one(selector)
        if el:
            image_url = el.get("src") or el.get("data-src")
            break

    return {
        "title": title,
        "url": url,
        "ingredients": ingredients,
        "instructions": instructions,
        "image_url": image_url,
    }
