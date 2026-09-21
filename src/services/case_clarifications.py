"""Evidence-bound clarification tasks stored in the existing case action register."""

from datetime import UTC, date, datetime, time
import hashlib
import json
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from src.database.cases import Case
from src.database.case_workspace import CaseAction
from src.database.procurement import ProcurementAnalysis


REFERENCE_TYPE = "procurement_clarification"


def require_analysis(db: Session, case_id: str, analysis_id: str):
    if db.get(Case, case_id) is None:
        raise HTTPException(404, "Sagen blev ikke fundet.")
    analysis = db.get(ProcurementAnalysis, analysis_id)
    if analysis is None or analysis.case_id != case_id:
        raise HTTPException(404, "Analysen findes ikke på sagen.")
    return analysis


def question_reference(analysis_id: str, question: dict) -> str:
    # Bind both identity and content. A later analysis never silently takes over a task.
    digest = hashlib.sha256(json.dumps(question, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return f"{analysis_id}:{digest}"


def question_map(analysis) -> dict:
    return {
        question_reference(analysis.id, question): question
        for question in analysis.generation_payload.get("questions", [])
    }


def task_dict(action: CaseAction, analysis, question: dict) -> dict:
    result = action.to_dict()
    return {
        **result,
        "analysis_id": analysis.id,
        "question_id": question["id"],
        "question": question["question"],
        "topic": question.get("topic", ""),
        "answer": action.evidence_note or "",
        "due_date": action.due_at.date().isoformat() if action.due_at else None,
    }


def list_clarifications(db: Session, case_id: str, analysis_id: str) -> list[dict]:
    analysis = require_analysis(db, case_id, analysis_id)
    questions = question_map(analysis)
    if not questions:
        return []
    tasks = db.query(CaseAction).filter(
        CaseAction.case_db_id == case_id,
        CaseAction.source_reference_type == REFERENCE_TYPE,
        CaseAction.source_reference_id.in_(questions),
    ).all()
    by_ref = {task.source_reference_id: task for task in tasks}
    return [task_dict(by_ref[ref], analysis, question) for ref, question in questions.items() if ref in by_ref]


def create_clarifications(
    db: Session, case_id: str, analysis_id: str, *, question_ids: list[str] | None,
    owner: str | None, due_date: date | None, actor: str,
) -> list[dict]:
    analysis = require_analysis(db, case_id, analysis_id)
    questions = question_map(analysis)
    valid_ids = {q["id"] for q in questions.values()}
    selected = valid_ids if question_ids is None else set(question_ids)
    if question_ids is not None and (len(selected) != len(question_ids) or not selected <= valid_ids):
        raise HTTPException(422, "Vælg kun forskellige spørgsmål fra den gemte analyse.")
    # Validate the entire request before any insert. Caller commits the batch once.
    for ref, question in questions.items():
        if question["id"] not in selected:
            continue
        task_id = str(uuid5(NAMESPACE_URL, f"shield:clarification:{case_id}:{ref}"))
        existing = db.get(CaseAction, task_id)
        if existing is not None:
            if (existing.case_db_id, existing.source_reference_type, existing.source_reference_id) != (case_id, REFERENCE_TYPE, ref):
                raise HTTPException(409, "Opgavens reference kunne ikke bekræftes.")
            continue
        values = dict(
            id=task_id, case_db_id=case_id,
            title=f"Afklar: {question['question']}"[:255],
            description=(
                f"{question['question']}\n\nEmne: {question.get('topic') or 'Afklaring'}"
                "\n\nSvaret dokumenterer en afklaring. Det er ikke en juridisk godkendelse "
                "og ændrer ikke automatisk oplysningerne i konsekvensanalysen."
            ),
            category="evidence", status="open",
            priority="high" if question.get("priority") == "high" else "medium",
            owner=owner or None,
            due_at=datetime.combine(due_date, time.min, tzinfo=UTC) if due_date else None,
            source_reference_type=REFERENCE_TYPE, source_reference_id=ref,
            created_by=actor,
        )
        # Avoid savepoint-only transactions: SQLite's legacy transaction mode can
        # otherwise commit a released first savepoint before the batch completes.
        dialect = db.get_bind().dialect.name
        if dialect in {"sqlite", "postgresql"}:
            if dialect == "sqlite":
                from sqlalchemy.dialects.sqlite import insert
            else:
                from sqlalchemy.dialects.postgresql import insert
            db.execute(insert(CaseAction).values(**values).on_conflict_do_nothing(index_elements=["id"]))
        else:
            db.add(CaseAction(**values))
            db.flush()
        persisted = db.get(CaseAction, task_id)
        if persisted is None or (persisted.case_db_id, persisted.source_reference_type, persisted.source_reference_id) != (case_id, REFERENCE_TYPE, ref):
            raise HTTPException(409, "Opgavens reference kunne ikke bekræftes.")
    return list_clarifications(db, case_id, analysis_id)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def update_clarification(db: Session, case_id: str, action_id: str, *, expected_updated_at: datetime, changes: dict) -> dict:
    action = db.get(CaseAction, action_id)
    if action is None or action.case_db_id != case_id or action.source_reference_type != REFERENCE_TYPE:
        raise HTTPException(404, "Afklaringen findes ikke på sagen.")
    analysis_id = (action.source_reference_id or "").split(":", 1)[0]
    analysis = require_analysis(db, case_id, analysis_id)
    question = question_map(analysis).get(action.source_reference_id)
    if question is None:
        raise HTTPException(409, "Afklaringens analysegrundlag kunne ikke bekræftes.")
    if _utc(action.updated_at) != _utc(expected_updated_at):
        raise HTTPException(409, "Afklaringen er ændret af en anden bruger. Hent den igen, før du gemmer.")
    next_status = changes.get("status", action.status)
    next_answer = changes.get("answer", action.evidence_note or "") or ""
    if next_status in {"completed", "dismissed"} and len(next_answer.strip()) < 20:
        raise HTTPException(422, "Beskriv svaret eller begrundelsen med mindst 20 tegn, før afklaringen afsluttes.")
    now = datetime.now(UTC)
    values = {"updated_at": now}
    if "status" in changes:
        values["status"] = next_status
        values["completed_at"] = (action.completed_at or now) if next_status == "completed" else None
    if "answer" in changes:
        values["evidence_note"] = next_answer.strip() or None
    if "owner" in changes:
        values["owner"] = changes["owner"] or None
    if "due_date" in changes:
        day = changes["due_date"]
        values["due_at"] = datetime.combine(day, time.min, tzinfo=UTC) if day else None
    changed = db.execute(update(CaseAction).where(
        CaseAction.id == action_id, CaseAction.case_db_id == case_id,
        CaseAction.updated_at == action.updated_at,
    ).values(**values), execution_options={"synchronize_session": False})
    if changed.rowcount != 1:
        raise HTTPException(409, "Afklaringen er ændret af en anden bruger. Hent den igen, før du gemmer.")
    db.refresh(action)
    return task_dict(action, analysis, question)
