# Pam's Recipe Collection

A personal recipe management system with a beautiful web interface and cloud backend.

---

## I. Recipe Collection Web App

A modern, responsive web application for browsing, searching, and managing a personal recipe collection. Built with Firebase for real-time data sync and secure authentication.

### 🌐 Live Site

**[pams-recipes.web.app](https://pams-recipes.web.app)**

### Features

- 🍳 **Browse 310+ recipes** with beautiful card-based UI
- 🔍 **Search** across titles, authors, and ingredients
- 📱 **Responsive design** - works great on desktop, tablet, and mobile
- ➕ **Add recipes** three ways:
  - **Create Personal Recipe** - manual entry with photo upload
  - **Import from Web** - paste a URL from most recipe sites
  - **Bookmarklet** - save recipes from protected sites (Food Network, America's Test Kitchen) directly from your browser
- 🗑️ **Delete recipes** you no longer want
- 🔐 **Secure** - Google sign-in required to add/edit/delete; anyone can view
- 🖨️ **Print-friendly** recipe detail view

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla HTML/CSS/JS |
| Database | Firebase Firestore |
| Images | Firebase Cloud Storage |
| Hosting | Firebase Hosting |
| Auth | Firebase Authentication (Google) |

### Adding Recipes

#### Option 1: Create Personal Recipe
1. Sign in with Google
2. Click "Create Personal Recipe"
3. Fill in the details and optionally upload a photo
4. Click "Save Recipe"

#### Option 2: Import from URL
1. Sign in with Google
2. Click "Import from Web"
3. Paste a recipe URL (works with AllRecipes, Epicurious, and many others)
4. Click "Import Recipe"

#### Option 3: Bookmarklet (for protected sites)
For sites with bot protection (Food Network, America's Test Kitchen):
1. Visit [pams-recipes.web.app/bookmarklet.html](https://pams-recipes.web.app/bookmarklet.html)
2. Follow the instructions to add the bookmarklet to your browser
3. Navigate to any recipe page and click the bookmarklet to save it

### Project Structure

```
firebase/
├── public/           # Frontend files
│   ├── index.html    # Main app
│   ├── styles.css    # Styling
│   ├── app.js        # Application logic
│   ├── save.html     # Bookmarklet save handler
│   └── bookmarklet.html  # Bookmarklet instructions
├── firestore.rules   # Database security rules
├── storage.rules     # File storage security rules
└── firebase.json     # Firebase configuration
```

### Deployment

```bash
cd firebase
firebase deploy --only hosting
```

To update security rules:
```bash
firebase deploy --only firestore:rules,storage
```

---

# II. Food Network Recipe Scraper

A Python tool to backup your saved recipes from Food Network. Uses browser automation for reliable scraping and exports to JSON and Markdown formats.

## Features

- 🍳 Scrape individual recipes by URL
- 💾 Scrape all your saved/favorited recipes
- 📄 Export to both JSON and Markdown formats
- 🔐 Browser-based login (no manual cookie handling)

## Installation

```bash
# Create a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium
```

## Quick Start

### 1. Log In (First Time Setup)

```bash
python browser_scraper.py login
```

This opens a browser window. Log into your Food Network account, then close the browser. Your session is saved automatically to `.browser_state/`.

### 2. Scrape Your Saved Recipes

```bash
python browser_scraper.py scrape-saved
```

### 3. Add Individual Recipes

```bash
python scrape_url.py "https://www.foodnetwork.com/recipes/ina-garten/perfect-roast-chicken-recipe-1940592"
```

Or multiple at once:

```bash
python scrape_url.py url1 url2 url3
```

## Output Structure

```
output/
├── all_recipes_final.json    # All recipes in JSON format
└── markdown_final/
    ├── perfect-roast-chicken.md
    ├── meatloaf.md
    └── ...
```

## Command Reference

### `login` - Authenticate

```bash
python browser_scraper.py login
```

Opens a browser for you to log in. Session is saved for future use.

### `scrape-saved` - All Saved Recipes

```bash
python browser_scraper.py scrape-saved [options]

Options:
  --output, -o DIR      Output directory (default: output)
  --visible            Show browser window while scraping
  --limit, -l NUMBER   Maximum recipes to scrape
```

### `scrape` - Single Recipe

```bash
python browser_scraper.py scrape "URL" [options]

Options:
  --output, -o DIR     Output directory (default: output)
  --visible           Show browser window
```

### `scrape_url.py` - Quick Add

The simplest way to add new recipes to your collection:

```bash
python scrape_url.py "URL"
```

This automatically:
- Scrapes the recipe
- Adds it to `all_recipes_final.json`
- Creates a markdown file in `markdown_final/`

## Example Markdown Output

```markdown
# Perfect Roast Chicken

**By:** Ina Garten

> Crispy skin, juicy meat, and simple preparation.

**Prep:** 15 min | **Cook:** 1 hr 30 min | **Servings:** 4

## Ingredients

- 1 (5-pound) roasting chicken
- Kosher salt
- Freshly ground black pepper
- 1 large bunch fresh thyme
- 1 lemon, halved
- 1 head garlic, cut in half crosswise

## Instructions

1. Preheat the oven to 425 degrees F.
2. Remove the chicken giblets...
```

## Re-authenticating

If your session expires:

```bash
python browser_scraper.py login
```

Log in again and close the browser. Your new session replaces the old one.

## Current Collection

| Status | Count | Notes |
|--------|-------|-------|
| ✅ Complete | 305 | Ingredients + instructions |
| ✅ Narrative | 2 | Ingredients embedded in instructions |
| ⚠️ Mashed format | 1 | All ingredients in one string |
| ⚠️ Ingredients only | 2 | No instructions available |
| **Total** | **310** | |

## License

MIT License - For personal backup purposes only.

## Disclaimer

This tool is for personal use to backup recipes you have access to. Please respect Food Network's terms of service.
