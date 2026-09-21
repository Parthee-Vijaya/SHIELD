#!/usr/bin/env python3
"""
Enhanced scraper for regelrytter.dk - extracts full law text with chapters
Saves each law as markdown files in data/laws/ as fallback
"""

import requests
from bs4 import BeautifulSoup
import json
import time
from datetime import datetime, UTC
from pathlib import Path
import logging
from typing import List, Dict, Any, Optional
import urllib3
import re

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = "https://regelrytter.dk"
OUTPUT_FILE = Path("data/regelrytter_laws_full.json")
LAWS_DIR = Path("data/laws")


def fetch_page(url: str) -> str:
    """Fetch HTML content from URL"""
    try:
        response = requests.get(url, timeout=15, verify=False)
        response.raise_for_status()
        return response.text
    except Exception as exc:
        logger.error(f"Failed to fetch {url}: {exc}")
        return ""


def clean_text(text: str) -> str:
    """Clean and normalize text"""
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove leading/trailing whitespace
    text = text.strip()
    return text


def extract_law_content(html: str) -> Dict[str, Any]:
    """Extract full law content from a law page"""
    soup = BeautifulSoup(html, 'html.parser')

    # Remove unwanted elements (navigation, scripts, styles, etc.)
    for unwanted in soup.find_all(['script', 'style', 'nav', 'header', 'footer', 'aside', 'button', 'form']):
        unwanted.decompose()

    # Extract title
    title_tag = soup.find('h1')
    title = clean_text(title_tag.get_text()) if title_tag else ""

    # Extract law number
    law_number = None
    for text in soup.stripped_strings:
        if 'LOV nr' in text or 'Lov nr' in text:
            law_number = text
            break

    # Extract main content - look for law text specifically
    content_parts = []

    # Target specific patterns in regelrytter.dk structure
    # Look for paragraphs that contain "Stk." (stykke - paragraph in Danish law)
    paragraphs = soup.find_all('p')

    for p in paragraphs:
        text = clean_text(p.get_text())

        # Filter out navigation, short snippets, and common UI elements
        if (len(text) < 20 or
            'Forrige' in text or
            'Næste' in text or
            'Kapitel' in text and len(text) < 50 or
            'Stil et spørgsmål' in text or
            'Foreslåede spørgsmål' in text or
            'Hej! Jeg kan hjælpe' in text or
            'Hele lovteksten er inkluderet' in text or
            'Send' == text or
            'Berig med AI' in text or
            'Hvad er hovedformålet' in text or
            'Giv et eksempel' in text):
            continue

        # Include if it looks like actual law text
        if ('Stk.' in text or
            '§' in text and len(text) > 30 or
            'nr' in text and 'LOV' in text or
            len(text) > 100):  # Longer text is likely substantial content
            content_parts.append(text)

    full_content = "\n\n".join(content_parts) if content_parts else ""

    # Extract summary (first meaningful paragraph with legal content)
    summary = ""
    for part in content_parts[:3]:  # Check first 3 content parts
        if 'Stk.' in part or len(part) > 100:
            summary = part[:500]
            break

    return {
        'title': title,
        'law_number': law_number,
        'summary': summary,
        'content': full_content
    }


def scrape_law_chapters(law_slug: str, max_chapters: int = 50) -> List[Dict[str, Any]]:
    """Scrape all chapters of a law (e.g., /aktivloven/1, /aktivloven/2, ...)"""
    chapters = []

    logger.info(f"  Scraping chapters for: {law_slug}")

    # Try to fetch chapter pages (usually numbered 1, 2, 3, ...)
    for chapter_num in range(1, max_chapters + 1):
        url = f"{BASE_URL}/{law_slug}/{chapter_num}"
        html = fetch_page(url)

        if not html:
            # If we can't fetch the page, we've likely reached the end
            if chapter_num == 1:
                # Try the base law page without chapter number
                url = f"{BASE_URL}/{law_slug}"
                html = fetch_page(url)
                if html:
                    content = extract_law_content(html)
                    if content['content']:
                        chapters.append({
                            'chapter_number': 1,
                            'url': url,
                            **content
                        })
            break

        content = extract_law_content(html)

        # Stop if we get empty content (likely no more chapters)
        if not content['content']:
            break

        chapters.append({
            'chapter_number': chapter_num,
            'url': url,
            **content
        })

        logger.info(f"    ✓ Chapter {chapter_num} scraped")
        time.sleep(0.3)  # Be nice to the server

    return chapters


def save_law_as_markdown(law_slug: str, chapters: List[Dict[str, Any]]) -> Path:
    """Save law chapters as a single markdown file"""
    law_dir = LAWS_DIR / law_slug
    law_dir.mkdir(parents=True, exist_ok=True)

    md_file = law_dir / f"{law_slug}.md"

    with open(md_file, 'w', encoding='utf-8') as f:
        # Write title and metadata
        if chapters:
            first_chapter = chapters[0]
            f.write(f"# {first_chapter.get('title', law_slug.title())}\n\n")

            if first_chapter.get('law_number'):
                f.write(f"**Lovnummer:** {first_chapter['law_number']}\n\n")

            if first_chapter.get('summary'):
                f.write(f"## Resumé\n\n{first_chapter['summary']}\n\n")

            f.write("---\n\n")

        # Write each chapter
        for chapter in chapters:
            if chapter.get('chapter_number'):
                f.write(f"## Kapitel {chapter['chapter_number']}\n\n")

            f.write(f"{chapter.get('content', '')}\n\n")
            f.write("---\n\n")

    logger.info(f"    ✓ Saved to {md_file}")
    return md_file


def extract_categories(html: str) -> List[Dict[str, Any]]:
    """Extract all law categories from kategorier page"""
    soup = BeautifulSoup(html, 'html.parser')
    categories = []

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
                'url': f"{BASE_URL}{href}"
            })

    logger.info(f"Found {len(categories)} categories")
    return categories


def extract_law_slugs_from_category(html: str, category_slug: str) -> List[str]:
    """Extract law slugs from category page"""
    soup = BeautifulSoup(html, 'html.parser')
    law_slugs = []

    links = soup.find_all('a', href=True)

    for link in links:
        href = link.get('href', '')
        if (href.startswith('/') and
            '/kategori/' not in href and
            href != '/' and
            not href.startswith('#')):
            slug = href.strip('/').split('/')[0]  # Get the base slug without chapter numbers
            if slug and slug not in law_slugs and slug != category_slug:
                law_slugs.append(slug)

    return law_slugs[:15]  # Limit per category


def main():
    """Main scraping function with full content extraction"""
    logger.info("🚀 Starting FULL scraping of regelrytter.dk...")
    logger.info("⚠️  This will take longer as we're extracting full law texts\n")

    # Create directories
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAWS_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Fetch categories
    logger.info("📂 Fetching categories...")
    categories_html = fetch_page(f"{BASE_URL}/kategorier")
    if not categories_html:
        logger.error("Failed to fetch categories page")
        return

    categories = extract_categories(categories_html)

    # Step 2: Scrape representative laws with full content
    logger.info("\n📖 Scraping full law texts...\n")

    representative_slugs = [
        'ferieloven',
        'funktionaerloven',
        'ligebehandlingsloven',
        'aktivloven',
        'grundloven',
        'straffeloven',
        'forvaltningsloven',
        'persondataloven',
        'selskabsloven',
        'skatteforvaltningsloven'
    ]

    all_laws = []

    for slug in representative_slugs:
        logger.info(f"📋 Processing: {slug}")

        # Scrape all chapters
        chapters = scrape_law_chapters(slug, max_chapters=50)

        if not chapters:
            logger.warning(f"  ⚠️  No content found for {slug}")
            continue

        # Save as markdown
        md_file = save_law_as_markdown(slug, chapters)

        # Combine all chapter content
        full_content = "\n\n".join([ch.get('content', '') for ch in chapters])

        # Find category
        law_category = 'anden-lovgivning'

        # Create law entry
        law_entry = {
            'title': chapters[0].get('title', slug.title()),
            'slug': slug,
            'category': law_category,
            'url': f"{BASE_URL}/{slug}",
            'lawNumber': chapters[0].get('law_number'),
            'summary': chapters[0].get('summary', ''),
            'content': full_content[:5000],  # Store first 5000 chars in JSON
            'fullContentFile': str(md_file.relative_to(OUTPUT_FILE.parent)),
            'chapterCount': len(chapters),
            'scrapedAt': datetime.now(UTC).isoformat()
        }

        all_laws.append(law_entry)
        logger.info(f"  ✅ Completed {slug} ({len(chapters)} chapters)\n")

        time.sleep(1)  # Be extra nice to the server

    # Step 3: Build final JSON
    output_data = {
        'metadata': {
            'source': 'regelrytter.dk',
            'scrapedAt': datetime.now(UTC).isoformat(),
            'totalCategories': len(categories),
            'lawsWithFullContent': len(all_laws),
            'description': 'Full law texts with chapters saved as markdown files'
        },
        'categories': categories,
        'laws': all_laws
    }

    # Write to file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    logger.info(f"\n✅ FULL scraping complete!")
    logger.info(f"📊 Categories: {len(categories)}")
    logger.info(f"📊 Laws scraped: {len(all_laws)}")
    logger.info(f"📄 JSON output: {OUTPUT_FILE}")
    logger.info(f"📁 Markdown files: {LAWS_DIR}/")


if __name__ == '__main__':
    main()
