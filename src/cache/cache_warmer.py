"""
Cache warming utilities for application startup
Pre-loads frequently accessed data into cache
"""

import logging
from typing import Optional
import asyncio

from src.cache.memory_cache import (
    cached_compliance_rules,
    cached_legal_texts,
    cached_sector_requirements,
    cached_evidence_catalog,
)

logger = logging.getLogger(__name__)


def warm_compliance_caches() -> dict:
    """
    Warm up compliance-related caches

    Returns:
        Dictionary with warming statistics
    """
    stats = {
        "rules_loaded": 0,
        "legal_texts_loaded": 0,
        "sectors_loaded": 0,
        "artifacts_loaded": 0,
        "errors": [],
    }

    logger.info("Warming compliance caches...")

    # Load all compliance rules
    try:
        rules = cached_compliance_rules()
        stats["rules_loaded"] += len(rules)
        logger.debug(f"Loaded {len(rules)} compliance rules")

        # Load rules by category
        for category in ["ai_act", "gdpr", "forvaltningsret", "sikkerhed"]:
            try:
                rules_cat = cached_compliance_rules(category=category)
                logger.debug(f"Loaded {len(rules_cat)} {category} rules")
            except Exception as e:
                logger.warning(f"Failed to load {category} rules: {e}")
                stats["errors"].append(f"Rules category {category}: {e}")

    except Exception as e:
        logger.error(f"Failed to load compliance rules: {e}")
        stats["errors"].append(f"Compliance rules: {e}")

    # Load legal texts
    frameworks = ["ai_act", "gdpr", "danish_data_act"]
    for framework in frameworks:
        try:
            text = cached_legal_texts(framework)
            stats["legal_texts_loaded"] += 1
            logger.debug(f"Loaded legal text: {framework}")

            # Load common articles
            if framework == "ai_act":
                for article in ["5", "6", "11", "14"]:
                    try:
                        cached_legal_texts(framework, article)
                    except Exception as e:
                        logger.debug(f"Could not load {framework} article {article}: {e}")

            elif framework == "gdpr":
                for article in ["6", "9", "22", "32", "35"]:
                    try:
                        cached_legal_texts(framework, article)
                    except Exception as e:
                        logger.debug(f"Could not load {framework} article {article}: {e}")

        except Exception as e:
            logger.warning(f"Failed to load legal text {framework}: {e}")
            stats["errors"].append(f"Legal text {framework}: {e}")

    # Load sector requirements
    sectors = ["health", "finance", "education", "public_sector"]
    for sector in sectors:
        try:
            reqs = cached_sector_requirements(sector)
            stats["sectors_loaded"] += 1
            logger.debug(f"Loaded sector requirements: {sector}")
        except Exception as e:
            logger.warning(f"Failed to load sector {sector}: {e}")
            stats["errors"].append(f"Sector {sector}: {e}")

    # Load evidence catalog
    try:
        catalog = cached_evidence_catalog()
        stats["artifacts_loaded"] = len(catalog)
        logger.debug(f"Loaded {len(catalog)} evidence artifacts")
    except Exception as e:
        logger.warning(f"Failed to load evidence catalog: {e}")
        stats["errors"].append(f"Evidence catalog: {e}")

    logger.info(
        f"Cache warming completed: "
        f"{stats['rules_loaded']} rules, "
        f"{stats['legal_texts_loaded']} legal texts, "
        f"{stats['sectors_loaded']} sectors, "
        f"{stats['artifacts_loaded']} artifacts"
    )

    if stats["errors"]:
        logger.warning(f"Cache warming had {len(stats['errors'])} errors")

    return stats


async def warm_caches_async() -> dict:
    """
    Async version of cache warming

    Returns:
        Dictionary with warming statistics
    """
    logger.info("Starting async cache warming...")

    # Run cache warming in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    stats = await loop.run_in_executor(None, warm_compliance_caches)

    logger.info("Async cache warming completed")
    return stats


def warm_caches_on_startup(
    include_compliance: bool = True,
    background: bool = False
) -> Optional[dict]:
    """
    Warm caches on application startup

    Args:
        include_compliance: Whether to warm compliance caches
        background: Run warming in background (async)

    Returns:
        Warming statistics if not background, None if background
    """
    logger.info("Warming caches on startup...")

    stats = {}

    try:
        if include_compliance:
            if background:
                # Schedule warming in background
                asyncio.create_task(warm_caches_async())
                logger.info("Cache warming scheduled in background")
                return None
            else:
                # Warm synchronously
                stats.update(warm_compliance_caches())

        return stats

    except Exception as e:
        logger.error(f"Cache warming on startup failed: {e}")
        return {"errors": [str(e)]}


def schedule_periodic_warming(interval_hours: int = 24):
    """
    Schedule periodic cache warming

    Args:
        interval_hours: Hours between cache warming cycles
    """
    async def periodic_warming():
        while True:
            try:
                logger.info(f"Running scheduled cache warming (every {interval_hours}h)")
                await warm_caches_async()
                await asyncio.sleep(interval_hours * 3600)
            except asyncio.CancelledError:
                logger.info("Periodic cache warming cancelled")
                break
            except Exception as e:
                logger.error(f"Periodic cache warming failed: {e}")
                # Continue despite errors
                await asyncio.sleep(interval_hours * 3600)

    # Create task
    task = asyncio.create_task(periodic_warming())
    logger.info(f"Scheduled periodic cache warming every {interval_hours} hours")

    return task


def validate_cache_health() -> dict:
    """
    Validate cache health and check for issues

    Returns:
        Dictionary with health status
    """
    health = {
        "status": "healthy",
        "issues": [],
        "warnings": [],
    }

    # Check if caches are responding
    try:
        rules = cached_compliance_rules()
        if not rules:
            health["warnings"].append("Compliance rules cache is empty")
    except Exception as e:
        health["status"] = "unhealthy"
        health["issues"].append(f"Compliance rules cache error: {e}")

    try:
        text = cached_legal_texts("ai_act")
        if not text:
            health["warnings"].append("Legal texts cache is empty")
    except Exception as e:
        health["status"] = "unhealthy"
        health["issues"].append(f"Legal texts cache error: {e}")

    # Check cache directory
    from src.cache.disk_cache import CACHE_DIR

    if not CACHE_DIR.exists():
        health["warnings"].append("Disk cache directory does not exist")

    # Check cache size
    from src.cache.disk_cache import get_cache_size

    try:
        size_stats = get_cache_size()
        total_mb = size_stats.get("total_size_mb", 0)

        # Warn if cache is very large (> 1GB)
        if total_mb > 1024:
            health["warnings"].append(f"Disk cache is large: {total_mb:.0f} MB")

    except Exception as e:
        health["issues"].append(f"Could not check disk cache size: {e}")

    logger.info(f"Cache health check: {health['status']}")
    if health["issues"]:
        logger.warning(f"Cache health issues: {health['issues']}")
    if health["warnings"]:
        logger.info(f"Cache health warnings: {health['warnings']}")

    return health
