"""
Law data access layer - search and filtering functions
"""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

# Paths to law databases
DATA_FILE_FULL = Path(__file__).parent.parent.parent / "data" / "regelrytter_laws_full.json"
DATA_FILE_BASIC = Path(__file__).parent.parent.parent / "data" / "regelrytter_laws.json"
LAWS_DIR = Path(__file__).parent.parent.parent / "data" / "laws"


def load_law_data() -> Dict[str, Any]:
    """Load law data from JSON file - prefer full version"""
    # Try full version first
    if DATA_FILE_FULL.exists():
        try:
            with open(DATA_FILE_FULL, 'r', encoding='utf-8') as f:
                data = json.load(f)
                logger.info(f"Loaded full law database with {data.get('metadata', {}).get('lawsWithFullContent', 0)} laws")
                return data
        except Exception as exc:
            logger.error(f"Failed to load full law data: {exc}")

    # Fallback to basic version
    if DATA_FILE_BASIC.exists():
        try:
            with open(DATA_FILE_BASIC, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as exc:
            logger.error(f"Failed to load basic law data: {exc}")

    return {"categories": [], "laws": [], "detailedLaws": [], "metadata": {}}


def get_categories() -> List[Dict[str, Any]]:
    """Get all law categories"""
    data = load_law_data()
    return data.get('categories', [])


def get_all_laws() -> List[Dict[str, Any]]:
    """Get all laws - supports both full and basic data formats"""
    data = load_law_data()

    # Check if using full database (has 'laws' key)
    if 'laws' in data:
        laws = data.get('laws', [])
        logger.info(f"Loaded {len(laws)} laws from full database")
        return laws

    # Fallback to basic database (has 'detailedLaws' + categories)
    detailed_laws = data.get('detailedLaws', [])
    categories = data.get('categories', [])

    # Expand sample laws from categories
    expanded_laws = []
    for category in categories:
        for slug in category.get('sampleLaws', []):
            # Skip if already in detailed laws
            if any(law['slug'] == slug for law in detailed_laws):
                continue

            # Skip generic slugs
            if slug in ['om', 'kontakt']:
                continue

            # Create basic law entry
            title = slug.replace('-', ' ').title()
            expanded_laws.append({
                'title': title,
                'slug': slug,
                'category': category['slug'],
                'url': f"https://regelrytter.dk/{slug}",
                'summary': f"Dansk lovgivning om {title.lower()}"
            })

    all_laws = detailed_laws + expanded_laws
    logger.info(f"Loaded {len(all_laws)} laws ({len(detailed_laws)} detailed)")
    return all_laws


def get_law_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    """Get specific law by slug"""
    all_laws = get_all_laws()
    for law in all_laws:
        if law['slug'] == slug:
            return law
    return None


def search_laws(query: str, category: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search laws by text query with relevance scoring

    Args:
        query: Search text
        category: Optional category filter
        limit: Max results to return

    Returns:
        List of dicts with keys: law, relevance, matches
    """
    # Normalize query
    search_terms = query.lower().split()
    search_terms = [term for term in search_terms if len(term) > 2]

    if not search_terms:
        return []

    all_laws = get_all_laws()

    # Filter by category if specified
    if category:
        all_laws = [law for law in all_laws if law.get('category') == category]

    # Score each law
    results = []
    for law in all_laws:
        title_lower = law.get('title', '').lower()
        summary_lower = law.get('summary', '').lower()
        content_lower = law.get('content', '').lower()

        score = 0
        matches = []

        for term in search_terms:
            # Title matches (highest weight)
            if term in title_lower:
                score += 10
                if 'title' not in matches:
                    matches.append('title')

            # Summary matches
            if term in summary_lower:
                score += 5
                if 'summary' not in matches:
                    matches.append('summary')

            # Content matches
            if term in content_lower:
                score += 2
                if 'content' not in matches:
                    matches.append('content')

        if score > 0:
            results.append({
                'law': law,
                'relevance': score,
                'matches': matches
            })

    # Sort by relevance
    results.sort(key=lambda x: x['relevance'], reverse=True)

    return results[:limit]
