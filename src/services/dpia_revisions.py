"""Versioned human prose edits with an unchanged assessment and risk basis."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
import hashlib
import json
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import update
from sqlalchemy.orm import Session

from src.database.cases import Case
from src.database.dpia import (
    DPIAAssessmentRecord,
    assessment_result_payload,
    get_assessment,
    save_assessment,
)
from src.services.dpia_assessment import DPIAAssessmentResponse


class RevisionConflict(ValueError):
    """A stale base or reused request identity cannot produce another revision."""


class RevisionChange(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    kind: Literal["section", "risk", "summary", "scope"]
    target_id: str = Field(min_length=1, max_length=64)
    field: Literal[
        "text",
        "scenario",
        "measures",
        "rationale",
        "consequences",
        "executive_summary",
        "scope",
    ]
    text: str = Field(min_length=1, max_length=20_000)
    source_ids: list[str] = Field(max_length=100)

    @model_validator(mode="after")
    def validate_target(self):
        allowed = {
            "section": {"text"},
            "risk": {"scenario", "measures", "rationale", "consequences"},
            "summary": {"executive_summary"},
            "scope": {"scope"},
        }
        if self.field not in allowed[self.kind]:
            raise ValueError("Feltet kan ikke redigeres for dette rapportafsnit.")
        if self.kind in {"summary", "scope"} and self.target_id != self.kind:
            raise ValueError("Resumé og afgrænsning skal angives med deres faste ID.")
        if len(self.source_ids) != len(set(self.source_ids)) or any(
            not item or len(item) > 250 for item in self.source_ids
        ):
            raise ValueError("Kildehenvisninger skal være entydige og gyldige.")
        return self

    @property
    def target(self) -> str:
        return (
            f"{self.kind}:{self.target_id}"
            if self.kind in {"section", "risk"}
            else self.kind
        )


class RevisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    changes: list[RevisionChange] = Field(min_length=1, max_length=100)
    note: str = Field(min_length=10, max_length=2_000)
    request_id: UUID

    @model_validator(mode="after")
    def validate_changes(self):
        if sum(len(item.text) for item in self.changes) > 200_000:
            raise ValueError("Ændringerne fylder for meget til én rapportversion.")
        seen = set()
        shared_sources = {}
        for item in self.changes:
            key = (item.target, item.field)
            if key in seen:
                raise ValueError("Et tekstfelt må kun optræde én gang.")
            seen.add(key)
            source_key = "summary" if item.kind == "scope" else item.target
            value = set(item.source_ids)
            if source_key in shared_sources and shared_sources[source_key] != value:
                raise ValueError(
                    "Felter i samme afsnit skal have de samme kildehenvisninger."
                )
            shared_sources[source_key] = value
        return self


def latest_case_assessment(db: Session, case_id: str) -> DPIAAssessmentRecord | None:
    return (
        db.query(DPIAAssessmentRecord)
        .filter_by(case_db_id=case_id)
        .order_by(
            DPIAAssessmentRecord.version.desc(),
            DPIAAssessmentRecord.created_at.desc(),
            DPIAAssessmentRecord.id.desc(),
        )
        .first()
    )


def _lock_case(db: Session, case_id: str) -> None:
    # Same parent-row lock used by save_assessment's version allocator. It
    # protects the freshness check and idempotency check as one transaction.
    if db.get_bind().dialect.name == "sqlite":
        changed = db.execute(
            update(Case)
            .where(Case.id == case_id)
            .values(id=Case.id, updated_at=Case.updated_at)
            .execution_options(synchronize_session=False)
        )
        exists = changed.rowcount == 1
    else:
        exists = (
            db.query(Case).filter(Case.id == case_id).with_for_update().one_or_none()
        ) is not None
    if not exists:
        raise RevisionConflict("Vurderingen skal være knyttet til en eksisterende sag.")


def revision_fingerprint(base_id: str, payload: RevisionInput) -> str:
    value = {
        "base_id": base_id,
        **payload.model_dump(mode="json", exclude={"request_id"}),
    }
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode()
    ).hexdigest()


def revise_assessment(
    db: Session,
    base_id: str,
    payload: RevisionInput,
    *,
    actor_id: str,
    actor_name: str,
) -> DPIAAssessmentRecord:
    """Save an immutable child. The caller owns commit/rollback."""
    base = get_assessment(db, base_id)
    if base is None:
        raise LookupError("Konsekvensanalysen blev ikke fundet.")
    if not base.case_db_id:
        raise RevisionConflict(
            "Vurderingen skal være knyttet til en sag før redigering."
        )
    _lock_case(db, base.case_db_id)
    fingerprint = revision_fingerprint(base_id, payload)
    prior = (
        db.query(DPIAAssessmentRecord)
        .filter(
            DPIAAssessmentRecord.case_db_id == base.case_db_id,
            DPIAAssessmentRecord.result_payload["editorial_revision"][
                "request_id"
            ].as_string()
            == str(payload.request_id),
        )
        .first()
    )
    if prior is not None:
        metadata = prior.result_payload.get("editorial_revision") or {}
        if (
            metadata.get("request_fingerprint") != fingerprint
            or metadata.get("actor_id") != actor_id
        ):
            raise RevisionConflict(
                "Denne gemmehandling er allerede brugt til en anden ændring."
            )
        return prior
    latest = latest_case_assessment(db, base.case_db_id)
    if latest is None or latest.id != base.id:
        raise RevisionConflict(
            "Der findes en nyere version på sagen. Åbn den før du redigerer videre."
        )

    original = DPIAAssessmentResponse.model_validate(assessment_result_payload(base))
    candidate = original.model_copy(deep=True)
    known_sources = {
        item.get("id")
        for item in (original.ai_generation or {}).get("sources", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    before = original.model_dump(mode="json")
    changes = []
    sections = {item.id: item for item in candidate.sections}
    risks = {item.id: item for item in candidate.risks}
    for item in payload.changes:
        if not set(item.source_ids).issubset(known_sources):
            raise ValueError("Kilden findes ikke i denne gemte rapportversion.")
        if item.kind in {"section", "risk"}:
            target = (sections if item.kind == "section" else risks).get(item.target_id)
            if target is None:
                raise ValueError("Rapportafsnittet findes ikke i denne version.")
            if item.kind == "section" and target.review_status in {
                "missing_information",
                "not_applicable",
            }:
                raise ValueError(
                    "Afsnit med manglende oplysninger eller uden relevans skal afklares i spørgerammen."
                )
            prior_target = next(
                value
                for value in before["sections" if item.kind == "section" else "risks"]
                if value["id"] == item.target_id
            )
            old_text = prior_target[item.field]
            old_sources = prior_target.get("source_ids", [])
            setattr(target, item.field, item.text)
            target.source_ids = list(item.source_ids)
        else:
            old_text = before[item.field]
            old_sources = before["summary_source_ids"]
            setattr(candidate, item.field, item.text)
            candidate.summary_source_ids = list(item.source_ids)
        if old_text == item.text and old_sources == item.source_ids:
            continue
        changes.append(
            {
                "kind": item.kind,
                "target_id": item.target_id,
                "target": item.target,
                "field": item.field,
                "before": {"text": old_text, "source_ids": old_sources},
                "after": {"text": item.text, "source_ids": list(item.source_ids)},
            }
        )
    if not changes:
        raise ValueError("Der er ingen ændringer at gemme.")
    now = datetime.now(UTC)
    changed_targets = list(dict.fromkeys(item["target"] for item in changes))
    stale = set((original.editorial_revision or {}).get("stale_check_ids", []))
    stale.update(
        "summary" if target == "scope" else target for target in changed_targets
    )
    # Advice was checked against the earlier report context. A prose change
    # can alter its relevance even when the cited source snapshot is unchanged.
    # Without a dependency graph, require a new contextual review of every
    # saved recommendation; preserve the original checks as audit evidence.
    stale.update(f"recommendation:{item.id}" for item in original.recommendations)
    candidate.id = str(uuid4())
    candidate.created_at = now
    candidate.parent_assessment_id = base.id
    candidate.editorial_revision = {
        "request_id": str(payload.request_id),
        "request_fingerprint": fingerprint,
        "actor_id": actor_id,
        "edited_by": actor_name,
        "edited_at": now.isoformat(),
        "note": payload.note,
        "changed_targets": changed_targets,
        "changes": changes,
        "stale_check_ids": sorted(stale),
        "review_status": "pending_recheck",
        "base_assessment_id": base.id,
        "human_review_required": True,
    }
    # All fields outside the explicit prose/source allowlist come from the
    # deep copy: scores, rule decisions, blockers and legal receipts are fixed.
    candidate = DPIAAssessmentResponse.model_validate(candidate.model_dump(mode="json"))
    return save_assessment(
        db,
        assessment_id=candidate.id,
        created_at=now,
        request_payload=deepcopy(base.request_payload),
        result_payload=candidate.model_dump(mode="json"),
        case_db_id=base.case_db_id,
    )


def revision_history(db: Session, base_id: str, *, limit: int = 100) -> dict:
    base = get_assessment(db, base_id)
    if base is None:
        raise LookupError("Konsekvensanalysen blev ikke fundet.")
    query = db.query(DPIAAssessmentRecord)
    query = (
        query.filter_by(case_db_id=base.case_db_id)
        if base.case_db_id
        else query.filter_by(id=base.id)
    )
    records = (
        query.order_by(
            DPIAAssessmentRecord.version.desc(),
            DPIAAssessmentRecord.created_at.desc(),
            DPIAAssessmentRecord.id.desc(),
        )
        .limit(limit)
        .all()
    )
    return {
        "base_id": base.id,
        "latest_id": records[0].id if records else base.id,
        "items": [
            {
                "id": record.id,
                "version": record.version,
                "created_at": record.created_at.isoformat(),
                "parent_assessment_id": record.result_payload.get(
                    "parent_assessment_id"
                ),
                "editorial_revision": record.result_payload.get("editorial_revision"),
            }
            for record in records
        ],
    }
