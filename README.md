# Food Network Recipe Scraper

A Python tool to backup your favorite recipes from Food Network. Export recipes to JSON and Markdown formats for offline access.

## Features

- 🍳 Scrape individual recipes by URL
- 📚 Batch scrape from a list of URLs
- 🗂️ Scrape entire collection/gallery pages
- 💾 Save your favorited recipes (requires login cookies)
- 📄 Export to both JSON and Markdown formats
- 🎨 Beautiful CLI with progress indicators

## Installation

```bash
# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Quick Start

### Scrape a Single Recipe

```bash
python cli.py scrape "https://www.foodnetwork.com/recipes/ina-garten/perfect-roast-chicken-recipe-1940592"
```

### Scrape Multiple Recipes

Create a file `my_recipes.txt` with one URL per line:

```
https://www.foodnetwork.com/recipes/ina-garten/perfect-roast-chicken-recipe-1940592
https://www.foodnetwork.com/recipes/alton-brown/good-eats-meatloaf-recipe-1937673
https://www.foodnetwork.com/recipes/food-network-kitchen/pancakes-recipe-1913844
```

Then run:

```bash
python cli.py scrape-list my_recipes.txt
```

### Scrape a Collection Page

```bash
python cli.py scrape-collection "https://www.foodnetwork.com/recipes/photos/our-best-chicken-recipes"
```

### Scrape Your Saved Recipes

This requires exporting your authentication cookies (see below):

```bash
python cli.py scrape-saved --cookies cookies.json
```

## Output Structure

Recipes are saved to the `output/` directory (customizable with `--output`):

```
output/
├── all_recipes.json      # Combined JSON with all recipes
├── json/
│   ├── perfect-roast-chicken.json
│   └── ...
└── markdown/
    ├── perfect-roast-chicken.md
    └── ...
```

## Exporting Browser Cookies

To access your saved/favorited recipes, you need to export cookies from your browser while logged into Food Network.

### Method 1: Cookie-Editor Extension (Recommended)

1. Install the [Cookie-Editor](https://cookie-editor.cgagnier.ca/) extension for your browser
2. Log into [foodnetwork.com](https://www.foodnetwork.com)
3. Click the Cookie-Editor extension icon
4. Click **Export** → **Export as JSON**
5. Save to a file named `cookies.json`
6. Convert to the simple format (see below)

### Method 2: EditThisCookie Extension

1. Install [EditThisCookie](https://www.editthiscookie.com/) for Chrome
2. Log into Food Network
3. Click the extension icon and click Export
4. Save to a file and convert to simple format

### Cookie Format

The scraper expects a simple JSON object format:

```json
{
    "cookie_name_1": "cookie_value_1",
    "cookie_name_2": "cookie_value_2"
}
```

If your extension exports an array format, you can convert it with this Python snippet:

```python
import json

# Load exported cookies (array format from extension)
with open('exported_cookies.json') as f:
    cookies_array = json.load(f)

# Convert to simple dict format
cookies_dict = {c['name']: c['value'] for c in cookies_array}

# Save in the format the scraper expects
with open('cookies.json', 'w') as f:
    json.dump(cookies_dict, f, indent=2)
```

Or run the built-in helper:

```bash
python cli.py cookie-help
```

## Command Reference

### `scrape` - Single Recipe

```bash
python cli.py scrape URL [options]

Options:
  --output, -o DIR     Output directory (default: output)
  --cookies, -c FILE   Cookies JSON file for authentication
  --delay, -d SECONDS  Delay between requests (default: 1.0)
```

### `scrape-list` - Multiple URLs

```bash
python cli.py scrape-list FILE [options]

Options:
  --output, -o DIR     Output directory (default: output)
  --cookies, -c FILE   Cookies JSON file
  --delay, -d SECONDS  Delay between requests (default: 1.0)
```

### `scrape-collection` - Collection Page

```bash
python cli.py scrape-collection URL [options]

Options:
  --output, -o DIR     Output directory (default: output)
  --cookies, -c FILE   Cookies JSON file
  --limit, -l NUMBER   Maximum recipes to scrape
  --delay, -d SECONDS  Delay between requests (default: 1.0)
```

### `scrape-saved` - Your Saved Recipes

```bash
python cli.py scrape-saved --cookies FILE [options]

Options:
  --cookies, -c FILE   Cookies JSON file (required)
  --output, -o DIR     Output directory (default: output)
  --limit, -l NUMBER   Maximum recipes to scrape
  --delay, -d SECONDS  Delay between requests (default: 1.5)
```

## Example Markdown Output

```markdown
# Perfect Roast Chicken

**Author:** Ina Garten

> Crispy skin, juicy meat, and simple preparation make this the perfect roast chicken.

**Prep Time:** 15m | **Cook Time:** 1h 30m | **Servings:** 4

## Ingredients

- 1 (5-pound) roasting chicken
- Kosher salt
- Freshly ground black pepper
- 1 large bunch fresh thyme
- 1 lemon, halved
- 1 head garlic, cut in half crosswise
- 2 tablespoons butter, melted

## Instructions

1. Preheat the oven to 425 degrees F.
2. Remove the chicken giblets. Rinse the chicken inside and out...
...
```

## Tips

- **Rate Limiting**: The default delay of 1 second between requests is respectful to the server. Increase it if you're scraping many recipes.
- **Cookies Expire**: If saved recipe scraping stops working, re-export your cookies.
- **Large Collections**: Use `--limit` to test with a few recipes first.

## Troubleshooting

### "No saved recipes found"

- Make sure you're logged into Food Network in your browser
- Re-export your cookies (they may have expired)
- Check that the cookie format is correct

### "Failed to scrape recipe"

- The recipe page structure may have changed
- Some recipes may be behind a paywall
- Try increasing the delay with `--delay 2`

### Missing ingredients or instructions

- Food Network occasionally changes their HTML structure
- The scraper uses JSON-LD structured data when available (most reliable)
- Open an issue if you find consistent problems with specific recipes

## License

MIT License - Use at your own risk. This tool is for personal backup purposes only.

## Disclaimer

This tool is for personal use to backup recipes you have access to. Please respect Food Network's terms of service and don't use this for commercial purposes or to redistribute copyrighted content.

