"""Shared contracts for deterministic assessments linked to a Hammeren case.

The models in this module deliberately contain no persistence or HTTP concerns.
They give the AI Act and fundamental-rights assessments the same case identity,
source-receipt and audit metadata fields before those services are wired into the
API and database.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class CaseLinkedAssessmentRequest(BaseModel):
    """Common, strict identity fields used by case-level assessments."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        protected_namespaces=(),
    )

    case_id: str = Field(
        min_length=2,
        max_length=64,
        pattern=r"^[A-Za-z0-9ÆØÅæøå][A-Za-z0-9ÆØÅæøå._:/\- ]{1,63}$",
        description="Kommunens eksisterende sags-id; samme felt som i sagsflowet.",
    )
    system_name: str = Field(min_length=2, max_length=255)


class AssessmentSource(BaseModel):
    """A human-readable legal or methodology source receipt."""

    id: str = Field(min_length=2, max_length=100)
    title: str = Field(min_length=2, max_length=500)
    provision: str = Field(min_length=2, max_length=255)
    url: str = Field(min_length=10, max_length=2_000)
    authority: Literal[
        "eu_legislation",
        "eu_commission",
        "national_government_methodology",
    ]


class AssessmentMeta(BaseModel):
    """Stable audit metadata shared by deterministic assessment responses."""

    assessment_id: str
    case_id: str
    system_name: str
    assessed_at: datetime
    methodology_version: str
    legal_notice: str


def assessment_identity(
    *,
    assessment_id: str | None = None,
    assessed_at: datetime | None = None,
) -> tuple[str, datetime]:
    """Return explicit audit values or safe defaults for service-only callers."""

    return assessment_id or str(uuid4()), assessed_at or datetime.now(UTC)
