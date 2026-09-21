"""Service-lag for globale AI-tech ticker nyheder"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, UTC
from pathlib import Path
from typing import AsyncContextManager, Callable, List, Optional, Sequence

from src.core.news_models import TickerArticle, TickerPayload
from src.news.tech_ticker import TickerItem, TechNewsTicker

logger = logging.getLogger(__name__)

TickerFactory = Callable[[], AsyncContextManager[TechNewsTicker]]


class TechTickerService:
    def __init__(
        self,
        *,
        cache_ttl_seconds: int = 15 * 60,
        max_items: int = 20,
        ticker_factory: Optional[TickerFactory] = None,
        fallback_path: Optional[Path] = None,
    ) -> None:
        self.cache_ttl = timedelta(seconds=cache_ttl_seconds)
        self.max_items = max_items
        self._ticker_factory = ticker_factory or (lambda: TechNewsTicker())
        self._fallback_path = fallback_path or Path("data/ticker_fallback.json")
        self._cache: List[TickerArticle] = []
        self._cache_ts: Optional[datetime] = None
        self._lock = asyncio.Lock()

    async def get_latest(self, *, force_refresh: bool = False) -> TickerPayload:
        async with self._lock:
            if force_refresh or self._cache_expired:
                await self._refresh_cache()

            return TickerPayload(
                items=self._cache,
                last_updated=self._cache_ts,
                cache_ttl_seconds=int(self.cache_ttl.total_seconds()),
            )

    @property
    def _cache_expired(self) -> bool:
        if not self._cache_ts:
            return True
        return datetime.now(UTC) - self._cache_ts > self.cache_ttl

    async def _refresh_cache(self) -> None:
        logger.info("Opdaterer tech ticker cache")
        items: Sequence[TickerItem] = []
        try:
            async with self._ticker_factory() as ticker:
                items = await ticker.fetch(limit=self.max_items)
        except Exception as exc:  # pragma: no cover
            logger.warning("Ticker fetch fejlede: %s", exc)

        if items:
            converted = [self._convert_item(item) for item in items]
            self._cache = converted
            self._cache_ts = datetime.now(UTC)
            await self._write_fallback_cache(converted)
        else:
            fallback = await self._load_fallback_cache()
            self._cache = fallback[: self.max_items]
            self._cache_ts = datetime.now(UTC)

    def _convert_item(self, item: TickerItem) -> TickerArticle:
        return TickerArticle(
            title=item.title,
            url=item.url,
            source=item.source,
            published_at=item.published_at,
            scraped_at=item.scraped_at,
        )

    async def _write_fallback_cache(self, items: Sequence[TickerArticle]) -> None:
        try:
            data = [item.model_dump(mode="json") for item in items]

            def _write() -> None:
                self._fallback_path.parent.mkdir(parents=True, exist_ok=True)
                self._fallback_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

            await asyncio.to_thread(_write)
        except Exception as exc:  # pragma: no cover
            logger.warning("Kunne ikke gemme ticker fallback: %s", exc)

    async def _load_fallback_cache(self) -> List[TickerArticle]:
        if not self._fallback_path.exists():
            return []

        try:
            def _read() -> List[TickerArticle]:
                raw = json.loads(self._fallback_path.read_text())
                return [TickerArticle.model_validate(item) for item in raw]

            return await asyncio.to_thread(_read)
        except Exception as exc:  # pragma: no cover
            logger.warning("Kunne ikke indlæse ticker fallback: %s", exc)
            return []


__all__ = ["TechTickerService"]
