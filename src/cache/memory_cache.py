"""
In-memory LRU cache for frequently accessed static data
Uses functools.lru_cache for automatic memory management
"""

import logging
from functools import lru_cache
from typing import Dict, List, Any, Optional
import os

logger = logging.getLogger(__name__)

# Cache size limits
RULES_CACHE_SIZE = 128
LEGAL_TEXTS_CACHE_SIZE = 256


@lru_cache(maxsize=RULES_CACHE_SIZE)
def cached_compliance_rules(category: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Cache compliance rules from rule engine

    Args:
        category: Optional filter for rule category (ai_act, gdpr, etc.)

    Returns:
        List of compliance rules
    """
    from src.compliance_engine import ComplianceRuleEngine

    logger.debug(f"Loading compliance rules from rule engine (category: {category})")

    try:
        engine = ComplianceRuleEngine()
        rules = engine._load_rules()

        # Convert to dictionaries for caching
        rule_dicts = []
        for rule in rules:
            if category and rule.category.value != category:
                continue

            rule_dicts.append({
                "rule_id": rule.rule_id,
                "category": rule.category.value,
                "description": rule.description,
                "conditions": rule.conditions,
                "outcomes": rule.outcomes,
                "severity": rule.severity,
                "required_evidence": rule.required_evidence,
                "weight": rule.weight,
            })

        logger.info(f"Cached {len(rule_dicts)} compliance rules")
        return rule_dicts

    except Exception as e:
        logger.error(f"Failed to load compliance rules: {e}")
        return []


@lru_cache(maxsize=LEGAL_TEXTS_CACHE_SIZE)
def cached_legal_texts(framework: str, article: Optional[str] = None) -> Dict[str, Any]:
    """
    Cache static legal texts and documentation

    Args:
        framework: Legal framework (ai_act, gdpr, etc.)
        article: Optional specific article/section

    Returns:
        Dictionary containing legal text information
    """
    logger.debug(f"Loading legal text for {framework} (article: {article})")

    # Static legal texts database
    legal_db = {
        "ai_act": {
            "full_name": "EU AI Act (Regulation 2024/1689)",
            "articles": {
                "5": {
                    "title": "Prohibited AI Practices",
                    "summary": "Lists AI systems that are prohibited in the EU",
                    "text": "AI systems that deploy subliminal techniques, exploit vulnerabilities, or engage in social scoring are prohibited."
                },
                "6": {
                    "title": "Classification Rules for High-Risk AI Systems",
                    "summary": "Defines what constitutes a high-risk AI system",
                },
                "11": {
                    "title": "Technical Documentation",
                    "summary": "Requirements for technical documentation of high-risk AI systems",
                },
                "14": {
                    "title": "Human Oversight",
                    "summary": "Requirements for human oversight of high-risk AI systems",
                },
            }
        },
        "gdpr": {
            "full_name": "General Data Protection Regulation (EU 2016/679)",
            "articles": {
                "6": {
                    "title": "Lawfulness of Processing",
                    "summary": "Defines legal basis for processing personal data",
                    "text": "Processing shall be lawful only if at least one of the following applies: consent, contract, legal obligation, vital interests, public task, or legitimate interests."
                },
                "9": {
                    "title": "Processing of Special Categories of Personal Data",
                    "summary": "Rules for processing sensitive personal data",
                },
                "22": {
                    "title": "Automated Individual Decision-making",
                    "summary": "Rights related to automated decision-making and profiling",
                },
                "32": {
                    "title": "Security of Processing",
                    "summary": "Requirements for appropriate security measures",
                },
                "35": {
                    "title": "Data Protection Impact Assessment",
                    "summary": "Requirements for conducting DPIAs",
                },
            }
        },
        "danish_data_act": {
            "full_name": "Danish Data Protection Act (Databeskyttelsesloven)",
            "articles": {
                "general": {
                    "title": "Danish Implementation of GDPR",
                    "summary": "National implementation and specific Danish requirements",
                }
            }
        }
    }

    framework_data = legal_db.get(framework.lower(), {})

    if article:
        article_data = framework_data.get("articles", {}).get(article, {})
        return {
            "framework": framework,
            "full_name": framework_data.get("full_name", framework),
            "article": article,
            **article_data
        }

    return framework_data


@lru_cache(maxsize=64)
def cached_evidence_catalog(artifact_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Cache evidence artifacts catalog

    Args:
        artifact_id: Optional specific artifact ID

    Returns:
        Evidence artifact information
    """
    from src.compliance_engine import ComplianceRuleEngine

    logger.debug(f"Loading evidence catalog (artifact: {artifact_id})")

    try:
        engine = ComplianceRuleEngine()
        catalog = engine._load_evidence_catalog()

        if artifact_id:
            artifact = catalog.get(artifact_id)
            if artifact:
                return {
                    "artifact_id": artifact.artifact_id,
                    "name": artifact.name,
                    "category": artifact.category,
                    "description": artifact.description,
                    "template_url": artifact.template_url,
                    "required_for": artifact.required_for,
                    "status": artifact.status,
                }
            return {}

        # Return all artifacts as dict
        return {
            aid: {
                "artifact_id": artifact.artifact_id,
                "name": artifact.name,
                "category": artifact.category,
                "description": artifact.description,
                "template_url": artifact.template_url,
                "required_for": artifact.required_for,
                "status": artifact.status,
            }
            for aid, artifact in catalog.items()
        }

    except Exception as e:
        logger.error(f"Failed to load evidence catalog: {e}")
        return {}


@lru_cache(maxsize=32)
def cached_sector_requirements(sector: str) -> Dict[str, Any]:
    """
    Cache sector-specific compliance requirements

    Args:
        sector: Sector name (health, finance, education, etc.)

    Returns:
        Sector-specific requirements and regulations
    """
    logger.debug(f"Loading sector requirements for {sector}")

    sector_db = {
        "health": {
            "specific_regulations": ["MDR", "IVDR", "Health Data Act"],
            "key_considerations": [
                "Medical device classification",
                "Clinical evidence requirements",
                "Patient safety and privacy",
                "Health data protection"
            ],
            "authorities": ["Danish Medicines Agency", "Datatilsynet"]
        },
        "finance": {
            "specific_regulations": ["MiFID II", "PSD2", "DORA"],
            "key_considerations": [
                "Financial advice regulations",
                "Anti-money laundering",
                "Consumer protection",
                "Risk management"
            ],
            "authorities": ["Finanstilsynet", "Datatilsynet"]
        },
        "education": {
            "specific_regulations": ["Education regulations", "Child protection laws"],
            "key_considerations": [
                "Student data protection",
                "Parental consent requirements",
                "Educational standards",
                "Bias prevention"
            ],
            "authorities": ["Ministry of Education", "Datatilsynet"]
        },
        "public_sector": {
            "specific_regulations": ["Forvaltningsloven", "Offentlighedsloven"],
            "key_considerations": [
                "Legal authority requirements",
                "Administrative law compliance",
                "Transparency obligations",
                "Citizen rights"
            ],
            "authorities": ["Ombudsmanden", "Datatilsynet"]
        }
    }

    return sector_db.get(sector.lower(), {
        "specific_regulations": [],
        "key_considerations": ["General compliance requirements apply"],
        "authorities": ["Datatilsynet"]
    })


def clear_memory_cache() -> None:
    """Clear all in-memory caches"""
    logger.info("Clearing all in-memory caches")

    cached_compliance_rules.cache_clear()
    cached_legal_texts.cache_clear()
    cached_evidence_catalog.cache_clear()
    cached_sector_requirements.cache_clear()

    logger.info("Memory cache cleared")


def get_cache_stats() -> Dict[str, Any]:
    """Get statistics about cache usage"""
    return {
        "compliance_rules": cached_compliance_rules.cache_info()._asdict(),
        "legal_texts": cached_legal_texts.cache_info()._asdict(),
        "evidence_catalog": cached_evidence_catalog.cache_info()._asdict(),
        "sector_requirements": cached_sector_requirements.cache_info()._asdict(),
    }
