from datetime import datetime, timezone

import pytest

from src.news.tech_ticker import TickerItem
from src.services.tech_ticker_service import TechTickerService


class _DummyTicker:
    def __init__(self, items):
        self._items = items

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def fetch(self, limit: int = 15):
        return self._items[:limit]


class _FailingTicker(_DummyTicker):
    async def fetch(self, limit: int = 15):
        raise RuntimeError("feed down")


@pytest.mark.asyncio
async def test_ticker_service_uses_fallback(tmp_path):
    published = datetime(2024, 9, 10, 8, 0, tzinfo=timezone.utc)
    scraped = datetime(2024, 9, 10, 8, 5, tzinfo=timezone.utc)
    items = [
        TickerItem(
            title="AI breakthrough announced",
            url="https://example.com/ai-news",
            source="Example Source",
            published_at=published,
            scraped_at=scraped,
        )
    ]

    fallback_path = tmp_path / "ticker_cache.json"
    service = TechTickerService(
        cache_ttl_seconds=60,
        max_items=5,
        ticker_factory=lambda: _DummyTicker(items),
        fallback_path=fallback_path,
    )

    payload = await service.get_latest(force_refresh=True)
    assert payload.items
    assert payload.items[0].title == "AI breakthrough announced"
    assert fallback_path.exists()

    # ensure fallback is used when fetch fails
    failing_service = TechTickerService(
        cache_ttl_seconds=60,
        max_items=5,
        ticker_factory=lambda: _FailingTicker(items),
        fallback_path=fallback_path,
    )

    fallback_payload = await failing_service.get_latest(force_refresh=True)
    assert fallback_payload.items
    assert fallback_payload.items[0].title == "AI breakthrough announced"
