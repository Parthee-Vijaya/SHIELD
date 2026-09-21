#!/usr/bin/env python3
"""
Scraper til regelrytter.dk - henter danske love og kategorier
Output: data/regelrytter_laws.json
"""

import requests
from bs4 import BeautifulSoup
import json
import time
from datetime import datetime, UTC
from pathlib import Path
import logging
from typing import List, Dict, Any
import urllib3

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = "https://regelrytter.dk"
OUTPUT_FILE = Path("data/regelrytter_laws.json")


def fetch_page(url: str) -> str:
    """Fetch HTML content from URL"""
    try:
        # Disable SSL verification for regelrytter.dk
        response = requests.get(url, timeout=10, verify=False)
        response.raise_for_status()
        return response.text
    except Exception as exc:
        logger.error(f"Failed to fetch {url}: {exc}")
        return ""


def extract_categories(html: str) -> List[Dict[str, Any]]:
    """Extract all law categories from kategorier page"""
    soup = BeautifulSoup(html, 'html.parser')
    categories = []

    # Find all category links
    category_links = soup.find_all('a', href=lambda x: x and '/kategori/' in x)

    seen = set()
    for link in category_links:
        href = link.get('href', '')
        if href.startswith('/kategori/') and href not in seen:
            seen.add(href)
            slug = href.replace('/kategori/', '')
            name = link.get_text(strip=True) or slug.replace('-', ' ').title()

            categories.append({
                'name': name,
                'slug': slug,
                'url': f"{BASE_URL}{href}",
                'lawCount': 0,
                'sampleLaws': []
            })

    logger.info(f"Found {len(categories)} categories")
    return categories


def extract_law_slugs(html: str, category_slug: str) -> List[str]:
    """Extract law slugs from category page"""
    soup = BeautifulSoup(html, 'html.parser')
    law_slugs = []

    # Find all links that are likely laws (not category links)
    links = soup.find_all('a', href=True)

    for link in links:
        href = link.get('href', '')
        # Skip category links, empty links, and anchors
        if (href.startswith('/') and
            '/kategori/' not in href and
            href != '/' and
            not href.startswith('#')):
            slug = href.strip('/').split('/')[-1]
            if slug and slug not in law_slugs and slug != category_slug:
                law_slugs.append(slug)

    # Limit to 20 per category to avoid excessive scraping
    return law_slugs[:20]


def extract_law_details(html: str, slug: str, category: str) -> Dict[str, Any]:
    """Extract detailed law information from law page"""
    soup = BeautifulSoup(html, 'html.parser')

    # Extract title
    title_tag = soup.find('h1')
    title = title_tag.get_text(strip=True) if title_tag else slug.replace('-', ' ').title()

    # Extract law number (e.g., "LOV nr 152 af 21.2.2024")
    law_number = None
    for text in soup.stripped_strings:
        if 'LOV nr' in text or 'Lov nr' in text:
            law_number = text
            break

    # Extract summary from first paragraph
    summary = ""
    paragraphs = soup.find_all('p')
    if paragraphs:
        summary = paragraphs[0].get_text(strip=True)[:300]

    # Count chapters
    chapters = len(soup.find_all(string=lambda x: x and 'Kapitel' in x))

    return {
        'title': title,
        'slug': slug,
        'category': category,
        'url': f"{BASE_URL}/{slug}",
        'lawNumber': law_number,
        'summary': summary if summary else f"Dansk lov om {title.lower()}",
        'content': "Se fuld lovtekst på regelrytter.dk",
        'chapters': chapters if chapters > 0 else None
    }


def main():
    """Main scraping function"""
    logger.info("Starting scraping of regelrytter.dk...")

    # Create data directory if not exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Step 1: Fetch categories
    logger.info("Fetching categories...")
    categories_html = fetch_page(f"{BASE_URL}/kategorier")
    if not categories_html:
        logger.error("Failed to fetch categories page")
        return

    categories = extract_categories(categories_html)

    # Step 2: Fetch law slugs for each category
    total_laws = 0
    for category in categories:
        logger.info(f"Processing category: {category['slug']}")
        category_html = fetch_page(category['url'])

        if category_html:
            law_slugs = extract_law_slugs(category_html, category['slug'])
            category['lawCount'] = len(law_slugs)
            category['sampleLaws'] = law_slugs[:5]  # Store first 5 as samples
            total_laws += len(law_slugs)

        time.sleep(0.5)  # Be nice to the server

    # Step 3: Scrape detailed info for 10 representative laws
    logger.info("Scraping detailed law information...")
    detailed_laws = []

    representative_slugs = [
        'ferieloven',
        'funktionaerloven',
        'ligebehandlingsloven',
        'lov-om-leje',
        'grundloven',
        'straffeloven',
        'forvaltningsloven',
        'persondataloven',
        'selskabsloven',
        'skatteforvaltningsloven'
    ]

    for slug in representative_slugs:
        logger.info(f"  Scraping: {slug}")
        law_html = fetch_page(f"{BASE_URL}/{slug}")

        if law_html:
            # Find category for this law
            law_category = 'anden-lovgivning'  # default
            for cat in categories:
                if slug in cat['sampleLaws']:
                    law_category = cat['slug']
                    break

            law_details = extract_law_details(law_html, slug, law_category)
            detailed_laws.append(law_details)

        time.sleep(0.5)

    # Step 4: Build final JSON structure
    output_data = {
        'metadata': {
            'source': 'regelrytter.dk',
            'scrapedAt': datetime.now(UTC).isoformat(),
            'totalCategories': len(categories),
            'totalLaws': total_laws,
            'detailedLawsScraped': len(detailed_laws)
        },
        'categories': categories,
        'detailedLaws': detailed_laws
    }

    # Write to file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    logger.info(f"\n✅ Scraping complete!")
    logger.info(f"📊 Total categories: {len(categories)}")
    logger.info(f"📊 Total laws: {total_laws}")
    logger.info(f"📊 Detailed laws: {len(detailed_laws)}")
    logger.info(f"📄 Output: {OUTPUT_FILE}")


if __name__ == '__main__':
    main()
