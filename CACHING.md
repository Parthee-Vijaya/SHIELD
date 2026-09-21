# Caching Layer Documentation

## Overview

The Judge Dredd AI Compliance Platform implements a two-tier caching strategy to improve performance and reduce redundant LLM calls:

1. **In-memory LRU cache** - For frequently accessed static data (compliance rules, legal texts)
2. **Filesystem disk cache** - For LLM responses and expensive computations

## Architecture

```
src/cache/
├── __init__.py           # Main cache module exports
├── memory_cache.py       # LRU cache for static data
├── disk_cache.py         # Filesystem cache for LLM responses
├── cache_decorator.py    # Decorators for easy caching
└── cache_warmer.py       # Cache warming utilities
```

## Configuration

Add to your `.env` file:

```bash
CACHE_DIR=.cache          # Directory for disk cache
CACHE_TTL=3600           # Default TTL in seconds (1 hour)
ENABLE_CACHING=True      # Enable/disable caching globally
```

## Memory Cache (LRU)

### Purpose
Cache frequently accessed static data that doesn't change often:
- Compliance rules from rule engine
- Legal text references (AI Act, GDPR articles)
- Sector-specific requirements
- Evidence artifact catalog

### Usage

```python
from src.cache.memory_cache import (
    cached_compliance_rules,
    cached_legal_texts,
    cached_sector_requirements,
    clear_memory_cache,
)

# Load all compliance rules (cached)
rules = cached_compliance_rules()

# Load rules by category (cached separately)
ai_act_rules = cached_compliance_rules(category="ai_act")
gdpr_rules = cached_compliance_rules(category="gdpr")

# Load legal texts
ai_act_text = cached_legal_texts("ai_act")
gdpr_article_6 = cached_legal_texts("gdpr", article="6")

# Load sector requirements
health_reqs = cached_sector_requirements("health")

# Clear all memory caches
clear_memory_cache()
```

### Cache Statistics

```python
from src.cache.memory_cache import get_cache_stats

stats = get_cache_stats()
# Returns: {'compliance_rules': {'hits': 50, 'misses': 5, ...}, ...}
```

## Disk Cache (Filesystem)

### Purpose
Cache LLM responses and expensive computations that can be reused:
- Legal research responses
- Risk assessment analyses
- Prompt-based LLM outputs

### Usage

```python
from src.cache.disk_cache import (
    cache_llm_response,
    get_cached_response,
    clear_old_cache,
    clear_all_disk_cache,
)

# Manual caching
prompt = "Analyze GDPR compliance for..."
response = llm.invoke(prompt)
cache_llm_response(prompt, response, model="gpt-4", ttl=7200)

# Retrieve cached response
cached = get_cached_response(prompt, model="gpt-4")
if cached:
    print("Cache hit!")
else:
    print("Cache miss, calling LLM...")

# Clear old cache entries (older than 7 days)
cleared = clear_old_cache(days=7)

# Clear all disk cache
clear_all_disk_cache()
```

### Cache Management

```python
from src.cache.disk_cache import get_cache_size

# Get cache size statistics
stats = get_cache_size()
# Returns: {'total_entries': 100, 'total_size_mb': 15.3, 'by_type': {...}}
```

## Cache Decorators

### @cache_to_disk

Cache function results to disk with TTL:

```python
from src.cache.cache_decorator import cache_to_disk

@cache_to_disk(ttl=3600)
def expensive_function(arg1, arg2):
    # Expensive computation
    return result

# First call - cache miss
result = expensive_function("a", "b")

# Second call with same args - cache hit!
result = expensive_function("a", "b")
```

### @cache_in_memory

Cache function results in memory with LRU:

```python
from src.cache.cache_decorator import cache_in_memory

@cache_in_memory(maxsize=128)
def fast_lookup(key):
    # Quick computation
    return result

# Access cache info
info = fast_lookup.cache_info()
# Returns: CacheInfo(hits=45, misses=5, maxsize=128, currsize=50)
```

### @cache_llm_call

Specialized decorator for LLM calls:

```python
from src.cache.cache_decorator import cache_llm_call

@cache_llm_call(ttl=7200)
def call_llm(prompt, model="gpt-4"):
    return llm.invoke(prompt)

# Automatically caches based on prompt and model
response = call_llm("Analyze this...", model="gpt-4")
```

### @cache_async_to_disk

For async functions:

```python
from src.cache.cache_decorator import cache_async_to_disk

@cache_async_to_disk(ttl=3600)
async def async_expensive_function(arg1):
    result = await expensive_async_call(arg1)
    return result
```

## Cache Warming

Pre-load frequently accessed data on startup:

```python
from src.cache import warm_caches_on_startup, validate_cache_health

# Warm caches synchronously on startup
stats = warm_caches_on_startup(include_compliance=True)
print(f"Warmed {stats['rules_loaded']} rules, {stats['legal_texts_loaded']} texts")

# Warm caches in background
warm_caches_on_startup(include_compliance=True, background=True)

# Validate cache health
health = validate_cache_health()
if health['status'] == 'healthy':
    print("Cache is healthy")
else:
    print(f"Cache issues: {health['issues']}")
```

## Cache Management Script

Use the management script for cache operations:

```bash
# Show cache statistics
python scripts/manage_cache.py stats

# Show cache configuration
python scripts/manage_cache.py info

# Warm caches
python scripts/manage_cache.py warm

# Clear old cache entries (7+ days)
python scripts/manage_cache.py clear_old

# Clear all caches
python scripts/manage_cache.py clear_all

# Clear old entries with custom days
python scripts/manage_cache.py clear_old 14
```

## Integration with Existing Code

### Compliance Orchestrator

LLM calls in the orchestrator are automatically cached:

```python
# src/agents/compliance_orchestrator.py

# Legal research responses are cached with 2-hour TTL
response = self.llm.invoke([
    SystemMessage(content="..."),
    HumanMessage(content=research_prompt)
])
```

### Compliance Engine

Rules and evidence catalog are cached on load:

```python
# src/compliance_engine.py

engine = ComplianceRuleEngine()
# Rules are loaded and cached automatically
rules = engine._load_rules()  # Cached!
```

## Performance Improvements

Expected improvements with caching:

1. **Memory Cache**:
   - Compliance rules loading: ~100x faster (0.5ms vs 50ms)
   - Legal text lookups: ~50x faster (1ms vs 50ms)
   - Sector requirements: ~30x faster (2ms vs 60ms)

2. **Disk Cache**:
   - LLM responses: Instant (0ms vs 2000-5000ms per call)
   - Legal research: ~100% speedup on repeated queries
   - Risk assessment: ~100% speedup on similar projects

3. **Overall**:
   - Repeated compliance checks: 60-80% faster
   - Dashboard loading: 50-70% faster
   - API response times: 40-60% faster

## Best Practices

1. **Cache Invalidation**:
   - Clear cache when rules/regulations change
   - Use appropriate TTL values
   - Monitor cache hit rates

2. **Cache Size Management**:
   - Run periodic cleanup (weekly recommended)
   - Monitor disk cache size
   - Set reasonable TTL values

3. **Error Handling**:
   - Cache failures should not break application
   - Log cache misses for monitoring
   - Graceful degradation when cache unavailable

4. **Development**:
   - Disable caching for testing: `ENABLE_CACHING=False`
   - Clear cache between major changes
   - Monitor cache statistics during development

## Monitoring

### Cache Hit Rates

Monitor cache effectiveness:

```python
from src.cache.memory_cache import get_cache_stats

stats = get_cache_stats()
for cache_name, info in stats.items():
    total = info['hits'] + info['misses']
    if total > 0:
        hit_rate = info['hits'] / total * 100
        print(f"{cache_name}: {hit_rate:.1f}% hit rate")
```

### Disk Cache Size

Monitor disk usage:

```python
from src.cache.disk_cache import get_cache_size

size = get_cache_size()
if size['total_size_mb'] > 500:  # Warn if > 500MB
    print(f"Cache is large: {size['total_size_mb']:.1f} MB")
    # Consider running cleanup
```

## Troubleshooting

### Cache Not Working

1. Check configuration:
```bash
python scripts/manage_cache.py info
```

2. Verify ENABLE_CACHING is True in .env

3. Check cache directory permissions

4. Review logs for cache errors

### Cache Too Large

1. Clear old entries:
```bash
python scripts/manage_cache.py clear_old 3  # Clear 3+ days old
```

2. Reduce TTL values in .env

3. Implement cache size limits

### Cache Misses

1. Verify cache key generation
2. Check TTL hasn't expired
3. Monitor cache statistics
4. Ensure cache warming is running

## Future Enhancements

Potential improvements:

1. **Redis Integration**: Add Redis as optional cache backend
2. **Distributed Caching**: Support for multi-instance deployments
3. **Cache Versioning**: Automatic invalidation on version changes
4. **Smart Warming**: ML-based prediction of cache needs
5. **Cache Metrics**: Prometheus/Grafana integration

## API Reference

See inline documentation in:
- `src/cache/memory_cache.py`
- `src/cache/disk_cache.py`
- `src/cache/cache_decorator.py`
- `src/cache/cache_warmer.py`
