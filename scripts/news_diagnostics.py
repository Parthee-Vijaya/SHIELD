"""Kør manuel diagnostic for nyhedskilder og ticker"""

import asyncio
from pprint import pprint

from src.news.live_scraper import LiveNewsScraper
from src.news.tech_ticker import TechNewsTicker
from src.services.tech_ticker_service import TechTickerService


async def main() -> None:
    print("== Live compliance news ==")
    async with LiveNewsScraper() as scraper:
        items = await scraper.fetch_latest_news()
        print(f"Fandt {len(items)} artikler")
        sources = {}
        for item in items:
            sources.setdefault(item.source, 0)
            sources[item.source] += 1
        pprint(sources)

    print("\n== Tech AI ticker ==")
    async with TechNewsTicker() as ticker:
        raw_items = await ticker.fetch(limit=15)
        print(f"Fetcher rå items: {len(raw_items)}")
        for item in raw_items[:3]:
            print(f"  - {item.source}: {item.title}")

    ticker_service = TechTickerService()
    payload = await ticker_service.get_latest(force_refresh=True)
    print(f"Service cache items: {len(payload.items)}")
    for article in payload.items[:3]:
        print(f"  • {article.source}: {article.title}")


if __name__ == "__main__":
    asyncio.run(main())
