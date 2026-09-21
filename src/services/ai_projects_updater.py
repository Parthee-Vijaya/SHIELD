"""Sync af AI-projekt-katalog fra offentlig-ai.dk.

Offentlig-AI.dk er Digitaliseringsstyrelsens nationale katalog over
AI-projekter i den offentlige sektor. Per maj 2026 indeholder det ~144
projekter — vores håndlavede fallback har kun 12. Dette modul henter
sitemap.xml, ekstraherer projekt-URLs, og scraper hver projekt-side
for metadata (titel, beskrivelse, scope, sektor, status, billede).

Resultatet caches i data/ai_projects.json og serveres af
/api/ai-projects. Frontend bruger samme schema som den oprindelige
aiProjectsFallback.json så ingen UI-ændringer kræves.

Cron: ugentligt mandag 03:30 (efter knowledge-base-jobbet).
Manuel trigger: POST /api/ai-projects/refresh

Robusthed:
- Atomic JSON write (tempfile + rename)
- Per-side timeout 15s, total cap af samtidige requests
- Graceful degradation: hvis sitemap fejler, eller en projekt-side
  ikke kan parses, beholder vi den eksisterende cache
- Beskedne forekomstkrav: hvis ny scrape giver < 50% af forrige
  cache, accepterer vi ikke skiftet (sandsynligt scrape-fejl)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "ai_projects.json"
SITEMAP_URL = "https://offentlig-ai.dk/sitemap.xml"
PROJECT_URL_PREFIX = "https://offentlig-ai.dk/projekter/"

# How many parallel scrape requests — be polite to the source
_MAX_CONCURRENT = 6
_REQUEST_TIMEOUT = 15.0
_USER_AGENT = "SHIELD/1.0 ai-projects-sync (Kalundborg Kommune)"

# Sitemap XML namespaces
_SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


# ---- Persistence -----------------------------------------------------------


def _load_cache() -> list[dict]:
    if not CACHE_PATH.exists():
        return []
    try:
        with CACHE_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning(f"Failed to load AI projects cache: {exc}")
    return []


def _save_cache(items: list[dict]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_PATH.with_suffix(".json.tmp")
    payload = {
        "version": 1,
        "fetched_at": datetime.now(UTC).isoformat(),
        "source": "offentlig-ai.dk",
        "count": len(items),
        "items": items,
    }
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    tmp.replace(CACHE_PATH)
    logger.info(f"Saved {len(items)} AI projects to cache")


def load_ai_projects() -> dict:
    """Returnér cached katalog. Tom struktur hvis ingen cache findes."""
    if not CACHE_PATH.exists():
        return {"items": [], "fetched_at": None, "count": 0}
    try:
        with CACHE_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict) and "items" in data:
            return data
        # Old-format file — items at top level
        if isinstance(data, list):
            return {"items": data, "fetched_at": None, "count": len(data)}
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning(f"Cache read failed: {exc}")
    return {"items": [], "fetched_at": None, "count": 0}


# ---- Sitemap fetching ------------------------------------------------------


async def _fetch_project_urls(client: httpx.AsyncClient) -> list[str]:
    """Returnér alle URLs der starter med /projekter/<slug> fra sitemap."""
    r = await client.get(SITEMAP_URL, timeout=_REQUEST_TIMEOUT)
    r.raise_for_status()
    root = ET.fromstring(r.text)
    urls: list[str] = []
    for url_el in root.findall("sm:url", _SITEMAP_NS):
        loc = url_el.find("sm:loc", _SITEMAP_NS)
        if loc is None or not loc.text:
            continue
        href = loc.text.strip()
        if href.startswith(PROJECT_URL_PREFIX) and len(href) > len(PROJECT_URL_PREFIX):
            urls.append(href)
    # Dedupe preserving order
    seen: list[str] = []
    for u in urls:
        if u not in seen:
            seen.append(u)
    return seen


# ---- Project page parsing --------------------------------------------------


_OG_TITLE_RE = re.compile(r'<meta\s+property="og:title"\s+content="([^"]+)"', re.IGNORECASE)
_OG_DESC_RE = re.compile(r'<meta\s+property="og:description"\s+content="([^"]+)"', re.IGNORECASE)
_OG_IMAGE_RE = re.compile(r'<meta\s+property="og:image"\s+content="([^"]+)"', re.IGNORECASE)
_OG_URL_RE = re.compile(r'<meta\s+property="og:url"\s+content="([^"]+)"', re.IGNORECASE)

# Field divs followed by an <a>...</a> with the actual value. Drupal's
# field renderer uses class="field field-project-X-ref ...".
_FIELD_RE = re.compile(
    r'class="field field-project-([a-z\-]+)-ref[^"]*">\s*[\n\s]*<a[^>]*>([^<]+)</a>',
    re.IGNORECASE,
)
# Project-state field doesn't always have an <a> wrapper — sometimes plain text
_FIELD_PLAIN_RE = re.compile(
    r'class="field field-project-state-ref[^"]*">\s*[\n\s]*([A-Za-zÆØÅæøå][^<\n]{0,40})\s*</div>',
    re.IGNORECASE,
)


def _decode_html_entities(text: str) -> str:
    """Decode the most common HTML entities — &amp;, &quot;, etc."""
    import html as html_module
    return html_module.unescape(text)


def _parse_project_page(html: str, url: str) -> Optional[dict]:
    """Parse en projekt-side til vores schema. Returnér None ved fejl."""
    title_m = _OG_TITLE_RE.search(html)
    desc_m = _OG_DESC_RE.search(html)
    image_m = _OG_IMAGE_RE.search(html)
    canonical_m = _OG_URL_RE.search(html)

    if not title_m:
        return None

    title = _decode_html_entities(title_m.group(1)).strip()
    description = _decode_html_entities(desc_m.group(1)).strip() if desc_m else ""
    image_url = image_m.group(1) if image_m else ""
    canonical_url = canonical_m.group(1) if canonical_m else url

    # Extract field-* values: scope, sector, state
    fields: dict[str, list[str]] = {}
    for field_name, value in _FIELD_RE.findall(html):
        key = field_name.lower()
        if key not in fields:
            fields[key] = []
        cleaned = _decode_html_entities(value).strip()
        if cleaned and cleaned not in fields[key]:
            fields[key].append(cleaned)

    # Plain-text state fallback (e.g. "Lukket" without a link)
    if "state" not in fields:
        for m in _FIELD_PLAIN_RE.findall(html):
            cleaned = m.strip()
            if cleaned and len(cleaned) <= 60:
                fields["state"] = [cleaned]
                break

    scope = ", ".join(fields.get("scope", [])) or ""
    # Drupal calls it "sector" in the field name but it's the category in UI
    sector = ", ".join(fields.get("sector", [])) or ""
    state = ", ".join(fields.get("state", [])) or ""

    # Detect signaturprojekt — appears in HTML body as "signaturprojekt"
    is_signature = bool(re.search(r"\bsignaturprojekt\b", html, re.IGNORECASE))

    slug = canonical_url.rstrip("/").rsplit("/", 1)[-1]

    return {
        "slug": slug,
        "title": title,
        "description": description,
        "isSignature": is_signature,
        "category": sector,
        "scope": scope,
        "status": state,
        "imageUrl": image_url,
        "externalUrl": canonical_url,
    }


async def _scrape_project(
    client: httpx.AsyncClient,
    url: str,
    semaphore: asyncio.Semaphore,
) -> Optional[dict]:
    """Hent en enkelt projekt-side med backoff. Returnér None ved fejl."""
    async with semaphore:
        try:
            r = await client.get(url, timeout=_REQUEST_TIMEOUT)
            if r.status_code != 200:
                logger.warning(f"Project {url}: HTTP {r.status_code}")
                return None
            return _parse_project_page(r.text, url)
        except httpx.HTTPError as exc:
            logger.warning(f"Project {url}: {exc}")
            return None
        except Exception:
            logger.exception(f"Project {url}: parse failed")
            return None


# ---- Public API ------------------------------------------------------------


async def refresh_ai_projects() -> dict:
    """Hent alle projekter fra offentlig-ai.dk og persistér til cache.

    Returnerer summary-dict med tæl, ny-URLs, og evt. fejl. Cachen
    opdateres KUN hvis ny scrape giver mindst 50% af forrige cache-størrelse
    (graceful degradation mod blackout / 503).
    """
    summary: dict = {
        "started_at": datetime.now(UTC).isoformat(),
        "fetched_count": 0,
        "errors": 0,
        "cache_updated": False,
        "previous_count": 0,
    }

    existing = _load_cache()
    summary["previous_count"] = (
        existing.get("count", 0)
        if isinstance(existing, dict)
        else len(existing) if isinstance(existing, list) else 0
    )

    headers = {"User-Agent": _USER_AGENT, "Accept": "text/html,application/xml"}
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        try:
            urls = await _fetch_project_urls(client)
        except Exception as exc:
            logger.exception(f"Sitemap fetch failed: {exc}")
            summary["error"] = f"sitemap: {exc}"
            return summary

        summary["sitemap_count"] = len(urls)
        if not urls:
            summary["error"] = "sitemap returned 0 URLs"
            return summary

        semaphore = asyncio.Semaphore(_MAX_CONCURRENT)
        results = await asyncio.gather(
            *[_scrape_project(client, u, semaphore) for u in urls],
            return_exceptions=False,
        )

    items: list[dict] = []
    for idx, res in enumerate(results):
        if res is None:
            summary["errors"] += 1
            continue
        # Stable id = position-based (1-indexed) so frontend can render keyed
        res["id"] = idx + 1
        items.append(res)

    summary["fetched_count"] = len(items)

    # Sanity-check: a successful run should produce at least 50% of previous
    # cache. This protects mod silent blackouts.
    prev = summary["previous_count"]
    if prev > 10 and len(items) < prev * 0.5:
        summary["error"] = (
            f"sanity-check failed: got {len(items)} items, expected "
            f">= {int(prev * 0.5)} (half of previous cache)"
        )
        logger.error(summary["error"])
        return summary

    if items:
        await asyncio.to_thread(_save_cache, items)
        summary["cache_updated"] = True

    summary["finished_at"] = datetime.now(UTC).isoformat()
    return summary


async def scheduled_ai_projects_sync() -> None:
    """APScheduler entry point."""
    try:
        await refresh_ai_projects()
    except Exception:
        logger.exception("scheduled AI projects sync failed")
