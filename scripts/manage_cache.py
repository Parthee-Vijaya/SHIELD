#!/usr/bin/env python3
"""
Cache Management Script for Judge Dredd AI Compliance Platform

Usage:
    python scripts/manage_cache.py clear_all     - Clear all caches
    python scripts/manage_cache.py clear_old     - Clear old cache entries (7+ days)
    python scripts/manage_cache.py stats         - Show cache statistics
    python scripts/manage_cache.py warm          - Pre-warm cache with common queries
    python scripts/manage_cache.py info          - Show cache configuration
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.cache.disk_cache import (
    clear_all_disk_cache,
    clear_old_cache,
    get_cache_size,
    CACHE_DIR,
    DEFAULT_TTL,
    ENABLE_CACHING,
)
from src.cache.memory_cache import (
    clear_memory_cache,
    get_cache_stats,
    cached_compliance_rules,
    cached_legal_texts,
    cached_sector_requirements,
)
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def clear_all():
    """Clear all caches (disk and memory)"""
    print("\nClearing all caches...")

    # Clear disk cache
    disk_cleared = clear_all_disk_cache()
    print(f"  Disk cache: {disk_cleared} entries cleared")

    # Clear memory cache
    clear_memory_cache()
    print("  Memory cache: cleared")

    print("\nAll caches cleared successfully!")


def clear_old(days: int = 7):
    """Clear cache entries older than specified days"""
    print(f"\nClearing cache entries older than {days} days...")

    cleared = clear_old_cache(days=days)
    print(f"  Cleared {cleared} old entries")

    print("\nOld cache entries cleared successfully!")


def show_stats():
    """Show cache statistics"""
    print("\n" + "=" * 60)
    print("CACHE STATISTICS")
    print("=" * 60)

    # Disk cache stats
    print("\nDisk Cache:")
    disk_stats = get_cache_size()
    print(f"  Total entries: {disk_stats['total_entries']}")
    print(f"  Total size: {disk_stats['total_size_mb']:.2f} MB")

    for cache_type, stats in disk_stats.get("by_type", {}).items():
        print(f"\n  {cache_type}:")
        print(f"    Entries: {stats['entries']}")
        print(f"    Size: {stats['size_mb']:.2f} MB")

    # Memory cache stats
    print("\nMemory Cache (LRU):")
    mem_stats = get_cache_stats()

    for cache_name, stats in mem_stats.items():
        print(f"\n  {cache_name}:")
        print(f"    Hits: {stats['hits']}")
        print(f"    Misses: {stats['misses']}")
        print(f"    Size: {stats['currsize']}/{stats['maxsize']}")
        if stats['hits'] + stats['misses'] > 0:
            hit_rate = stats['hits'] / (stats['hits'] + stats['misses']) * 100
            print(f"    Hit rate: {hit_rate:.1f}%")

    print("\n" + "=" * 60)


def warm_cache():
    """Pre-warm cache with common queries"""
    print("\nWarming cache with common queries...")

    try:
        # Warm compliance rules cache
        print("  Loading compliance rules...")
        rules = cached_compliance_rules()
        print(f"    Loaded {len(rules)} rules")

        # Load rules by category
        for category in ["ai_act", "gdpr", "forvaltningsret"]:
            rules_cat = cached_compliance_rules(category=category)
            print(f"    Loaded {len(rules_cat)} {category} rules")

        # Warm legal texts cache
        print("  Loading legal texts...")
        for framework in ["ai_act", "gdpr", "danish_data_act"]:
            text = cached_legal_texts(framework)
            print(f"    Loaded {framework}")

        # Warm sector requirements cache
        print("  Loading sector requirements...")
        for sector in ["health", "finance", "education", "public_sector"]:
            reqs = cached_sector_requirements(sector)
            print(f"    Loaded {sector} requirements")

        print("\nCache warming completed successfully!")

    except Exception as e:
        logger.error(f"Cache warming failed: {e}")
        print(f"\nCache warming failed: {e}")
        sys.exit(1)


def show_info():
    """Show cache configuration"""
    print("\n" + "=" * 60)
    print("CACHE CONFIGURATION")
    print("=" * 60)

    print(f"\nCache Directory: {CACHE_DIR}")
    print(f"Default TTL: {DEFAULT_TTL} seconds ({DEFAULT_TTL/3600:.1f} hours)")
    print(f"Caching Enabled: {ENABLE_CACHING}")

    # Check if cache directory exists
    if CACHE_DIR.exists():
        print(f"\nCache directory exists: Yes")
        print(f"Cache directory path: {CACHE_DIR.absolute()}")
    else:
        print(f"\nCache directory exists: No (will be created on first use)")

    print("\n" + "=" * 60)


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    commands = {
        "clear_all": clear_all,
        "clear_old": lambda: clear_old(int(sys.argv[2]) if len(sys.argv) > 2 else 7),
        "stats": show_stats,
        "warm": warm_cache,
        "info": show_info,
    }

    if command not in commands:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

    try:
        commands[command]()
    except Exception as e:
        logger.error(f"Command failed: {e}")
        print(f"\nError: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
