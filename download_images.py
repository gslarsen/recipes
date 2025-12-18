#!/usr/bin/env python3
"""
Download Recipe Images

Downloads all recipe images from their URLs and stores them locally.
Updates the JSON file to use local image paths.

Usage:
    python download_images.py

This will:
1. Download images to images/ folder
2. Update output/all_recipes_final.json with local paths
3. Create a backup of the original JSON
"""

import json
import os
import re
import hashlib
import shutil
from pathlib import Path
from urllib.parse import urlparse
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Paths
SCRIPT_DIR = Path(__file__).parent
JSON_PATH = SCRIPT_DIR / "output" / "all_recipes_final.json"
IMAGES_DIR = SCRIPT_DIR / "images"
BACKUP_DIR = SCRIPT_DIR / "output" / "backups"


def slugify(text):
    """Convert text to a URL-friendly slug."""
    if not text:
        return "unknown"
    # Convert to lowercase
    text = text.lower()
    # Replace special characters with hyphens
    text = re.sub(r'[^\w\s-]', '', text)
    # Replace whitespace with hyphens
    text = re.sub(r'[\s_]+', '-', text)
    # Remove leading/trailing hyphens
    text = text.strip('-')
    # Limit length
    return text[:80] if text else "unknown"


def get_image_extension(url, content_type=None):
    """Determine the image extension from URL or content type."""
    # Try to get from URL
    parsed = urlparse(url)
    path = parsed.path.lower()
    
    if '.jpg' in path or '.jpeg' in path:
        return '.jpg'
    elif '.png' in path:
        return '.png'
    elif '.gif' in path:
        return '.gif'
    elif '.webp' in path:
        return '.webp'
    
    # Try content type
    if content_type:
        if 'jpeg' in content_type or 'jpg' in content_type:
            return '.jpg'
        elif 'png' in content_type:
            return '.png'
        elif 'gif' in content_type:
            return '.gif'
        elif 'webp' in content_type:
            return '.webp'
    
    # Default to jpg
    return '.jpg'


def download_image(recipe, images_dir):
    """Download a single image and return the local path."""
    url = recipe.get('image_url')
    title = recipe.get('title', 'unknown')
    
    if not url:
        return None, "No URL"
    
    # Create filename from title
    slug = slugify(title)
    
    # Add hash of URL to handle duplicates with same title
    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
    
    try:
        # Download the image
        response = requests.get(url, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        response.raise_for_status()
        
        # Determine extension
        content_type = response.headers.get('content-type', '')
        ext = get_image_extension(url, content_type)
        
        # Create filename
        filename = f"{slug}-{url_hash}{ext}"
        filepath = images_dir / filename
        
        # Save the image
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        # Return relative path for JSON
        return f"images/{filename}", None
        
    except requests.exceptions.RequestException as e:
        return None, str(e)
    except Exception as e:
        return None, str(e)


def main():
    print("🖼️  Recipe Image Downloader")
    print("=" * 50)
    print()
    
    # Create directories
    IMAGES_DIR.mkdir(exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load recipes
    print("📖 Loading recipes...")
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        recipes = json.load(f)
    
    total = len(recipes)
    print(f"   Found {total} recipes")
    
    # Count recipes with images
    with_images = sum(1 for r in recipes if r.get('image_url'))
    print(f"   {with_images} have image URLs")
    print()
    
    # Backup original JSON
    backup_name = f"all_recipes_final_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    backup_path = BACKUP_DIR / backup_name
    print(f"💾 Backing up to {backup_name}...")
    shutil.copy(JSON_PATH, backup_path)
    
    # Download images
    print()
    print("⬇️  Downloading images...")
    print()
    
    success_count = 0
    fail_count = 0
    skip_count = 0
    
    for i, recipe in enumerate(recipes, 1):
        title = recipe.get('title', 'Unknown')[:40]
        url = recipe.get('image_url')
        
        if not url:
            skip_count += 1
            print(f"   [{i}/{total}] ⏭️  {title} (no URL)")
            continue
        
        # Check if already downloaded (by checking if local_image_path exists)
        existing_local = recipe.get('local_image_path')
        if existing_local and (SCRIPT_DIR / existing_local).exists():
            skip_count += 1
            print(f"   [{i}/{total}] ✓  {title} (already downloaded)")
            continue
        
        local_path, error = download_image(recipe, IMAGES_DIR)
        
        if local_path:
            recipe['local_image_path'] = local_path
            recipe['original_image_url'] = url  # Keep original as backup
            success_count += 1
            print(f"   [{i}/{total}] ✅ {title}")
        else:
            fail_count += 1
            print(f"   [{i}/{total}] ❌ {title} - {error}")
    
    # Save updated JSON
    print()
    print("💾 Saving updated recipes...")
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(recipes, f, indent=2, ensure_ascii=False)
    
    # Calculate folder size
    total_size = sum(f.stat().st_size for f in IMAGES_DIR.glob('*') if f.is_file())
    if total_size > 1024 * 1024:
        size_str = f"{total_size / (1024 * 1024):.1f} MB"
    else:
        size_str = f"{total_size / 1024:.0f} KB"
    
    # Summary
    print()
    print("=" * 50)
    print("✅ Download complete!")
    print()
    print(f"   ✅ Downloaded: {success_count}")
    print(f"   ⏭️  Skipped:    {skip_count}")
    print(f"   ❌ Failed:     {fail_count}")
    print(f"   📁 Total size: {size_str}")
    print()
    print("   Images saved to: images/")
    print("   JSON updated with local_image_path")
    print()
    print("   Next: Run 'python build_app.py' to rebuild the app")
    print()


if __name__ == "__main__":
    main()

