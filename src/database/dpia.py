"""Persistence model and repository helpers for DPIA assessments.

The request and the complete deterministic result are stored together.  This
is deliberate: a DPIA must remain reproducible and auditable even when the
questionnaire or the deterministic rules are changed later.
"""

from __future__ import annotations

from datetime import UTC, datetime
from copy import deepcopy
from typing import Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    func,
    exists,
    inspect,
    update,
)
from sqlalchemy.orm import Mapped, Session, mapped_column

from .connection import Base
from .case_visibility import internal_test_title, visible_title


class DPIAAssessmentRecord(Base):
    """A versioned, immutable snapshot of one generated DPIA draft."""

    __tablename__ = "dpia_assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Workflow linkage is intentionally nullable: historic DPIAs remain valid
    # snapshots even when they predate the case workspace.
    case_db_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("cases.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    project_name: Mapped[str] = mapped_column(String(500), nullable=False)
    organisation: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    risk_level: Mapped[str] = mapped_column(String(32), nullable=False)
    template_version: Mapped[str] = mapped_column(String(64), nullable=False)
    request_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    result_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        Index("idx_dpia_case_created", "case_db_id", "created_at"),
        Index("idx_dpia_created_at", "created_at"),
        Index("idx_dpia_project_name", "project_name"),
        Index("idx_dpia_status_risk", "status", "risk_level"),
    )


REQUIRED_DPIA_COLUMNS = {
    "id",
    "case_db_id",
    "version",
    "project_name",
    "organisation",
    "status",
    "risk_level",
    "template_version",
    "request_payload",
    "result_payload",
    "created_at",
    "updated_at",
}


def assessment_storage_readiness(bind=None) -> tuple[bool, str]:
    """Check that persistence is not merely reachable but schema-complete."""

    if bind is None:
        # Resolve dynamically so tests and operational failover can replace the
        # connection engine without this module retaining a stale reference.
        from . import connection

        bind = connection.engine
    try:
        inspector = inspect(bind)
        if not inspector.has_table(DPIAAssessmentRecord.__tablename__):
            return False, "tabellen dpia_assessments mangler"
        columns = {
            item["name"]
            for item in inspector.get_columns(DPIAAssessmentRecord.__tablename__)
        }
        missing = sorted(REQUIRED_DPIA_COLUMNS.difference(columns))
        if missing:
            return False, "dpia_assessments mangler kolonner: " + ", ".join(missing)
    except Exception as exc:
        return False, f"DPIA-storage kan ikke inspiceres: {exc}"
    return True, "ok"


def _next_case_version(db: Session, case_db_id: str | None) -> int:
    """Serialize version allocation per case through the database transaction.

    PostgreSQL locks the parent row. SQLite has no SELECT FOR UPDATE, so a
    no-op update obtains its write lock before reading the maximum version.
    The caller retains this lock until commit/rollback; Python thread locks
    would not protect multiple workers.
    """
    if not case_db_id:
        return 1
    from src.database.cases import Case

    if db.get_bind().dialect.name == "sqlite":
        changed = db.execute(
            update(Case)
            .where(Case.id == case_db_id)
            .values(id=Case.id, updated_at=Case.updated_at)
            .execution_options(synchronize_session=False)
        )
        if changed.rowcount != 1:
            raise ValueError("Den tilknyttede sag findes ikke.")
    else:
        case = (
            db.query(Case).filter(Case.id == case_db_id).with_for_update().one_or_none()
        )
        if case is None:
            raise ValueError("Den tilknyttede sag findes ikke.")
    latest = (
        db.query(func.max(DPIAAssessmentRecord.version))
        .filter(DPIAAssessmentRecord.case_db_id == case_db_id)
        .scalar()
    )
    return int(latest or 0) + 1


def assessment_result_payload(record: DPIAAssessmentRecord) -> dict[str, Any]:
    """Read historical snapshots without rewriting their stored JSON."""
    from src.services.dpia_reading_guide import reading_guide

    payload = {
        **deepcopy(record.result_payload),
        "project_name": record.project_name,
        "organisation": record.organisation,
        "department": record.request_payload.get("department", ""),
        "processing_version": record.request_payload.get("processing_version", ""),
        "version": record.version,
        "case_db_id": record.case_db_id,
    }
    payload["reading_guide"] = reading_guide(record.request_payload, payload)
    return payload


def assessment_display_payload(record: DPIAAssessmentRecord, db: Session) -> dict[str, Any]:
    """Decorate one report view/download with current version-bound decisions."""
    from src.database.case_workspace import list_case_approvals
    from src.services.dpia_reading_guide import reading_guide

    payload = assessment_result_payload(record)
    approvals = [item.to_dict() for item in list_case_approvals(db, record.case_db_id)] if record.case_db_id else []
    payload["reading_guide"] = reading_guide(record.request_payload, payload, approvals)
    return payload


def resolve_assessment_case(
    db: Session,
    *,
    assessment_id: str,
    created_at: datetime,
    request_payload: dict[str, Any],
    case_db_id: str | None = None,
) -> str:
    """Resolve the case for a new UI assessment in its caller's transaction.

    Existing records are never migrated by this helper. An explicitly supplied
    case must exist; only a new assessment without a case creates one. Flushes
    do not commit, so later assessment/link failures roll back the whole unit.
    """
    from src.database.cases import create_case, get_case

    if case_db_id is not None:
        if get_case(db, case_db_id) is None:
            raise ValueError("Den tilknyttede sag findes ikke.")
        return case_db_id

    owner = str(request_payload.get("owner", "")).strip()
    notes = "\n".join(
        f"{label}: {request_payload[key]}"
        for key, label in (
            ("project_name", "Løsning"),
            ("organisation", "Dataansvarlig organisation"),
            ("department", "Fagområde"),
            ("owner", "Faglig ansvarlig"),
        )
        if request_payload.get(key)
    )
    case = create_case(
        db,
        case_id=f"DPIA-{created_at.year}-{assessment_id}",
        title=str(request_payload["project_name"])[:255],
        assigned_to=owner[:64] or None,
        notes=notes,
    )
    return case.id


def save_assessment(
    db: Session,
    *,
    assessment_id: str,
    created_at: datetime,
    request_payload: dict[str, Any],
    result_payload: dict[str, Any],
    case_db_id: str | None = None,
) -> DPIAAssessmentRecord:
    """Persist one complete assessment atomically.

    The caller owns commit/rollback so API failures cannot accidentally return
    a result which was never durably stored.
    """

    timestamp = created_at.astimezone(UTC)
    version = _next_case_version(db, case_db_id)
    snapshot = deepcopy(result_payload)
    # Current display guidance is derived at read time, not a report revision.
    snapshot.pop("reading_guide", None)
    snapshot.update({"id": assessment_id, "version": version, "case_db_id": case_db_id})
    record = DPIAAssessmentRecord(
        id=assessment_id,
        case_db_id=None,
        version=version,
        project_name=str(request_payload["project_name"]),
        organisation=str(request_payload["organisation"]),
        status=str(result_payload["status"]),
        risk_level=str(result_payload["risk_level"]),
        template_version=str(result_payload["template_version"]),
        request_payload=deepcopy(request_payload),
        result_payload=snapshot,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db.add(record)
    db.flush()
    if case_db_id:
        link_assessment_to_case(db, assessment_id, case_db_id)
    return record


def get_assessment(db: Session, assessment_id: str) -> DPIAAssessmentRecord | None:
    return db.get(DPIAAssessmentRecord, assessment_id)


def list_assessments(
    db: Session,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[DPIAAssessmentRecord], int]:
    from .cases import Case

    # Filter in SQL before counting and pagination. A technical case can have
    # versions with a neutral project name, so both identity fields matter.
    technical_parent = exists().where(
        Case.id == DPIAAssessmentRecord.case_db_id,
        internal_test_title(Case.title),
    )
    query = db.query(DPIAAssessmentRecord).filter(
        visible_title(DPIAAssessmentRecord.project_name), ~technical_parent
    )
    total = query.count()
    records = (
        query.order_by(DPIAAssessmentRecord.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return records, total


def link_assessment_to_case(
    db: Session,
    assessment_id: str,
    case_db_id: str,
) -> DPIAAssessmentRecord:
    """Attach a DPIA snapshot to one case without mutating its assessment data."""

    from src.database.case_workspace import add_workspace_reference
    from src.database.cases import get_case

    record = get_assessment(db, assessment_id)
    if record is None:
        raise ValueError(f"DPIA assessment not found: {assessment_id}")
    if get_case(db, case_db_id) is None:
        raise ValueError(f"case not found: {case_db_id}")
    if record.case_db_id and record.case_db_id != case_db_id:
        raise ValueError("DPIA assessment is already linked to another case")
    record.case_db_id = case_db_id
    add_workspace_reference(
        db,
        case_db_id=case_db_id,
        reference_type="dpia_assessment",
        reference_id=record.id,
        title=record.project_name,
        summary=f"DPIA · {record.status} · {record.risk_level}",
        source_version=record.template_version,
        details={
            "status": record.status,
            "risk_level": record.risk_level,
            "version": record.version,
        },
    )
    db.flush()
    return record


def list_assessments_for_case(
    db: Session,
    case_db_id: str,
) -> list[DPIAAssessmentRecord]:
    return (
        db.query(DPIAAssessmentRecord)
        .filter(DPIAAssessmentRecord.case_db_id == case_db_id)
        .order_by(
            DPIAAssessmentRecord.version.desc(), DPIAAssessmentRecord.created_at.desc()
        )
        .all()
    )
