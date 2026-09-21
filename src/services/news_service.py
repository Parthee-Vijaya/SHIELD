"""Service-lag for news aggregation via LLM+RSS"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, UTC
from pathlib import Path
from typing import AsyncContextManager, Callable, Dict, List, Optional, Sequence, Any

from pydantic import ValidationError

from src.core.news_models import (
    NewsArticle,
    NewsFeedPayload,
    NewsImportance,
    NewsSourceStatus,
    SourceFetchStatus,
)

logger = logging.getLogger(__name__)


class NewsService:
    """Håndterer caching, fallback og normalisering af nyheder"""

    def __init__(
        self,
        *,
        cache_ttl_seconds: int = 15 * 60,
        max_items: int = 50,
        fallback_path: Optional[Path] = None,
    ) -> None:
        self.cache_ttl = timedelta(seconds=cache_ttl_seconds)
        self.max_items = max_items
        self._fallback_path = fallback_path or Path("data/news_fallback.json")

        self._cache: List[NewsArticle] = []
        self._cache_ts: Optional[datetime] = None
        default_sources = self._discover_sources()
        self._source_status: dict[str, NewsSourceStatus] = {
            source: NewsSourceStatus(source=source, status=SourceFetchStatus.NO_RECENT_ITEMS)
            for source in default_sources
        }
        self._lock = asyncio.Lock()

    async def get_latest_news(
        self,
        *,
        force_refresh: bool = False,
        category: Optional[str] = None,
        source: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> NewsFeedPayload:
        """Returnér seneste nyheder, opdater cache hvis nødvendigt"""

        async with self._lock:
            if force_refresh or self._cache_expired:
                await self._refresh_cache()

            items = self._cache

            if category:
                items = [item for item in items if item.category == category]

            if source:
                items = [item for item in items if item.source.lower() == source.lower()]

            if limit:
                items = items[: limit or self.max_items]

            payload = NewsFeedPayload(
                items=items,
                last_updated=self._cache_ts,
                cache_ttl_seconds=int(self.cache_ttl.total_seconds()),
                source_status=list(self._source_status.values()),
            )
            return payload

    @property
    def _cache_expired(self) -> bool:
        if not self._cache_ts:
            return True
        return datetime.now(UTC) - self._cache_ts > self.cache_ttl

    async def _refresh_cache(self) -> None:
        """Forsøg at hente nye nyheder og opdater cache"""

        logger.info("Refreshing news cache")
        llm_news_dicts: List[Dict[str, Any]] = []

        # Først: Prøv LLM+RSS news search (kun EDPB, POLITICO, Euractiv osv.)
        try:
            from src.news.llm_news_search import fetch_llm_news
            logger.info("Attempting LLM+RSS news fetch...")
            llm_news_dicts = await fetch_llm_news()

            if llm_news_dicts:
                logger.info(f"Successfully fetched {len(llm_news_dicts)} LLM+RSS news items")
        except Exception as exc:
            logger.warning("LLM+RSS news fetch failed: %s", exc)

        # Note: LiveNewsScraper fallback removed - only LLM+RSS approach used

        articles: List[NewsArticle] = []
        if llm_news_dicts:
            articles = self._convert_dicts_to_articles(llm_news_dicts)
            articles = self._sort_articles(articles)
            self._update_source_status(articles)
            await self._write_fallback_cache(articles)
        else:
            logger.info("Falling back to cached news file")
            articles = await self._load_fallback_articles()
            articles = self._sort_articles(articles)
            self._update_source_status(articles, fallback=True)

        self._cache = articles[: self.max_items]
        self._cache_ts = datetime.now(UTC)

    def _convert_dicts_to_articles(self, news_dicts: List[Dict[str, Any]]) -> List[NewsArticle]:
        """Konverter LLM news dictionaries til NewsArticle objekter"""
        converted: List[NewsArticle] = []
        for news_dict in news_dicts[: self.max_items]:
            try:
                # Parse published_at if it's a string
                published_at = news_dict.get('published_at')
                if isinstance(published_at, str):
                    try:
                        published_at = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
                    except (ValueError, AttributeError):
                        published_at = None

                # Parse scraped_at if it's a string
                scraped_at = news_dict.get('scraped_at')
                if isinstance(scraped_at, str):
                    try:
                        scraped_at = datetime.fromisoformat(scraped_at.replace('Z', '+00:00'))
                    except (ValueError, AttributeError):
                        scraped_at = datetime.now(UTC)
                elif scraped_at is None:
                    scraped_at = datetime.now(UTC)

                # Parse importance
                importance_value = (news_dict.get('importance', 'medium') or 'medium').lower()
                try:
                    importance = NewsImportance(importance_value)
                except ValueError:
                    importance = NewsImportance.MEDIUM

                article = NewsArticle(
                    title=news_dict.get('title', ''),
                    url=news_dict.get('url', ''),
                    source=news_dict.get('source', 'Unknown'),
                    category=news_dict.get('category', 'ai_gdpr'),
                    summary=news_dict.get('summary', ''),
                    published_at=published_at,
                    importance=importance,
                    keywords=news_dict.get('keywords', []),
                    scraped_at=scraped_at,
                    content_snippet=news_dict.get('relevance_reason'),
                )
                converted.append(article)
            except ValidationError as exc:
                logger.debug("Skipping news item due to validation error: %s", exc)
                continue
            except Exception as exc:
                logger.warning("Failed to convert news dict to article: %s", exc)
                continue

        return converted

    def _update_source_status(self, articles: Sequence[NewsArticle], *, fallback: bool = False) -> None:
        now = datetime.now(UTC)
        counts: dict[str, int] = {}
        for article in articles:
            counts[article.source] = counts.get(article.source, 0) + 1

        for source_name, count in counts.items():
            current = self._source_status.get(source_name)
            if fallback and count == 0:
                status = SourceFetchStatus.NO_RECENT_ITEMS
            else:
                status = SourceFetchStatus.AVAILABLE
            self._source_status[source_name] = NewsSourceStatus(
                source=source_name,
                status=status,
                last_attempt=now,
                last_success=now if not fallback else current.last_success if current else None,
                last_error=current.last_error if current else None,
                items_collected=count,
            )

        if fallback:
            # Mark kilder uden artikler som manglende
            for source_name, status in self._source_status.items():
                if counts.get(source_name, 0) == 0:
                    self._source_status[source_name] = status.model_copy(update={
                        "status": SourceFetchStatus.NO_RECENT_ITEMS,
                        "last_attempt": now,
                        "items_collected": 0,
                    })

    def _mark_sources_error(self, error_message: str) -> None:
        now = datetime.now(UTC)
        for source, status in list(self._source_status.items()):
            self._source_status[source] = status.model_copy(
                update={
                    "status": SourceFetchStatus.ERROR,
                    "last_attempt": now,
                    "last_error": error_message,
                }
            )

    async def _write_fallback_cache(self, articles: Sequence[NewsArticle]) -> None:
        try:
            data = [article.model_dump(mode="json") for article in articles]

            def _write() -> None:
                self._fallback_path.parent.mkdir(parents=True, exist_ok=True)
                self._fallback_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

            await asyncio.to_thread(_write)
        except Exception as exc:  # pragma: no cover - IO failure scenario
            logger.warning("Could not persist news fallback cache: %s", exc)

    async def _load_fallback_articles(self) -> List[NewsArticle]:
        if not self._fallback_path.exists():
            logger.info("No fallback cache found, returning empty list")
            return []

        try:

            def _read() -> List[NewsArticle]:
                raw = json.loads(self._fallback_path.read_text())
                return [NewsArticle.model_validate(item) for item in raw]

            return await asyncio.to_thread(_read)
        except Exception as exc:  # pragma: no cover - fallback parse failure
            logger.warning("Failed to load fallback news cache: %s", exc)
            return []

    def _discover_sources(self) -> List[str]:
        """Return hardcoded list of news sources (previously from LiveNewsScraper)."""
        return [
            "EDPB", "POLITICO AI", "POLITICO GDPR", "POLITICO Tech",
            "Euractiv AI", "Euractiv Digital", "Euractiv GDPR",
            "TechCrunch AI", "Version2", "Datatilsynet", "The Verge AI", "Computerworld"
        ]

    def _sort_articles(self, articles: Sequence[NewsArticle]) -> List[NewsArticle]:
        """Returner artikler sorteret efter nyeste udgivelses- eller scrape-tidspunkt."""
        epoch = datetime.fromtimestamp(0, tz=UTC)

        def authored_at(article: NewsArticle) -> datetime:
            if article.published_at:
                return article.published_at
            if article.scraped_at:
                return article.scraped_at
            return epoch

        return sorted(articles, key=authored_at, reverse=True)


__all__ = ["NewsService"]
