#!/usr/bin/env python3
"""
Build script for Pam's Recipe Collection

This script bundles the recipe data and web assets into a single
self-contained HTML file that can be opened directly in any browser.

Usage:
    python build_app.py

Output:
    Creates 'pams-recipes.html' in the current directory
"""

import json
import os
import shutil
from pathlib import Path
from datetime import datetime

# Paths
SCRIPT_DIR = Path(__file__).parent
JSON_PATH = SCRIPT_DIR / "output" / "all_recipes_final.json"
CSS_PATH = SCRIPT_DIR / "web" / "styles.css"
JS_PATH = SCRIPT_DIR / "web" / "app.js"
OUTPUT_PATH = SCRIPT_DIR / "pams-recipes.html"
DOCS_PATH = SCRIPT_DIR / "docs" / "index.html"  # For GitHub Pages
IMAGES_DIR = SCRIPT_DIR / "images"
DOCS_IMAGES_DIR = SCRIPT_DIR / "docs" / "images"


def load_recipes():
    """Load recipes from JSON file."""
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def prepare_recipes_for_web(recipes):
    """
    Prepare recipes for the web app.
    Uses local images when available, falls back to URLs.
    """
    prepared = []
    local_images_used = 0
    
    for recipe in recipes:
        r = recipe.copy()
        
        # Check if we have a local image
        local_path = r.get('local_image_path')
        if local_path and (SCRIPT_DIR / local_path).exists():
            # For GitHub Pages, images will be in same directory
            r['image_url'] = local_path.replace('images/', 'images/')
            local_images_used += 1
        # Otherwise keep the original image_url (or None)
        
        prepared.append(r)
    
    return prepared, local_images_used


def copy_images_to_docs():
    """Copy images to docs folder for GitHub Pages."""
    if not IMAGES_DIR.exists():
        return 0
    
    # Create docs/images directory
    DOCS_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    
    # Copy all images
    count = 0
    for img_file in IMAGES_DIR.glob('*'):
        if img_file.is_file():
            shutil.copy2(img_file, DOCS_IMAGES_DIR / img_file.name)
            count += 1
    
    return count


def load_css():
    """Load CSS file."""
    with open(CSS_PATH, 'r', encoding='utf-8') as f:
        return f.read()


def load_js():
    """Load JS file."""
    with open(JS_PATH, 'r', encoding='utf-8') as f:
        return f.read()


def create_embedded_js(recipes, original_js):
    """Create JS that uses embedded recipe data."""

    # Serialize recipes to JSON, escaping for safe embedding in <script> tags
    # Use ensure_ascii=True to convert unicode to \uXXXX escapes
    recipes_json = json.dumps(recipes, ensure_ascii=True)
    # Escape any </script> that might appear in recipe content
    recipes_json = recipes_json.replace('</script>', '<\\/script>')

    # Replace the entire loadRecipes function with a simple synchronous version
    # This is more compatible with iOS Safari when opening local HTML files

    # Find and replace the loadRecipes function
    old_load_function = '''// Load recipes from JSON file
async function loadRecipes() {
    try {
        const response = await fetch('../output/all_recipes_final.json');
        allRecipes = await response.json();
        filteredRecipes = [...allRecipes];
        renderRecipes();
    } catch (error) {
        console.error('Failed to load recipes:', error);
        recipeGrid.innerHTML = `
            <div class="loading">
                <p>Unable to load recipes. Please ensure the JSON file is accessible.</p>
            </div>
        `;
    }
}'''

    new_load_function = '''// Load recipes from embedded data
async function loadRecipes() {
    allRecipes = EMBEDDED_RECIPES;
    filteredRecipes = [...allRecipes];
    renderRecipes();
}'''

    modified_js = original_js.replace(old_load_function, new_load_function)

    # If the exact match didn't work, try a simpler replacement
    if 'EMBEDDED_RECIPES' not in modified_js:
        # Just replace the fetch line
        modified_js = original_js.replace(
            "const response = await fetch('../output/all_recipes_final.json');",
            "// Using embedded data"
        ).replace(
            "allRecipes = await response.json();",
            "allRecipes = EMBEDDED_RECIPES;"
        )

    # Prepend the embedded data
    embedded_js = f'''// Embedded recipe data ({len(recipes)} recipes)
var EMBEDDED_RECIPES = {recipes_json};

{modified_js}'''

    return embedded_js


def build_html(css, js, recipe_count):
    """Build the complete HTML file."""
    build_date = datetime.now().strftime("%B %d, %Y")

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pam's Recipe Collection</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap" rel="stylesheet">
    <style>
{css}
    </style>
</head>
<body>
    <header class="site-header">
        <div class="header-content">
            <h1 class="site-title">Pam's Recipe Collection</h1>
            <div class="search-container">
                <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" id="searchInput" placeholder="Search recipes..." class="search-input">
            </div>
            <div class="sort-container">
                <label for="sortSelect">Sort by:</label>
                <select id="sortSelect" class="sort-select">
                    <option value="newest">Newest</option>
                    <option value="az">A-Z</option>
                    <option value="za">Z-A</option>
                    <option value="author">Author</option>
                </select>
            </div>
        </div>
        <div class="recipe-count">
            <span id="recipeCount">0</span> recipes
        </div>
    </header>

    <main class="main-content">
        <div class="recipe-grid" id="recipeGrid">
            <!-- Recipe cards will be inserted here -->
        </div>
    </main>

    <!-- Recipe Detail Modal -->
    <div class="modal-overlay" id="modalOverlay">
        <div class="modal" id="recipeModal">
            <button class="modal-close" id="modalClose" aria-label="Close recipe">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path>
                </svg>
            </button>
            <div class="modal-content" id="modalContent">
                <!-- Recipe details will be inserted here -->
            </div>
        </div>
    </div>

    <!-- Build info (hidden) -->
    <!-- Built: {build_date} | Recipes: {recipe_count} -->

    <script>
{js}
    </script>
</body>
</html>'''


def main():
    print("🍳 Building Pam's Recipe Collection...")
    print()

    # Load resources
    print("📖 Loading recipes...")
    recipes = load_recipes()
    recipe_count = len(recipes)
    print(f"   Found {recipe_count} recipes")

    # Prepare recipes (use local images when available)
    print("🖼️  Preparing images...")
    prepared_recipes, local_count = prepare_recipes_for_web(recipes)
    print(f"   Using {local_count} local images")

    print("🎨 Loading styles...")
    css = load_css()

    print("⚙️  Loading scripts...")
    js = load_js()

    print("📦 Bundling application...")
    embedded_js = create_embedded_js(prepared_recipes, js)
    html = build_html(css, embedded_js, recipe_count)

    # Write output
    print(f"💾 Writing to {OUTPUT_PATH.name}...")
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write(html)

    # Also write to docs folder for GitHub Pages
    DOCS_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"💾 Writing to docs/index.html (for GitHub Pages)...")
    with open(DOCS_PATH, 'w', encoding='utf-8') as f:
        f.write(html)

    # Copy images to docs folder
    if IMAGES_DIR.exists():
        print("🖼️  Copying images to docs/images/...")
        img_count = copy_images_to_docs()
        print(f"   Copied {img_count} images")

    # Get file size
    file_size = OUTPUT_PATH.stat().st_size
    if file_size > 1024 * 1024:
        size_str = f"{file_size / (1024 * 1024):.1f} MB"
    else:
        size_str = f"{file_size / 1024:.0f} KB"

    print()
    print("✅ Build complete!")
    print()
    print(f"   📁 Local file: {OUTPUT_PATH}")
    print(f"   🌐 GitHub Pages: docs/index.html")
    print(f"   📊 Size: {size_str}")
    print(f"   🍽️  Recipes: {recipe_count}")
    print()
    print("   Next steps:")
    print("   1. git add docs/")
    print("   2. git commit -m 'Update recipes'")
    print("   3. git push")
    print()
    print("   Pam's URL: https://gslarsen.github.io/recipes/")
    print()


if __name__ == "__main__":
    main()

