"""Fetcher til globale AI-nyheder fra teknologi- og nyhedsmedier"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, UTC
from typing import List, Optional
from urllib.parse import urlparse

import aiohttp
import feedparser
import re

AI_KEYWORD_PHRASES = {
    "artificial intelligence",
    "machine learning",
    "generative ai",
    "large language model",
    "openai",
    "anthropic",
    "deepmind",
    "chatgpt",
    "ai act",
    "ai regulation",
    "ai policy",
    "automation",
    "robotics",
}

AI_KEYWORD_TOKENS = {
    "ai",
    "llm",
    "ml",
    "gpt",
}


@dataclass
class TickerItem:
    """Ticker artikel"""

    title: str
    url: str
    source: str
    published_at: Optional[datetime]
    scraped_at: datetime


class TechNewsTicker:
    """Henter AI-relaterede nyheder fra internationale tech-medier"""

    FEEDS = (
        {
            "source": "BBC Technology",
            "url": "https://feeds.bbci.co.uk/news/technology/rss.xml",
        },
        {
            "source": "CNN Technology",
            "url": "https://rss.cnn.com/rss/edition_technology.rss",
        },
        {
            "source": "The Verge",
            "url": "https://www.theverge.com/rss/index.xml",
        },
        {
            "source": "MIT Technology Review",
            "url": "https://www.technologyreview.com/feed/",
        },
        {
            "source": "WIRED",
            "url": "https://www.wired.com/feed/rss",
        },
        {
            "source": "TechCrunch AI",
            "url": "https://techcrunch.com/category/artificial-intelligence/feed/",
        },
        {
            "source": "Financial Times Tech",
            "url": "https://www.ft.com/technology?format=rss",
        },
        {
            "source": "Reuters Technology",
            "url": "https://feeds.reuters.com/reuters/technologyNews",
        },
        {
            "source": "CNBC Tech",
            "url": "https://www.cnbc.com/id/19854910/device/rss/rss.html",
        },
    )

    def __init__(self) -> None:
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self) -> "TechNewsTicker":
        timeout = aiohttp.ClientTimeout(total=15)
        headers = {"User-Agent": "AI-Compliance-Ticker/1.0"}
        self.session = aiohttp.ClientSession(timeout=timeout, headers=headers)
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self.session:
            await self.session.close()

    async def fetch(self, limit: int = 15) -> List[TickerItem]:
        if not self.session:
            raise RuntimeError("TechNewsTicker must be used as async context manager")

        tasks = [self._fetch_feed(feed) for feed in self.FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        items: List[TickerItem] = []
        for result in results:
            if isinstance(result, list):
                items.extend(result)

        # Sorter og begræns
        items.sort(key=lambda item: item.published_at or datetime.min, reverse=True)
        return items[:limit]

    async def _fetch_feed(self, feed_info: dict) -> List[TickerItem]:
        url = feed_info["url"]
        source_name = feed_info["source"]
        items: List[TickerItem] = []

        try:
            assert self.session
            async with self.session.get(url) as response:
                if response.status != 200:
                    return []
                text = await response.text()
        except Exception:
            return []

        parsed = feedparser.parse(text)
        relevant_items: List[TickerItem] = []
        fallback_entry = None

        for entry in parsed.entries[:10]:
            title = entry.get("title", "").strip()
            summary = entry.get("summary", "")
            content_blob = f"{title} {summary}".lower()

            if not title:
                continue

            if not self._is_relevant(entry, content_blob):
                if fallback_entry is None:
                    fallback_entry = entry
                continue

            link = entry.get("link") or ""
            if not link:
                continue

            published = self._parse_datetime(entry)
            relevant_items.append(
                TickerItem(
                    title=title,
                    url=link,
                    source=self._resolve_source(entry, source_name),
                    published_at=published,
                    scraped_at=datetime.now(UTC),
                )
            )

        if not relevant_items and fallback_entry:
            link = fallback_entry.get("link") or ""
            if link:
                relevant_items.append(
                    TickerItem(
                        title=fallback_entry.get("title", "").strip() or source_name,
                        url=link,
                        source=self._resolve_source(fallback_entry, source_name),
                        published_at=self._parse_datetime(fallback_entry),
                        scraped_at=datetime.now(UTC),
                    )
                )

        items.extend(relevant_items)

        return items

    def _is_relevant(self, entry, content_blob: str) -> bool:
        tokens = set(filter(None, re.split(r"[^a-z0-9]+", content_blob)))
        if AI_KEYWORD_TOKENS & tokens:
            return True
        if any(phrase in content_blob for phrase in AI_KEYWORD_PHRASES):
            return True

        tags = entry.get("tags") or []
        for tag in tags:
            label = ""
            if isinstance(tag, dict):
                label = str(tag.get("term") or tag.get("label") or "").lower()
            else:
                label = str(tag).lower()

            if not label:
                continue

            tag_tokens = set(filter(None, re.split(r"[^a-z0-9]+", label)))
            if AI_KEYWORD_TOKENS & tag_tokens:
                return True
            if any(phrase in label for phrase in AI_KEYWORD_PHRASES):
                return True

        return False

    def _resolve_source(self, entry, fallback: str) -> str:
        # Nogle feeds har eget source felt
        for key in ("source", "author", "publisher"):
            value = entry.get(key)
            if isinstance(value, dict):
                value = value.get("title")
            if value:
                return str(value)

        link = entry.get("link")
        if link:
            domain = urlparse(link).netloc
            if domain:
                return domain
        return fallback

    def _parse_datetime(self, entry) -> Optional[datetime]:
        for key in ("published_parsed", "updated_parsed"):
            value = entry.get(key)
            if value:
                try:
                    return datetime(*value[:6])
                except Exception:
                    continue
        return None


async def fetch_ticker_items(limit: int = 15) -> List[TickerItem]:
    async with TechNewsTicker() as ticker:
        return await ticker.fetch(limit=limit)
