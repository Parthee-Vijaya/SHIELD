"""Human follow-up never mutates an assessment, JEV result, or locked score."""

from datetime import UTC, datetime
from typing import Any, cast
from sqlalchemy import update
from sqlalchemy.orm import Session
from src.auth import UserPrincipal
from src.database.dpia import DPIAAssessmentRecord
from src.database.technical_controls import (
    TechnicalControlPoint,
    TechnicalControlPointRevision,
)
from src.services.technical_runs import build_technical_runs


class ControlConflict(ValueError):
    pass


def _iso(value):
    return (
        value.replace(tzinfo=UTC).isoformat()
        if value.tzinfo is None
        else value.isoformat()
    )


def _snapshot(record):
    return {
        key: getattr(record, key) for key in ("question", "notes", "owner", "status")
    }


def _audit(db, record, actor, action):
    db.add(
        TechnicalControlPointRevision(
            control_point_id=record.id,
            version=record.version,
            action=action,
            snapshot=_snapshot(record),
            actor_id=actor.oid,
            actor_name=actor.name,
            identity_assurance=actor.identity_assurance,
            created_at=record.updated_at,
        )
    )
    db.flush()


def _serialize(record, revisions):
    return {
        "id": record.id,
        "case_id": record.case_db_id,
        "assessment_id": record.assessment_id,
        "original_check_id": record.original_check_id,
        **_snapshot(record),
        "version": record.version,
        "created_at": _iso(record.created_at),
        "updated_at": _iso(record.updated_at),
        "origin": "human",
        "jev_reviewed": False,
        "requires_new_review": True,
        "history": [
            {
                "version": revision.version,
                "action": revision.action,
                "snapshot": revision.snapshot,
                "actor_id": revision.actor_id,
                "actor_name": revision.actor_name,
                "identity_assurance": revision.identity_assurance,
                "created_at": _iso(revision.created_at),
            }
            for revision in revisions
        ],
    }


def control_payload(db, record):
    revisions = (
        db.query(TechnicalControlPointRevision)
        .filter_by(control_point_id=record.id)
        .order_by(TechnicalControlPointRevision.version.desc())
        .all()
    )
    return _serialize(record, revisions)


def attach_human_controls(db: Session, payload: dict) -> dict:
    controls = (
        db.query(TechnicalControlPoint)
        .filter_by(case_db_id=payload["case_id"])
        .order_by(TechnicalControlPoint.created_at, TechnicalControlPoint.id)
        .all()
    )
    ids = [record.id for record in controls]
    history = (
        db.query(TechnicalControlPointRevision)
        .filter(TechnicalControlPointRevision.control_point_id.in_(ids))
        .order_by(TechnicalControlPointRevision.version.desc())
        .all()
        if ids
        else []
    )
    grouped: dict[str, list[TechnicalControlPointRevision]] = {}
    for revision in history:
        grouped.setdefault(cast(str, revision.control_point_id), []).append(revision)
    by_assessment: dict[str, list[dict[str, Any]]] = {}
    for record in controls:
        by_assessment.setdefault(cast(str, record.assessment_id), []).append(
            _serialize(record, grouped.get(cast(str, record.id), []))
        )
    for run in payload["runs"]:
        run["human_controls"] = by_assessment.get(run.get("assessment_id"), [])
    return payload


def create_control(db: Session, case_id: str, data: dict, actor: UserPrincipal):
    assessment = (
        db.query(DPIAAssessmentRecord)
        .filter_by(id=data["assessment_id"], case_db_id=case_id)
        .one_or_none()
    )
    if assessment is None:
        raise LookupError("Vurderingsversionen blev ikke fundet på denne sag.")
    original_id = data.get("original_check_id")
    if original_id:
        # Resolve inherited controls for editorial revisions within this case only.
        run = next(
            (
                run
                for run in build_technical_runs(db, case_id)["runs"]
                if run.get("assessment_id") == assessment.id
            ),
            None,
        )
        checks = ((run or {}).get("review") or {}).get("checks", [])
        if not any(check.get("id") == original_id for check in checks):
            raise LookupError(
                "Det oprindelige JEV-kontrolpunkt blev ikke fundet i denne version."
            )
        if (
            db.query(TechnicalControlPoint)
            .filter_by(
                case_db_id=case_id,
                assessment_id=assessment.id,
                original_check_id=original_id,
            )
            .first()
        ):
            raise ControlConflict(
                "Punktet har allerede en menneskelig opfølgning. Genindlæs og rediger den."
            )
    now = datetime.now(UTC)
    record = TechnicalControlPoint(
        case_db_id=case_id, **data, version=1, created_at=now, updated_at=now
    )
    db.add(record)
    db.flush()
    _audit(db, record, actor, "created")
    return control_payload(db, record)


def update_control(
    db: Session, case_id: str, control_id: str, data: dict, actor: UserPrincipal
):
    record = (
        db.query(TechnicalControlPoint)
        .filter_by(id=control_id, case_db_id=case_id)
        .one_or_none()
    )
    if record is None:
        raise LookupError("Kontrolpunktet blev ikke fundet på denne sag.")
    expected = data["expected_version"]
    if record.version != expected:
        raise ControlConflict(
            "Kontrolpunktet er ændret af en anden. Genindlæs før du gemmer igen."
        )
    changes = {key: value for key, value in data.items() if key != "expected_version"}
    statement = (
        update(TechnicalControlPoint)
        .where(
            TechnicalControlPoint.id == control_id,
            TechnicalControlPoint.case_db_id == case_id,
            TechnicalControlPoint.version == expected,
        )
        .values(**changes, version=expected + 1, updated_at=datetime.now(UTC))
    )
    if db.execute(statement.execution_options(synchronize_session=False)).rowcount != 1:
        raise ControlConflict(
            "Kontrolpunktet er ændret af en anden. Genindlæs før du gemmer igen."
        )
    db.refresh(record)
    _audit(db, record, actor, "updated")
    return control_payload(db, record)
