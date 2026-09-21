"""Case re-review reminder service.

Sektorlovgivning ændrer sig — Case.next_review_at markerer hvornår en
vurdering skal gennemgås igen. Uden påmindelse forfalder vurderinger
uden at nogen ved det. Dette modul kører dagligt og sender en email
til den ansvarlige sagsbehandler for cases hvor next_review_at er passeret.

Throttling: Same case is reminded at most once per
CASE_REMINDER_COOLDOWN_DAYS to avoid daily inbox-spam. The
last_reminder_sent_at column on Case tracks this.

Configuration (.env):
    CASE_REMINDER_ENABLED            (default "true")
    CASE_REMINDER_COOLDOWN_DAYS      (default "7")
    CASE_REMINDER_DEFAULT_RECIPIENT  (fallback when assigned_to is empty)
    SMTP_HOST / SMTP_PORT / ...      (existing SMTP config)
"""

from __future__ import annotations

import logging
import os
import smtplib
from datetime import datetime, timedelta, UTC
from email.message import EmailMessage
from typing import Optional

from sqlalchemy import and_, or_

from src.database.cases import Case, CASE_STATUSES
from src.database.connection import SessionLocal

logger = logging.getLogger(__name__)


# Statuses that should NOT receive reminders — closed work
_TERMINAL_STATUSES = frozenset({"arkiveret"})


def _is_enabled() -> bool:
    return os.getenv("CASE_REMINDER_ENABLED", "true").lower() not in {"0", "false", "no"}


def _cooldown_days() -> int:
    try:
        return int(os.getenv("CASE_REMINDER_COOLDOWN_DAYS", "7"))
    except ValueError:
        return 7


def _default_recipient() -> Optional[str]:
    return (
        os.getenv("CASE_REMINDER_DEFAULT_RECIPIENT")
        or os.getenv("AI_CASES_CC")
        or os.getenv("AI_CASES_RECIPIENT")
    )


def _public_app_url() -> str:
    return os.getenv("APP_PUBLIC_URL", "http://localhost:8090")


def _build_reminder_email(case: Case, app_url: str) -> EmailMessage:
    """Compose a single-case reminder email."""
    msg = EmailMessage()
    msg["Subject"] = f"[S.H.I.E.L.D.] Genvurdering forfalden: {case.title}"
    msg["From"] = (
        os.getenv("SMTP_FROM")
        or os.getenv("SMTP_USER")
        or "no-reply@shield.local"
    )

    overdue_by_days = 0
    if case.next_review_at:
        delta = datetime.now(UTC) - case.next_review_at
        overdue_by_days = max(0, delta.days)

    review_date = case.next_review_at.strftime("%d.%m.%Y") if case.next_review_at else "ukendt"
    case_link = f"{app_url.rstrip('/')}/sager/{case.id}"

    body = (
        f"Hej,\n\n"
        f"Sagen '{case.title}' (sags-id {case.case_id}) skulle have været\n"
        f"genvurderet d. {review_date} — den er forfalden med {overdue_by_days} dag(e).\n\n"
        f"Hvorfor det betyder noget: Sektorlovgivning og AI Act-fortolkninger\n"
        f"opdateres løbende. Vurderinger der ikke er blevet revideret indenfor\n"
        f"den planlagte cyklus kan være baseret på forældet juridisk grundlag.\n\n"
        f"Status nu: {case.status}\n"
        f"Sidste samlet status: {case.last_aggregate_status or '-'}\n\n"
        f"Åbn sagen: {case_link}\n\n"
        f"S.H.I.E.L.D. — kommunal konsekvensanalyse\n"
    )
    msg.set_content(body)
    return msg


def _send_email(message: EmailMessage, recipient: str) -> str:
    """Send via SMTP. Returns 'sent' / 'failed' / 'skipped'."""
    smtp_host = os.getenv("SMTP_HOST")
    if not smtp_host:
        logger.warning("SMTP_HOST not set — cannot send case-reminder")
        return "skipped"

    smtp_port = int(os.getenv("SMTP_PORT", "25"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    use_tls = os.getenv("SMTP_USE_TLS", "false").lower() not in {"0", "false", "no"}

    message["To"] = recipient
    sender = message["From"]

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            if use_tls:
                server.starttls()
            if smtp_user and smtp_password:
                server.login(smtp_user, smtp_password)
            server.send_message(message, from_addr=sender, to_addrs=[recipient])
        return "sent"
    except Exception:
        logger.exception("Failed to send case-reminder to %s", recipient)
        return "failed"


def find_cases_needing_reminder(now: Optional[datetime] = None) -> list[Case]:
    """Return cases whose review is overdue and which haven't been reminded recently."""
    now = now or datetime.now(UTC)
    cooldown_threshold = now - timedelta(days=_cooldown_days())

    with SessionLocal() as session:
        cases = (
            session.query(Case)
            .filter(Case.next_review_at.isnot(None))
            .filter(Case.next_review_at <= now)
            .filter(~Case.status.in_(_TERMINAL_STATUSES))
            .filter(
                or_(
                    Case.last_reminder_sent_at.is_(None),
                    Case.last_reminder_sent_at <= cooldown_threshold,
                )
            )
            .all()
        )
        # Detach so we can return them outside the session
        for c in cases:
            session.expunge(c)
        return cases


def send_due_reminders(now: Optional[datetime] = None) -> dict:
    """Find overdue cases and send reminders. Returns a summary dict.

    This is the function the APScheduler job calls.
    """
    if not _is_enabled():
        logger.info("Case reminders disabled (CASE_REMINDER_ENABLED=false)")
        return {"enabled": False, "checked": 0, "sent": 0, "failed": 0, "skipped": 0}

    now = now or datetime.now(UTC)
    fallback = _default_recipient()
    app_url = _public_app_url()

    cases = find_cases_needing_reminder(now)
    summary = {"enabled": True, "checked": len(cases), "sent": 0, "failed": 0, "skipped": 0}

    if not cases:
        logger.info("No overdue cases need reminding")
        return summary

    with SessionLocal() as session:
        for snapshot in cases:
            recipient = snapshot.assigned_to or fallback
            if not recipient:
                logger.warning(
                    "Case %s has no assigned_to and no fallback recipient configured — skipping",
                    snapshot.case_id,
                )
                summary["skipped"] += 1
                continue

            # Email send is sync + slow (network) — happens outside the
            # session so we don't hold a DB connection during SMTP I/O.
            message = _build_reminder_email(snapshot, app_url)
            result = _send_email(message, recipient)

            if result == "sent":
                # Reload + update inside this session
                live = session.query(Case).filter(Case.id == snapshot.id).one_or_none()
                if live is not None:
                    live.last_reminder_sent_at = now
                    session.add(live)
                summary["sent"] += 1
            elif result == "failed":
                summary["failed"] += 1
            else:
                summary["skipped"] += 1

        session.commit()

    logger.info(
        "Case reminders: checked=%d sent=%d failed=%d skipped=%d",
        summary["checked"],
        summary["sent"],
        summary["failed"],
        summary["skipped"],
    )
    return summary


async def scheduled_reminder_job() -> None:
    """APScheduler entry point — wraps the sync sender in to_thread."""
    import asyncio

    try:
        await asyncio.to_thread(send_due_reminders)
    except Exception:
        logger.exception("scheduled case-reminder run failed")
