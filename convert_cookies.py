#!/usr/bin/env python3
"""
Cookie Format Converter

Converts cookies exported from browser extensions (array format)
to the simple dict format expected by the scraper.

Usage:
    python convert_cookies.py exported_cookies.json cookies.json
"""

import json
import sys


def convert_cookies(input_file: str, output_file: str):
    """Convert cookie array format to simple dict format."""

    with open(input_file, 'r') as f:
        data = json.load(f)

    # Handle different export formats
    if isinstance(data, dict):
        # Already in dict format, or Netscape format
        if all(isinstance(v, str) for v in data.values()):
            # Already simple dict format
            cookies = data
        else:
            # Some other dict format, try to extract
            cookies = {}
            for key, value in data.items():
                if isinstance(value, str):
                    cookies[key] = value
                elif isinstance(value, dict) and 'value' in value:
                    cookies[key] = value['value']
    elif isinstance(data, list):
        # Array format from extensions like EditThisCookie or Cookie-Editor
        cookies = {}
        for cookie in data:
            if isinstance(cookie, dict):
                name = cookie.get('name')
                value = cookie.get('value')
                if name and value is not None:
                    # Only include foodnetwork.com cookies
                    domain = cookie.get('domain', '')
                    if 'foodnetwork' in domain or not domain:
                        cookies[name] = value
    else:
        print(f"Error: Unexpected format in {input_file}")
        sys.exit(1)

    # Save converted cookies
    with open(output_file, 'w') as f:
        json.dump(cookies, f, indent=2)

    print(f"✓ Converted {len(cookies)} cookies")
    print(f"  Input:  {input_file}")
    print(f"  Output: {output_file}")


def main():
    if len(sys.argv) < 2:
        print("Cookie Format Converter")
        print()
        print("Usage:")
        print("  python convert_cookies.py <input_file> [output_file]")
        print()
        print("Examples:")
        print("  python convert_cookies.py exported_cookies.json cookies.json")
        print("  python convert_cookies.py exported_cookies.json  # outputs to cookies.json")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "cookies.json"

    convert_cookies(input_file, output_file)


if __name__ == "__main__":
    main()

