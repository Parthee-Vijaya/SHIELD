"""Source origin is a provenance label, never verification or approval."""

from collections.abc import Mapping
from typing import Any

NEEDS_CATEGORY = "needs_description"
NEEDS_LABEL = "Kommunens behovsbeskrivelse"
NEEDS_EVIDENCE_TYPE = "municipal_needs_statement"
SUPPLIER_NOTICE = (
    "Kildematerialet er leverandøroplysninger og er ikke juridisk godkendt. "
    "Oplysninger skal efterprøves i den konkrete anvendelse."
)
NEEDS_NOTICE = (
    "Kommunens behovsbeskrivelse angiver behov, krav og planlagt anvendelse. "
    "Den dokumenterer ikke leverandørens egenskaber, faktisk implementering "
    "eller juridisk godkendelse. Forholdene skal efterprøves."
)
# These fields describe supplier capabilities or operational arrangements.
# A needs statement can request them, but cannot establish that they exist.
NEEDS_RESTRICTED_FACT_FIELDS = frozenset(
    {
        "supplier_name",
        "solution_type",
        "hosting_region",
        "transfer_outside_eea",
        "model_training",
        "retention_period",
        "human_oversight",
    }
)


def source_classification(category: str | None) -> dict[str, str]:
    """Derive from document category, never from uploaded metadata."""
    if category == NEEDS_CATEGORY:
        return {
            "category": NEEDS_CATEGORY,
            "evidence_type": NEEDS_EVIDENCE_TYPE,
            "evidence_label": NEEDS_LABEL,
            "evidence_notice": NEEDS_NOTICE,
        }
    return {
        "category": category or "other",
        "evidence_type": "supplier_statement",
        "evidence_label": "Leverandøroplysninger",
        "evidence_notice": SUPPLIER_NOTICE,
    }


def source_warnings(warnings: list[str], category: str | None) -> list[str]:
    notice = source_classification(category)["evidence_notice"]
    return list(
        dict.fromkeys(
            [
                notice,
                *[
                    warning
                    for warning in warnings
                    if warning not in {SUPPLIER_NOTICE, NEEDS_NOTICE}
                ],
            ]
        )
    )


def source_origin_label(source: Mapping[str, Any]) -> str:
    """Render persisted provenance, not inferred origin for legal sources."""
    if (
        source.get("category") == NEEDS_CATEGORY
        or source.get("evidence_type") == NEEDS_EVIDENCE_TYPE
    ):
        return NEEDS_LABEL
    if source.get("evidence_type") == "supplier_statement":
        return "Leverandøroplysninger"
    return ""
