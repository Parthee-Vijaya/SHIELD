"""Pydantic modeller for nyheds-API'et"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import Enum
from typing import List, Optional

from pydantic import AnyHttpUrl, BaseModel, Field


class NewsImportance(str, Enum):
    """Vigtighedsscore fra scraperen"""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class SourceFetchStatus(str, Enum):
    """Status for hentning af en kilde"""

    AVAILABLE = "available"
    NO_RECENT_ITEMS = "no_recent_items"
    ERROR = "error"


class NewsArticle(BaseModel):
    """Normaliseret repræsentation af en nyhedsartikel"""

    title: str = Field(..., description="Overskrift på artiklen")
    url: AnyHttpUrl = Field(..., description="Kilde-URL")
    source: str = Field(..., description="Navn på kildeorganisation")
    category: str = Field(..., description="Tematisk kategori")
    summary: str = Field("", description="Kort resume")
    published_at: Optional[datetime] = Field(None, description="Publiceringsdato")
    importance: NewsImportance = Field(NewsImportance.MEDIUM, description="Vigtighedsscore")
    keywords: List[str] = Field(default_factory=list, description="Relevante nøgleord")
    scraped_at: datetime = Field(..., description="Hvornår artiklen sidst blev hentet")
    content_snippet: Optional[str] = Field(None, description="Kort snippet fra artiklen")


class NewsSourceStatus(BaseModel):
    """Helbredstilstand for en nyhedskilde"""

    source: str
    status: SourceFetchStatus
    last_attempt: Optional[datetime] = None
    last_success: Optional[datetime] = None
    last_error: Optional[str] = None
    items_collected: int = 0


class NewsFeedPayload(BaseModel):
    """API-svar med nyheder og metadata"""

    items: List[NewsArticle] = Field(default_factory=list)
    last_updated: Optional[datetime] = None
    cache_ttl_seconds: int = Field(..., description="Cache-levetid i sekunder")
    source_status: List[NewsSourceStatus] = Field(default_factory=list)


class TickerArticle(BaseModel):
    """Simplificeret artikel til ticker"""

    title: str
    url: AnyHttpUrl
    source: str
    published_at: Optional[datetime] = None
    scraped_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TickerPayload(BaseModel):
    """API-svar for ticker nyheder"""

    items: List[TickerArticle] = Field(default_factory=list)
    last_updated: Optional[datetime] = None
    cache_ttl_seconds: int = Field(..., description="Cache-levetid i sekunder")
