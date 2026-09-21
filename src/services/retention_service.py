"""Data-retention service — auto-anonymisering / sletning per GDPR-policy.

GDPR artikel 5(1)(e) kræver at persondata ikke opbevares længere end nødvendigt.
Tyrs egne logs, sager og dokumenter har et formål, men det formål udløber.
Dette modul kører dagligt og:

1. Sletter `V3AssessmentLog`-entries ældre end ASSESSMENT_LOG_RETENTION_DAYS.
2. Sletter `Case`-rækker (og deres transitions) i status "arkiveret" hvor
   `updated_at` er ældre end CASE_RETENTION_DAYS.
3. Sletter dokument-filer i `data/documents/` der ikke længere har en
   tilknyttet audit-log eller case.
4. Sletter `RuleFreshness`-rækker for regel-IDer der ikke længere findes
   i `rules/` (rydder op efter regel-omdøbning/-sletning).

Alle slettelser logges. Returneres som summary så ops-emailen kan vise
hvad der blev fjernet i nat.

Defaults:
    ASSESSMENT_LOG_RETENTION_DAYS=1825 (5 år) — proportionalt til
        forvaltningslovens journalpligt
    CASE_RETENTION_DAYS=3650 (10 år) — kommunal sagsstandard
    DOCUMENT_RETENTION_DAYS=1825 (5 år)
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, UTC
from pathlib import Path
from typing import Optional

from sqlalchemy import and_, or_

logger = logging.getLogger(__name__)


_DEFAULT_DOCUMENT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "documents"


def _is_enabled() -> bool:
    return os.getenv("RETENTION_ENABLED", "true").lower() not in {"0", "false", "no"}


def _days(env_key: str, default: int) -> int:
    try:
        return int(os.getenv(env_key, str(default)))
    except ValueError:
        return default


def _document_dir() -> Path:
    override = os.getenv("DOCUMENT_STORAGE_DIR")
    return Path(override) if override else _DEFAULT_DOCUMENT_DIR


# ---- Public API ------------------------------------------------------------

def run_retention(now: Optional[datetime] = None) -> dict:
    """Run all retention sweeps. Returns a dict with per-sweep counts."""
    if not _is_enabled():
        logger.info("Retention disabled (RETENTION_ENABLED=false)")
        return {"enabled": False}

    now = now or datetime.now(UTC)
    summary: dict = {
        "enabled": True,
        "started_at": now.isoformat(),
        "assessment_logs_deleted": 0,
        "cases_deleted": 0,
        "case_transitions_deleted": 0,
        "documents_deleted": 0,
        "rule_freshness_deleted": 0,
        "errors": [],
    }

    try:
        summary["assessment_logs_deleted"] = _sweep_assessment_logs(now)
    except Exception as exc:
        logger.exception("assessment_log retention failed")
        summary["errors"].append(f"assessment_logs: {exc}")

    try:
        cases, transitions = _sweep_cases(now)
        summary["cases_deleted"] = cases
        summary["case_transitions_deleted"] = transitions
    except Exception as exc:
        logger.exception("case retention failed")
        summary["errors"].append(f"cases: {exc}")

    try:
        summary["documents_deleted"] = _sweep_documents(now)
    except Exception as exc:
        logger.exception("document retention failed")
        summary["errors"].append(f"documents: {exc}")

    try:
        summary["rule_freshness_deleted"] = _sweep_rule_freshness()
    except Exception as exc:
        logger.exception("rule_freshness retention failed")
        summary["errors"].append(f"rule_freshness: {exc}")

    summary["finished_at"] = datetime.now(UTC).isoformat()
    logger.info(
        "Retention sweep: logs=%d cases=%d transitions=%d docs=%d rules=%d errors=%d",
        summary["assessment_logs_deleted"],
        summary["cases_deleted"],
        summary["case_transitions_deleted"],
        summary["documents_deleted"],
        summary["rule_freshness_deleted"],
        len(summary["errors"]),
    )
    return summary


# ---- Sweep implementations -------------------------------------------------

def _sweep_assessment_logs(now: datetime) -> int:
    """Slet V3AssessmentLog-entries der er ældre end retention-periode."""
    from src.database.connection import SessionLocal
    from src.rule_engine.audit import V3AssessmentLog

    cutoff = now - timedelta(days=_days("ASSESSMENT_LOG_RETENTION_DAYS", 1825))
    deleted = 0
    with SessionLocal() as session:
        rows = (
            session.query(V3AssessmentLog)
            .filter(V3AssessmentLog.created_at < cutoff)
            .all()
        )
        for row in rows:
            session.delete(row)
            deleted += 1
        session.commit()
    return deleted


def _sweep_cases(now: datetime) -> tuple[int, int]:
    """Slet arkiverede sager der er ældre end retention.

    Sager slettes med ON DELETE CASCADE på case_transitions, men vi tæller
    transitions separat for ops-summary.
    """
    from src.database.connection import SessionLocal
    from src.database.cases import Case, CaseTransition

    cutoff = now - timedelta(days=_days("CASE_RETENTION_DAYS", 3650))
    deleted_cases = 0
    deleted_transitions = 0
    with SessionLocal() as session:
        candidates = (
            session.query(Case)
            .filter(
                and_(
                    Case.status == "arkiveret",
                    Case.updated_at < cutoff,
                )
            )
            .all()
        )
        for case in candidates:
            transitions = (
                session.query(CaseTransition)
                .filter(CaseTransition.case_db_id == case.id)
                .count()
            )
            deleted_transitions += transitions
            session.delete(case)
            deleted_cases += 1
        session.commit()
    return deleted_cases, deleted_transitions


def _sweep_documents(now: datetime) -> int:
    """Slet dokument-filer der ikke længere har en tilknyttet audit-log.

    Kører som soft-orphan-detection — hvis en file findes i `data/documents/`
    men dens audit_log_id ikke findes i V3AssessmentLog, kan filen slettes.
    Også sletter filer der eksplicit er ældre end DOCUMENT_RETENTION_DAYS,
    selv hvis de stadig har en log (som er en lille edge — typisk vil
    audit-log-sweepet køre først og fjerne loggen, så bliver filen orphan).
    """
    from src.database.connection import SessionLocal
    from src.rule_engine.audit import V3AssessmentLog

    storage_dir = _document_dir()
    if not storage_dir.exists():
        return 0

    cutoff = now - timedelta(days=_days("DOCUMENT_RETENTION_DAYS", 1825))

    # Collect all known audit_log_ids from the DB
    known_ids: set[str] = set()
    with SessionLocal() as session:
        for (lid,) in session.query(V3AssessmentLog.id).all():
            known_ids.add(lid)

    deleted = 0
    for path in storage_dir.iterdir():
        if not path.is_file():
            continue
        if path.suffix not in {".pdf", ".docx"}:
            # Skip .meta.json and other accessory files; they get cleaned
            # alongside their main file below
            continue
        audit_log_id = path.stem
        # Time-based deletion
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
        except OSError:
            continue
        is_orphan = audit_log_id not in known_ids
        is_expired = mtime < cutoff
        if is_orphan or is_expired:
            _delete_document_files(storage_dir, audit_log_id)
            deleted += 1

    return deleted


def _delete_document_files(storage_dir: Path, audit_log_id: str) -> None:
    """Slet både hovedfilen og .meta.json side-car."""
    for ext in (".pdf", ".docx", ".meta.json"):
        p = storage_dir / f"{audit_log_id}{ext}"
        if p.exists():
            try:
                p.unlink()
            except OSError as exc:
                logger.warning("Failed to delete %s: %s", p, exc)


def _sweep_rule_freshness() -> int:
    """Ryd RuleFreshness-rækker for regel-IDer der ikke længere er aktive."""
    from src.database.connection import SessionLocal
    from src.services.citation_verifier import RuleFreshness

    # Try to load current rule IDs; if we can't, skip the sweep (don't delete
    # blindly).
    try:
        from src.rule_engine.loader import load_rules
        rules = load_rules("rules")
        active_ids = {r.id for r in rules}
    except Exception as exc:
        logger.warning("Could not load rules for freshness sweep: %s", exc)
        return 0

    deleted = 0
    with SessionLocal() as session:
        rows = session.query(RuleFreshness).all()
        for row in rows:
            if row.rule_id not in active_ids:
                session.delete(row)
                deleted += 1
        session.commit()
    return deleted


# ---- Scheduler entry -------------------------------------------------------

async def scheduled_retention_job() -> None:
    """APScheduler entry point — wraps the sync sweeper in to_thread."""
    import asyncio

    try:
        await asyncio.to_thread(run_retention)
    except Exception:
        logger.exception("scheduled retention run failed")
