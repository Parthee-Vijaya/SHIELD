"""
Caching layer for Judge Dredd AI Compliance Platform
Provides two-tier caching: in-memory LRU and filesystem-based disk cache
"""

from src.cache.memory_cache import (
    cached_compliance_rules,
    cached_legal_texts,
    clear_memory_cache,
)
from src.cache.disk_cache import (
    cache_llm_response,
    get_cached_response,
    clear_old_cache,
    clear_all_disk_cache,
)
from src.cache.cache_decorator import (
    cache_to_disk,
    cache_in_memory,
)
from src.cache.cache_warmer import (
    warm_caches_on_startup,
    warm_compliance_caches,
    validate_cache_health,
)

__all__ = [
    # Memory cache
    "cached_compliance_rules",
    "cached_legal_texts",
    "clear_memory_cache",
    # Disk cache
    "cache_llm_response",
    "get_cached_response",
    "clear_old_cache",
    "clear_all_disk_cache",
    # Decorators
    "cache_to_disk",
    "cache_in_memory",
    # Cache warming
    "warm_caches_on_startup",
    "warm_compliance_caches",
    "validate_cache_health",
]
