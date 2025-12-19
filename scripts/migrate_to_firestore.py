#!/usr/bin/env python3
"""
Migrate recipes from all_recipes_final.json to Firebase Firestore.

Prerequisites:
1. Install firebase-admin: pip install firebase-admin
2. Download service account key from Firebase Console
3. Set GOOGLE_APPLICATION_CREDENTIALS environment variable

Usage:
    python scripts/migrate_to_firestore.py
"""

import json
import os
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore, storage
except ImportError:
    print("Please install firebase-admin: pip install firebase-admin")
    exit(1)

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
RECIPES_JSON = PROJECT_ROOT / "output" / "all_recipes_final.json"
IMAGES_DIR = PROJECT_ROOT / "images"

def init_firebase():
    """Initialize Firebase Admin SDK."""
    # Check for credentials
    cred_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if not cred_path:
        # Look for service account key in project
        possible_paths = [
            PROJECT_ROOT / "firebase" / "service-account-key.json",
            PROJECT_ROOT / "service-account-key.json",
        ]
        for p in possible_paths:
            if p.exists():
                cred_path = str(p)
                break
    
    if not cred_path:
        print("❌ No Firebase credentials found!")
        print("   Download service account key from Firebase Console:")
        print("   Project Settings > Service Accounts > Generate New Private Key")
        print("   Save as: firebase/service-account-key.json")
        exit(1)
    
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred, {
        'storageBucket': 'pams-recipes.appspot.com'  # Update with your bucket
    })
    
    return firestore.client(), storage.bucket()


def migrate_recipes(db, bucket):
    """Migrate all recipes to Firestore."""
    # Load recipes
    with open(RECIPES_JSON, 'r') as f:
        recipes = json.load(f)
    
    print(f"📚 Found {len(recipes)} recipes to migrate")
    
    # Get existing recipes to avoid duplicates
    existing_urls = set()
    for doc in db.collection('recipes').stream():
        data = doc.to_dict()
        if 'url' in data:
            existing_urls.add(data['url'])
    
    print(f"📋 {len(existing_urls)} recipes already in Firestore")
    
    batch = db.batch()
    batch_count = 0
    migrated = 0
    skipped = 0
    
    for i, recipe in enumerate(recipes):
        # Skip if already exists
        if recipe.get('url') in existing_urls:
            skipped += 1
            continue
        
        # Prepare recipe document
        doc_data = {
            'title': recipe.get('title', 'Untitled'),
            'url': recipe.get('url', ''),
            'author': recipe.get('author'),
            'description': recipe.get('description'),
            'prep_time': recipe.get('prep_time'),
            'cook_time': recipe.get('cook_time'),
            'total_time': recipe.get('total_time'),
            'servings': recipe.get('servings'),
            'difficulty': recipe.get('difficulty'),
            'ingredients': recipe.get('ingredients', []),
            'instructions': recipe.get('instructions', []),
            'categories': recipe.get('categories', []),
            'nutrition': recipe.get('nutrition', {}),
            'image_url': recipe.get('image_url'),
            'local_image_path': recipe.get('local_image_path'),
            'date_added': recipe.get('date_added'),
            'source': 'migration',  # Mark as migrated from original collection
        }
        
        # Remove None values
        doc_data = {k: v for k, v in doc_data.items() if v is not None}
        
        # Add to batch
        doc_ref = db.collection('recipes').document()
        batch.set(doc_ref, doc_data)
        batch_count += 1
        migrated += 1
        
        # Commit batch every 500 documents (Firestore limit)
        if batch_count >= 500:
            print(f"   Committing batch ({migrated} recipes)...")
            batch.commit()
            batch = db.batch()
            batch_count = 0
    
    # Commit remaining
    if batch_count > 0:
        batch.commit()
    
    print(f"\n✅ Migration complete!")
    print(f"   Migrated: {migrated}")
    print(f"   Skipped (already exists): {skipped}")


def upload_images(bucket):
    """Upload local images to Cloud Storage."""
    if not IMAGES_DIR.exists():
        print("⚠️  No images directory found, skipping image upload")
        return
    
    images = list(IMAGES_DIR.glob("*.jpg")) + list(IMAGES_DIR.glob("*.png")) + list(IMAGES_DIR.glob("*.webp"))
    print(f"\n📷 Found {len(images)} images to upload")
    
    uploaded = 0
    skipped = 0
    
    for img_path in images:
        blob_name = f"images/{img_path.name}"
        blob = bucket.blob(blob_name)
        
        # Skip if already exists
        if blob.exists():
            skipped += 1
            continue
        
        # Upload
        content_type = 'image/jpeg'
        if img_path.suffix == '.png':
            content_type = 'image/png'
        elif img_path.suffix == '.webp':
            content_type = 'image/webp'
        
        blob.upload_from_filename(str(img_path), content_type=content_type)
        blob.make_public()  # Make image publicly accessible
        uploaded += 1
        
        if uploaded % 50 == 0:
            print(f"   Uploaded {uploaded} images...")
    
    print(f"\n✅ Image upload complete!")
    print(f"   Uploaded: {uploaded}")
    print(f"   Skipped (already exists): {skipped}")


def main():
    print("🚀 Starting Firebase migration...\n")
    
    db, bucket = init_firebase()
    
    migrate_recipes(db, bucket)
    upload_images(bucket)
    
    print("\n🎉 All done!")


if __name__ == "__main__":
    main()

