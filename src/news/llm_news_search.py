"""
LLM-powered News Search
Kombinerer rigtige RSS feeds med LLM analyse for relevante nyheder
"""

import asyncio
import os
import re
from datetime import datetime, UTC, timedelta
from typing import List, Dict, Any, Optional
import logging
from langchain_openai import ChatOpenAI, AzureChatOpenAI
from langchain.schema import HumanMessage, SystemMessage
import feedparser
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Verificerede RSS kilder der virker (inkl. danske kilder)
WORKING_RSS_SOURCES = {
    'edpb': {
        'url': 'https://www.edpb.europa.eu/feed/news_en',
        'category': 'gdpr',
        'source_name': 'EDPB',
        'keywords': ['ai', 'automated decision', 'gdpr', 'guidelines']
    },
    'politico_ai': {
        'url': 'https://www.politico.eu/tag/artificial-intelligence/feed/',
        'category': 'ai_policy',
        'source_name': 'POLITICO AI',
        'keywords': ['artificial intelligence', 'AI regulation', 'EU policy']
    },
    'politico_gdpr': {
        'url': 'https://www.politico.eu/tag/general-data-protection-regulation/feed/',
        'category': 'gdpr',
        'source_name': 'POLITICO GDPR',
        'keywords': ['gdpr', 'data protection', 'privacy']
    },
    'politico_tech': {
        'url': 'https://www.politico.eu/tag/technology/feed/',
        'category': 'tech_policy',
        'source_name': 'POLITICO Tech',
        'keywords': ['technology', 'digital policy', 'AI']
    },
    'euractiv_ai': {
        'url': 'https://www.euractiv.com/section/artificial-intelligence/feed/',
        'category': 'ai_policy',
        'source_name': 'Euractiv AI',
        'keywords': ['artificial intelligence', 'AI Act']
    },
    'euractiv_gdpr': {
        'url': 'https://www.euractiv.com/section/data-protection/feed/',
        'category': 'gdpr',
        'source_name': 'Euractiv GDPR',
        'keywords': ['gdpr', 'data protection']
    },
    'euractiv_digital': {
        'url': 'https://www.euractiv.com/section/digital/feed/',
        'category': 'digital_policy',
        'source_name': 'Euractiv Digital',
        'keywords': ['digital policy', 'AI', 'technology']
    },
    # Danske kilder
    'datatilsynet': {
        'url': 'https://www.datatilsynet.dk/presse-og-nyheder/nyhedsarkiv',
        'category': 'datatilsynet',
        'source_name': 'Datatilsynet',
        'keywords': ['gdpr', 'databeskyttelse', 'AI'],
        'scrape_html': True  # HTML scraping nødvendig
    },
    'version2_ai': {
        'url': 'https://www.version2.dk/it-nyheder/rss',
        'category': 'danish_tech',
        'source_name': 'Version2',
        'keywords': ['AI', 'teknologi', 'digitalisering']
    },
    'computerworld_dk': {
        'url': 'https://www.computerworld.dk/rss/art',
        'category': 'danish_tech',
        'source_name': 'Computerworld',
        'keywords': ['AI', 'digitalisering', 'tech']
    },
    'techcrunch_ai': {
        'url': 'https://techcrunch.com/tag/artificial-intelligence/feed/',
        'category': 'ai_industry',
        'source_name': 'TechCrunch AI',
        'keywords': ['AI', 'machine learning', 'technology']
    },
    'theverge_ai': {
        'url': 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml',
        'category': 'ai_industry',
        'source_name': 'The Verge AI',
        'keywords': ['AI', 'technology', 'regulation']
    }
}


class LLMNewsSearcher:
    """Kombinerer RSS feeds med LLM analyse for relevante nyheder"""

    def __init__(self):
        self.llm = self._initialize_llm()
        self.http_client = httpx.AsyncClient(
            timeout=10.0,
            follow_redirects=True,
            verify=False  # Skip SSL verification to avoid certificate issues
        )

    def _initialize_llm(self):
        """Initialize LLM (Azure eller OpenAI)"""
        try:
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
            azure_api_key = os.getenv("AZURE_OPENAI_API_KEY")

            if azure_endpoint and azure_api_key:
                return AzureChatOpenAI(
                    azure_endpoint=azure_endpoint,
                    api_key=azure_api_key,
                    api_version=os.getenv("OPENAI_API_VERSION", "2024-02-15-preview"),
                    deployment_name=os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-4o"),
                    temperature=0.5,
                    timeout=15
                )
            else:
                return ChatOpenAI(model="gpt-4o-mini", temperature=0.5, timeout=15)
        except Exception as e:
            logger.warning(f"LLM initialization failed: {e}")
            return None

    async def _fetch_rss_feed(self, url: str, source_name: str) -> List[Dict[str, Any]]:
        """Fetch RSS feed med error handling"""
        try:
            response = await self.http_client.get(url)
            if response.status_code == 200:
                feed = feedparser.parse(response.text)

                items = []
                for entry in feed.entries[:5]:  # Kun de 5 nyeste
                    items.append({
                        'title': entry.get('title', ''),
                        'link': entry.get('link', ''),
                        'summary': entry.get('summary', entry.get('description', '')),
                        'published': entry.get('published', ''),
                        'source': source_name
                    })

                logger.info(f"Fetched {len(items)} items from {source_name}")
                return items
            else:
                logger.warning(f"RSS fetch failed for {source_name}: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error fetching RSS from {source_name}: {e}")
            return []

    async def fetch_and_analyze_rss_feeds(self) -> List[Dict[str, Any]]:
        """Fetch RSS feeds og analyser med LLM for relevans"""
        all_feed_items = []

        # Fetch alle RSS feeds parallelt
        tasks = [
            self._fetch_rss_feed(source['url'], source['source_name'])
            for source in WORKING_RSS_SOURCES.values()
        ]

        feed_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Saml alle items
        for result in feed_results:
            if isinstance(result, list):
                all_feed_items.extend(result)

        if not all_feed_items:
            logger.warning("No RSS items fetched")
            return []

        # Brug LLM til at analysere og udvælge relevante nyheder
        if not self.llm:
            # Uden LLM, returner bare de rå feed items
            return self._format_feed_items(all_feed_items[:10])

        try:
            # Forbered feed items til LLM analyse
            items_text = "\n\n".join([
                f"Titel: {item['title']}\nKilde: {item['source']}\nSammendrag: {item['summary'][:200]}\nURL: {item['link']}"
                for item in all_feed_items[:15]  # Top 15 til analyse
            ])

            system_msg = SystemMessage(content="""Du er ekspert i GDPR, AI Act og databeskyttelse.
Analyser RSS feed items og udvælg de mest relevante nyheder.
Returner KUN valid JSON array.""")

            human_msg = HumanMessage(content=f"""Analyser disse nyhedsartikler og udvælg de 5-8 mest relevante for GDPR/AI Act compliance.

RSS Feed Items:
{items_text}

For hver relevant artikel, returner:
[
  {{
    "title": "Original titel (behold den)",
    "url": "Original URL",
    "summary": "Kort sammendrag (max 2 sætninger på dansk)",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "importance": "high/medium/low",
    "source": "Kildenavn fra feed",
    "relevance_reason": "Hvorfor er denne artikel vigtig for compliance?"
  }}
]

Fokuser på:
- GDPR ændringer og vejledninger
- AI Act implementering
- Datatilsynets afgørelser
- EU policy updates
- Praktiske compliance emner

Returner kun JSON array.""")

            response = await asyncio.to_thread(
                self.llm.invoke,
                [system_msg, human_msg]
            )

            # Parse LLM response
            import json
            content = response.content.strip()

            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()

            analyzed_items = json.loads(content)
            logger.info(f"LLM analyzed and selected {len(analyzed_items)} relevant news items")
            return analyzed_items

        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            # Fallback: returner formaterede feed items uden LLM analyse
            return self._format_feed_items(all_feed_items[:8])

    @staticmethod
    def _clean_summary(raw: str, max_chars: int = 480) -> str:
        """Strip HTML/whitespace fra RSS summary og afkort på sætnings-/ord-grænse."""
        if not raw:
            return 'Ingen sammendrag tilgængeligt'
        # Strip HTML
        text = re.sub(r'<[^>]+>', ' ', raw)
        # Decode common entities
        text = (
            text.replace('&nbsp;', ' ')
            .replace('&amp;', '&')
            .replace('&quot;', '"')
            .replace('&#39;', "'")
            .replace('&lt;', '<')
            .replace('&gt;', '>')
        )
        # Collapse whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        if len(text) <= max_chars:
            return text
        # Sentence-boundary first
        cut = text[:max_chars]
        for sep in ('. ', '! ', '? '):
            idx = cut.rfind(sep)
            if idx >= max_chars * 0.6:
                return cut[: idx + 1].strip()
        # Else word-boundary
        idx = cut.rfind(' ')
        if idx >= max_chars * 0.5:
            return cut[:idx].rstrip(',;:') + '…'
        return cut.rstrip() + '…'

    def _format_feed_items(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Formater RSS items uden LLM analyse"""
        formatted = []
        for item in items:
            formatted.append({
                'title': item['title'],
                'url': item['link'],
                'summary': self._clean_summary(item.get('summary', '')),
                'source': item['source'],
                'keywords': ['gdpr', 'compliance'],
                'importance': 'medium'
            })
        return formatted


    async def get_latest_news(self) -> List[Dict[str, Any]]:
        """Hent seneste nyheder fra RSS feeds med LLM analyse"""
        logger.info("Fetching and analyzing RSS feeds...")

        # Fetch og analyser RSS feeds
        news_items = await self.fetch_and_analyze_rss_feeds()

        # Tilføj metadata
        current_time = datetime.now(UTC).isoformat()
        for item in news_items:
            item['scraped_at'] = current_time
            item['published_at'] = item.get('published_at', current_time)
            # Bestem category baseret på keywords eller source
            if not item.get('category'):
                if any(kw in str(item.get('keywords', [])).lower() for kw in ['ai act', 'artificial intelligence']):
                    item['category'] = 'ai_policy'
                elif any(kw in str(item.get('keywords', [])).lower() for kw in ['gdpr', 'data protection']):
                    item['category'] = 'gdpr'
                else:
                    item['category'] = 'eu_news'

        logger.info(f"Returning {len(news_items)} analyzed news items")
        return news_items

    async def close(self):
        """Luk HTTP client"""
        await self.http_client.aclose()


async def fetch_llm_news() -> List[Dict[str, Any]]:
    """Helper function til at hente nyheder med LLM+RSS"""
    searcher = None
    try:
        searcher = LLMNewsSearcher()
        news = await searcher.get_latest_news()
        return news
    except Exception as e:
        logger.error(f"Failed to fetch LLM news: {e}")
        return []
    finally:
        if searcher:
            await searcher.close()
