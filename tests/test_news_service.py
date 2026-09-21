from datetime import datetime, timezone

import pytest

from src.core.news_models import NewsImportance
from src.services.news_service import NewsService


@pytest.mark.asyncio
async def test_news_service_returns_articles_and_persists_fallback(tmp_path, monkeypatch):
    published = datetime(2024, 9, 15, 12, 0, tzinfo=timezone.utc)
    scraped = datetime(2024, 9, 15, 12, 5, tzinfo=timezone.utc)
    items = [
        {
            "title": "AI Act guidance released",
            "url": "https://example.com/ai-act",
            "source": "EU Commission",
            "published_at": published,
            "category": "eu_news",
            "summary": "Latest guidance on AI Act implementation.",
            "keywords": ["AI Act", "implementation"],
            "importance": "high",
            "scraped_at": scraped,
            "relevance_reason": "Key obligations summarised",
        }
    ]

    async def fetch_items():
        return items

    monkeypatch.setattr("src.news.llm_news_search.fetch_llm_news", fetch_items)

    fallback_path = tmp_path / "news_cache.json"
    service = NewsService(
        cache_ttl_seconds=60,
        fallback_path=fallback_path,
        max_items=10,
    )

    payload = await service.get_latest_news(force_refresh=True)

    assert payload.items, "service should return news from scraper"
    assert payload.items[0].title == "AI Act guidance released"
    assert payload.items[0].importance == NewsImportance.HIGH
    assert fallback_path.exists(), "fallback cache should be written"

    async def fail_fetch():
        raise RuntimeError("network unavailable")

    monkeypatch.setattr("src.news.llm_news_search.fetch_llm_news", fail_fetch)

    # Ensure fallback is used when the live feed fails.
    failing_service = NewsService(
        cache_ttl_seconds=60,
        fallback_path=fallback_path,
        max_items=10,
    )

    fallback_payload = await failing_service.get_latest_news(force_refresh=True)
    assert fallback_payload.items, "fallback cache should be returned when scraper fails"
    assert fallback_payload.items[0].title == "AI Act guidance released"
    assert any(status.status.value in {"available", "no_recent_items", "error"} for status in fallback_payload.source_status)
