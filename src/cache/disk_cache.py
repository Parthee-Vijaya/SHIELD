"""
Filesystem-based disk cache for LLM responses
Uses hashed keys and JSON/pickle serialization
"""

import hashlib
import json
import logging
import pickle
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Union
import os

logger = logging.getLogger(__name__)

# Configuration from environment
CACHE_DIR = Path(os.getenv("CACHE_DIR", ".cache"))
DEFAULT_TTL = int(os.getenv("CACHE_TTL", "3600"))  # 1 hour default
ENABLE_CACHING = os.getenv("ENABLE_CACHING", "True").lower() == "true"


def _get_cache_key(prompt: str, model: str = "", **kwargs) -> str:
    """
    Generate cache key from prompt and parameters

    Args:
        prompt: The LLM prompt
        model: Model identifier
        **kwargs: Additional parameters that affect the response

    Returns:
        Hex digest hash key
    """
    # Create consistent string representation
    key_parts = [prompt, model]

    # Add sorted kwargs to ensure consistent key generation
    for k in sorted(kwargs.keys()):
        key_parts.append(f"{k}={kwargs[k]}")

    key_string = "|".join(key_parts)

    # Generate SHA256 hash
    return hashlib.sha256(key_string.encode("utf-8")).hexdigest()


def _get_cache_path(cache_key: str, cache_type: str = "llm") -> Path:
    """
    Get filesystem path for cache entry

    Args:
        cache_key: The cache key hash
        cache_type: Type of cache (llm, data, etc.)

    Returns:
        Path to cache file
    """
    cache_dir = CACHE_DIR / cache_type
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Use subdirectories based on first 2 chars to avoid too many files in one dir
    subdir = cache_dir / cache_key[:2]
    subdir.mkdir(exist_ok=True)

    return subdir / f"{cache_key}.json"


def cache_llm_response(
    prompt: str,
    response: Any,
    model: str = "",
    ttl: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
    **kwargs
) -> bool:
    """
    Cache an LLM response to disk

    Args:
        prompt: The prompt that generated this response
        response: The LLM response to cache
        model: Model identifier
        ttl: Time-to-live in seconds (None = use default)
        metadata: Optional metadata to store with cache
        **kwargs: Additional parameters that affect the response

    Returns:
        True if cached successfully, False otherwise
    """
    if not ENABLE_CACHING:
        logger.debug("Caching disabled, skipping cache write")
        return False

    try:
        cache_key = _get_cache_key(prompt, model, **kwargs)
        cache_path = _get_cache_path(cache_key, "llm")

        cache_entry = {
            "cache_key": cache_key,
            "prompt": prompt,
            "model": model,
            "response": response,
            "metadata": metadata or {},
            "cached_at": datetime.now().isoformat(),
            "ttl": ttl or DEFAULT_TTL,
            "kwargs": kwargs,
        }

        # Write to disk
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache_entry, f, ensure_ascii=False, indent=2)

        logger.debug(f"Cached LLM response: {cache_key[:16]}...")
        return True

    except Exception as e:
        logger.warning(f"Failed to cache LLM response: {e}")
        return False


def get_cached_response(
    prompt: str,
    model: str = "",
    **kwargs
) -> Optional[Any]:
    """
    Retrieve cached LLM response

    Args:
        prompt: The prompt to look up
        model: Model identifier
        **kwargs: Additional parameters that affect the response

    Returns:
        Cached response if found and valid, None otherwise
    """
    if not ENABLE_CACHING:
        logger.debug("Caching disabled, skipping cache lookup")
        return None

    try:
        cache_key = _get_cache_key(prompt, model, **kwargs)
        cache_path = _get_cache_path(cache_key, "llm")

        if not cache_path.exists():
            logger.debug(f"Cache miss: {cache_key[:16]}...")
            return None

        # Read cache entry
        with open(cache_path, "r", encoding="utf-8") as f:
            cache_entry = json.load(f)

        # Check TTL
        cached_at = datetime.fromisoformat(cache_entry["cached_at"])
        ttl = cache_entry.get("ttl", DEFAULT_TTL)
        age = datetime.now() - cached_at

        if age.total_seconds() > ttl:
            logger.debug(f"Cache expired: {cache_key[:16]}... (age: {age.total_seconds():.0f}s)")
            # Clean up expired entry
            cache_path.unlink()
            return None

        logger.info(f"Cache hit: {cache_key[:16]}... (age: {age.total_seconds():.0f}s)")
        return cache_entry["response"]

    except Exception as e:
        logger.warning(f"Failed to retrieve cached response: {e}")
        return None


def cache_data(
    key: str,
    data: Any,
    ttl: Optional[int] = None,
    use_pickle: bool = False,
) -> bool:
    """
    Cache arbitrary data to disk

    Args:
        key: Cache key (will be hashed)
        data: Data to cache
        ttl: Time-to-live in seconds
        use_pickle: Use pickle instead of JSON (for non-JSON-serializable objects)

    Returns:
        True if cached successfully
    """
    if not ENABLE_CACHING:
        return False

    try:
        cache_key = hashlib.sha256(key.encode("utf-8")).hexdigest()
        cache_type = "data_pickle" if use_pickle else "data"
        cache_path = _get_cache_path(cache_key, cache_type)

        cache_entry = {
            "key": key,
            "data": data,
            "cached_at": datetime.now().isoformat(),
            "ttl": ttl or DEFAULT_TTL,
        }

        if use_pickle:
            # Use pickle for non-JSON-serializable data
            with open(cache_path.with_suffix(".pkl"), "wb") as f:
                pickle.dump(cache_entry, f)
        else:
            # Use JSON by default
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(cache_entry, f, ensure_ascii=False, indent=2)

        logger.debug(f"Cached data: {key[:32]}...")
        return True

    except Exception as e:
        logger.warning(f"Failed to cache data: {e}")
        return False


def get_cached_data(
    key: str,
    use_pickle: bool = False,
) -> Optional[Any]:
    """
    Retrieve cached data

    Args:
        key: Cache key
        use_pickle: Look for pickled data

    Returns:
        Cached data if found and valid
    """
    if not ENABLE_CACHING:
        return None

    try:
        cache_key = hashlib.sha256(key.encode("utf-8")).hexdigest()
        cache_type = "data_pickle" if use_pickle else "data"
        cache_path = _get_cache_path(cache_key, cache_type)

        if use_pickle:
            cache_path = cache_path.with_suffix(".pkl")

        if not cache_path.exists():
            return None

        # Read cache entry
        if use_pickle:
            with open(cache_path, "rb") as f:
                cache_entry = pickle.load(f)
        else:
            with open(cache_path, "r", encoding="utf-8") as f:
                cache_entry = json.load(f)

        # Check TTL
        cached_at = datetime.fromisoformat(cache_entry["cached_at"])
        ttl = cache_entry.get("ttl", DEFAULT_TTL)
        age = datetime.now() - cached_at

        if age.total_seconds() > ttl:
            cache_path.unlink()
            return None

        logger.debug(f"Cache hit for data: {key[:32]}...")
        return cache_entry["data"]

    except Exception as e:
        logger.warning(f"Failed to retrieve cached data: {e}")
        return None


def clear_old_cache(days: int = 7) -> int:
    """
    Clear cache entries older than specified days

    Args:
        days: Age threshold in days

    Returns:
        Number of entries cleared
    """
    cleared = 0
    cutoff = datetime.now() - timedelta(days=days)

    try:
        for cache_type in ["llm", "data", "data_pickle"]:
            cache_dir = CACHE_DIR / cache_type
            if not cache_dir.exists():
                continue

            # Recursively find all cache files
            for cache_file in cache_dir.rglob("*.json"):
                try:
                    with open(cache_file, "r") as f:
                        cache_entry = json.load(f)

                    cached_at = datetime.fromisoformat(cache_entry["cached_at"])
                    if cached_at < cutoff:
                        cache_file.unlink()
                        cleared += 1
                except Exception as e:
                    logger.debug(f"Error processing {cache_file}: {e}")

            # Handle pickle files
            for cache_file in cache_dir.rglob("*.pkl"):
                try:
                    with open(cache_file, "rb") as f:
                        cache_entry = pickle.load(f)

                    cached_at = datetime.fromisoformat(cache_entry["cached_at"])
                    if cached_at < cutoff:
                        cache_file.unlink()
                        cleared += 1
                except Exception as e:
                    logger.debug(f"Error processing {cache_file}: {e}")

        logger.info(f"Cleared {cleared} old cache entries (older than {days} days)")

    except Exception as e:
        logger.error(f"Failed to clear old cache: {e}")

    return cleared


def clear_all_disk_cache() -> int:
    """
    Clear all disk cache entries

    Returns:
        Number of entries cleared
    """
    cleared = 0

    try:
        if CACHE_DIR.exists():
            for cache_file in CACHE_DIR.rglob("*.json"):
                cache_file.unlink()
                cleared += 1

            for cache_file in CACHE_DIR.rglob("*.pkl"):
                cache_file.unlink()
                cleared += 1

        logger.info(f"Cleared all disk cache: {cleared} entries")

    except Exception as e:
        logger.error(f"Failed to clear disk cache: {e}")

    return cleared


def get_cache_size() -> Dict[str, Any]:
    """
    Get cache size statistics

    Returns:
        Dictionary with cache statistics
    """
    stats = {
        "total_entries": 0,
        "total_size_mb": 0,
        "by_type": {},
    }

    try:
        if not CACHE_DIR.exists():
            return stats

        for cache_type in ["llm", "data", "data_pickle"]:
            cache_dir = CACHE_DIR / cache_type
            if not cache_dir.exists():
                continue

            type_entries = 0
            type_size = 0

            for cache_file in cache_dir.rglob("*"):
                if cache_file.is_file():
                    type_entries += 1
                    type_size += cache_file.stat().st_size

            stats["by_type"][cache_type] = {
                "entries": type_entries,
                "size_mb": round(type_size / (1024 * 1024), 2),
            }
            stats["total_entries"] += type_entries
            stats["total_size_mb"] += type_size

        stats["total_size_mb"] = round(stats["total_size_mb"] / (1024 * 1024), 2)

    except Exception as e:
        logger.error(f"Failed to get cache size: {e}")

    return stats


def get_cache_hit_stats(prompt: str, model: str = "", **kwargs) -> Dict[str, Any]:
    """
    Get statistics about a specific cache entry

    Args:
        prompt: The prompt
        model: Model identifier
        **kwargs: Additional parameters

    Returns:
        Cache entry metadata
    """
    cache_key = _get_cache_key(prompt, model, **kwargs)
    cache_path = _get_cache_path(cache_key, "llm")

    if not cache_path.exists():
        return {"exists": False, "cache_key": cache_key}

    try:
        with open(cache_path, "r") as f:
            cache_entry = json.load(f)

        cached_at = datetime.fromisoformat(cache_entry["cached_at"])
        age = datetime.now() - cached_at
        ttl = cache_entry.get("ttl", DEFAULT_TTL)

        return {
            "exists": True,
            "cache_key": cache_key,
            "cached_at": cache_entry["cached_at"],
            "age_seconds": age.total_seconds(),
            "ttl": ttl,
            "expired": age.total_seconds() > ttl,
            "size_bytes": cache_path.stat().st_size,
        }

    except Exception as e:
        logger.warning(f"Failed to get cache stats: {e}")
        return {"exists": False, "cache_key": cache_key, "error": str(e)}
