"""
Custom caching decorators for easy application of caching to functions
Provides both disk and memory cache decorators
"""

import functools
import logging
from typing import Any, Callable, Optional

from src.cache.disk_cache import (
    cache_llm_response,
    get_cached_response,
    cache_data,
    get_cached_data,
    ENABLE_CACHING,
)

logger = logging.getLogger(__name__)


def cache_to_disk(
    ttl: int = 3600,
    use_pickle: bool = False,
    key_func: Optional[Callable] = None,
    cache_failures: bool = False,
):
    """
    Decorator to cache function results to disk

    Args:
        ttl: Time-to-live in seconds
        use_pickle: Use pickle for non-JSON-serializable objects
        key_func: Custom function to generate cache key from args
        cache_failures: Whether to cache exceptions/failures

    Usage:
        @cache_to_disk(ttl=3600)
        def expensive_function(arg1, arg2):
            return slow_computation(arg1, arg2)
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if not ENABLE_CACHING:
                return func(*args, **kwargs)

            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Default key generation
                key_parts = [func.__name__]
                key_parts.extend(str(arg) for arg in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = "|".join(key_parts)

            # Try to get cached result
            cached = get_cached_data(cache_key, use_pickle=use_pickle)
            if cached is not None:
                logger.debug(f"Disk cache hit for {func.__name__}")
                # Check if this is a cached exception
                if isinstance(cached, dict) and cached.get("_is_exception"):
                    raise Exception(cached.get("_exception_message"))
                return cached

            logger.debug(f"Disk cache miss for {func.__name__}")

            # Execute function
            try:
                result = func(*args, **kwargs)
                # Cache successful result
                cache_data(cache_key, result, ttl=ttl, use_pickle=use_pickle)
                return result

            except Exception as e:
                if cache_failures:
                    # Cache the exception
                    error_cache = {
                        "_is_exception": True,
                        "_exception_message": str(e),
                        "_exception_type": type(e).__name__,
                    }
                    cache_data(cache_key, error_cache, ttl=ttl, use_pickle=False)
                raise

        return wrapper
    return decorator


def cache_in_memory(maxsize: int = 128):
    """
    Decorator to cache function results in memory using LRU cache

    Args:
        maxsize: Maximum cache size

    Usage:
        @cache_in_memory(maxsize=256)
        def fast_function(arg1, arg2):
            return quick_computation(arg1, arg2)
    """
    def decorator(func: Callable) -> Callable:
        if not ENABLE_CACHING:
            return func

        # Use functools.lru_cache
        cached_func = functools.lru_cache(maxsize=maxsize)(func)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return cached_func(*args, **kwargs)
            except TypeError:
                # Unhashable arguments, fall back to direct execution
                logger.warning(f"Unhashable arguments for {func.__name__}, bypassing cache")
                return func(*args, **kwargs)

        # Expose cache_info and cache_clear
        wrapper.cache_info = cached_func.cache_info
        wrapper.cache_clear = cached_func.cache_clear

        return wrapper
    return decorator


def cache_llm_call(
    ttl: int = 3600,
    model_param: str = "model",
    prompt_param: str = "prompt",
):
    """
    Specialized decorator for LLM calls

    Args:
        ttl: Time-to-live in seconds
        model_param: Name of model parameter in function
        prompt_param: Name of prompt parameter in function

    Usage:
        @cache_llm_call(ttl=7200)
        def call_llm(prompt, model="gpt-4"):
            return llm.invoke(prompt)
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if not ENABLE_CACHING:
                return func(*args, **kwargs)

            # Extract prompt and model from args/kwargs
            import inspect
            sig = inspect.signature(func)
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()

            prompt = bound.arguments.get(prompt_param, "")
            model = bound.arguments.get(model_param, "")

            if not prompt:
                logger.warning(f"No prompt found in {func.__name__}, bypassing cache")
                return func(*args, **kwargs)

            # Try to get cached response
            cached = get_cached_response(prompt, model)
            if cached is not None:
                logger.info(f"LLM cache hit for {func.__name__}")
                return cached

            logger.info(f"LLM cache miss for {func.__name__}")

            # Execute function
            result = func(*args, **kwargs)

            # Cache result
            cache_llm_response(prompt, result, model=model, ttl=ttl)

            return result

        return wrapper
    return decorator


def cache_async_to_disk(
    ttl: int = 3600,
    use_pickle: bool = False,
    key_func: Optional[Callable] = None,
):
    """
    Decorator to cache async function results to disk

    Args:
        ttl: Time-to-live in seconds
        use_pickle: Use pickle for non-JSON-serializable objects
        key_func: Custom function to generate cache key from args

    Usage:
        @cache_async_to_disk(ttl=3600)
        async def async_expensive_function(arg1, arg2):
            return await slow_async_computation(arg1, arg2)
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            if not ENABLE_CACHING:
                return await func(*args, **kwargs)

            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                key_parts = [func.__name__]
                key_parts.extend(str(arg) for arg in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = "|".join(key_parts)

            # Try to get cached result
            cached = get_cached_data(cache_key, use_pickle=use_pickle)
            if cached is not None:
                logger.debug(f"Disk cache hit for async {func.__name__}")
                return cached

            logger.debug(f"Disk cache miss for async {func.__name__}")

            # Execute function
            result = await func(*args, **kwargs)

            # Cache result
            cache_data(cache_key, result, ttl=ttl, use_pickle=use_pickle)

            return result

        return wrapper
    return decorator


def conditional_cache(
    condition_func: Callable,
    ttl: int = 3600,
    use_disk: bool = True,
):
    """
    Decorator that conditionally caches based on a predicate function

    Args:
        condition_func: Function that returns True if result should be cached
        ttl: Time-to-live in seconds
        use_disk: Use disk cache (True) or memory cache (False)

    Usage:
        @conditional_cache(lambda result: result.get("status") == "success")
        def api_call(endpoint):
            return make_request(endpoint)
    """
    def decorator(func: Callable) -> Callable:
        if use_disk:
            disk_cached = cache_to_disk(ttl=ttl)(func)
        else:
            disk_cached = cache_in_memory(maxsize=128)(func)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if not ENABLE_CACHING:
                return func(*args, **kwargs)

            # Execute function first
            result = func(*args, **kwargs)

            # Check if we should cache
            try:
                if condition_func(result):
                    logger.debug(f"Condition met, caching result for {func.__name__}")
                    # Re-execute with caching
                    return disk_cached(*args, **kwargs)
                else:
                    logger.debug(f"Condition not met, not caching result for {func.__name__}")

            except Exception as e:
                logger.warning(f"Condition check failed for {func.__name__}: {e}")

            return result

        return wrapper
    return decorator


def cache_with_invalidation(
    ttl: int = 3600,
    invalidation_key: str = "version",
):
    """
    Decorator that includes version/invalidation key in cache

    Args:
        ttl: Time-to-live in seconds
        invalidation_key: Key name for version/invalidation parameter

    Usage:
        @cache_with_invalidation(invalidation_key="data_version")
        def load_data(data_version="v1"):
            return expensive_load()
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if not ENABLE_CACHING:
                return func(*args, **kwargs)

            # Include invalidation key in cache key
            version = kwargs.get(invalidation_key, "default")
            cache_key = f"{func.__name__}|{invalidation_key}={version}|"
            cache_key += "|".join(str(arg) for arg in args)
            cache_key += "|".join(f"{k}={v}" for k, v in sorted(kwargs.items())
                                 if k != invalidation_key)

            # Try to get cached result
            cached = get_cached_data(cache_key)
            if cached is not None:
                logger.debug(f"Cache hit for {func.__name__} (version: {version})")
                return cached

            # Execute and cache
            result = func(*args, **kwargs)
            cache_data(cache_key, result, ttl=ttl)

            return result

        return wrapper
    return decorator


# Convenience function to wrap existing functions
def add_caching(
    func: Callable,
    cache_type: str = "disk",
    ttl: int = 3600,
    **decorator_kwargs
) -> Callable:
    """
    Programmatically add caching to a function

    Args:
        func: Function to wrap
        cache_type: "disk", "memory", or "llm"
        ttl: Time-to-live in seconds
        **decorator_kwargs: Additional arguments for decorator

    Returns:
        Cached version of function
    """
    if cache_type == "disk":
        return cache_to_disk(ttl=ttl, **decorator_kwargs)(func)
    elif cache_type == "memory":
        maxsize = decorator_kwargs.get("maxsize", 128)
        return cache_in_memory(maxsize=maxsize)(func)
    elif cache_type == "llm":
        return cache_llm_call(ttl=ttl, **decorator_kwargs)(func)
    else:
        raise ValueError(f"Unknown cache type: {cache_type}")
