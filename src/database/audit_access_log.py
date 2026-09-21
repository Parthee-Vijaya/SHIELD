"""Audit-log på audit-log: hvem har set hvad og hvornår.

GDPR-krav (artikel 32): kommunen skal kunne dokumentere hvem der har
tilgået hvilke persondata. Tyrs primære audit-log (V3AssessmentLog) gemmer
fritekst der KAN indeholde PII selv efter redaction. Hver gang en bruger
henter en audit-log via API, registreres adgangen her.

Tabellen er append-only og skal aldrig slettes som del af en case-DSAR
(den bevidner *udleveringen*, ikke selve persondataene). Den følger sit
eget retention-skema (default 5 år) og er selv omfattet af retention-
sweepet i src/services/retention_service.py.
"""

from __future__ import annotations

import logging
from datetime import datetime, UTC
from typing import Optional

from sqlalchemy import Column, DateTime, String, Text, Integer, Index
from sqlalchemy.orm import Session

from src.database.connection import Base

logger = logging.getLogger(__name__)


class AuditAccessLog(Base):
    """Hver gang nogen henter en audit-log eller eksporterer DSAR-data.

    Vi gemmer ikke selve indholdet — kun *at* der blev tilgået, af hvem,
    fra hvilken IP, hvilken type adgang det var (read / export / delete).
    """

    __tablename__ = "audit_access_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    accessed_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
    # What was accessed
    target_type = Column(String(32), nullable=False)  # "audit_log" | "case" | "dsar_export" | "dsar_delete"
    target_id = Column(String(128), nullable=False, index=True)
    # Who accessed (best-effort — no auth yet, so we capture what we can)
    actor = Column(String(128), nullable=True)  # X-User header if set, else None
    actor_ip = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    # Action taken
    action = Column(String(16), nullable=False, default="read")  # read | write | delete | export
    request_id = Column(String(64), nullable=True)

    __table_args__ = (
        Index(
            "ix_audit_access_target_time",
            "target_type",
            "target_id",
            "accessed_at",
        ),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "accessed_at": self.accessed_at.isoformat() if self.accessed_at else None,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "actor": self.actor,
            "actor_ip": self.actor_ip,
            "action": self.action,
            "request_id": self.request_id,
        }


def record_access(
    session: Session,
    *,
    target_type: str,
    target_id: str,
    action: str = "read",
    actor: Optional[str] = None,
    actor_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    request_id: Optional[str] = None,
) -> AuditAccessLog:
    """Append a row. Caller is responsible for committing the session."""
    entry = AuditAccessLog(
        target_type=target_type,
        target_id=target_id,
        action=action,
        actor=actor,
        actor_ip=actor_ip,
        user_agent=user_agent[:1000] if user_agent else None,
        request_id=request_id,
    )
    session.add(entry)
    session.flush()
    return entry


def list_access_for_target(
    session: Session,
    target_type: str,
    target_id: str,
    *,
    limit: int = 200,
) -> list[AuditAccessLog]:
    """List accesses to a specific audit-log / case for compliance review."""
    return (
        session.query(AuditAccessLog)
        .filter(
            AuditAccessLog.target_type == target_type,
            AuditAccessLog.target_id == target_id,
        )
        .order_by(AuditAccessLog.accessed_at.desc())
        .limit(limit)
        .all()
    )
