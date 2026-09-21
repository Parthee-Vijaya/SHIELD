"""Rate limiting setup — slowapi per-IP throttling.

Differentierede limits baseret på endpoint-omkostning:

| Tier        | Limit           | Endpoints                                      |
|-------------|-----------------|------------------------------------------------|
| LLM_HEAVY   | 10/minute       | document/analyze, law/ask, law/ask/stream      |
| LLM_LIGHT   | 30/minute       | research/juridisk, eu-ai-act-checker/refresh   |
| ADMIN_WRITE | 6/minute        | knowledge-base/update, ai-projects/refresh     |
| READ        | 120/minute      | alle GET-endpoints, /health, /drift            |
| GLOBAL      | 1000/minute     | overall safety net (catches anything)          |

Internal-token whitelist: requests med header `X-Tyr-Internal: <secret>`
matchende env TYR_INTERNAL_TOKEN bypass'er rate limit. Bruges af /drift's
egen polling så drift-siden ikke trigger 429 på sig selv.

Designkrav:
- Pilot bag Tailscale → ingen brug for IP-baseret blocking, kun
  beskyttelse mod accidentel spam (script i loop, glemt alarm)
- Skal ikke require Redis i dev — slowapi falder tilbage til
  in-memory storage hvilket er ok for én Python-proces
"""

from __future__ import annotations

import os
from typing import Awaitable, Callable

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _key_func(request: Request) -> str:
    """Bestem rate-limit-nøgle. Returnér en speciel nøgle for whitelisted
    interne kald så de ikke deler bucket med eksterne klienter."""
    token = os.getenv("TYR_INTERNAL_TOKEN", "").strip()
    if token:
        provided = request.headers.get("X-Tyr-Internal", "")
        if provided and provided == token:
            return "_tyr_internal_"  # delt bucket m. meget høj limit
    return get_remote_address(request)


# Storage URI — None = in-memory (default).
# Hvis senere flerproces-deploy: sæt RATELIMIT_STORAGE_URI=memcached:// eller redis://
storage_uri = os.getenv("RATELIMIT_STORAGE_URI")

limiter = Limiter(
    key_func=_key_func,
    default_limits=["1000/minute"],
    storage_uri=storage_uri or "memory://",
    headers_enabled=True,  # tilføj X-RateLimit-* headers til response
)


# ---- Tier-konstanter — bruges som @limiter.limit(LLM_HEAVY) -----------------

LLM_HEAVY = "10/minute"
LLM_LIGHT = "30/minute"
ADMIN_WRITE = "6/minute"
READ_GENEROUS = "120/minute"
INTERNAL_BYPASS = "10000/minute"  # for _tyr_internal_-nøglen
