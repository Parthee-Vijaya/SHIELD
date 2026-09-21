"""Durable tutorial progress scoped to the authenticated user and guide version."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import CheckConstraint, DateTime, Integer, String, or_, select
from sqlalchemy.dialects.postgresql import (
    Insert as PostgresInsert,
    insert as postgres_insert,
)
from sqlalchemy.dialects.sqlite import Insert as SQLiteInsert, insert as sqlite_insert
from sqlalchemy.orm import Mapped, Session, mapped_column

from .connection import Base

TUTORIAL_VERSION = 1
TutorialStatus = Literal["not_started", "in_progress", "completed", "dismissed"]
TutorialStep = Literal[
    "welcome", "cases", "documents", "assessment", "review", "export", "finish"
]


class UserTutorialState(Base):
    __tablename__ = "user_tutorial_states"

    user_oid: Mapped[str] = mapped_column(String(128), primary_key=True)
    tutorial_version: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    step_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        CheckConstraint("tutorial_version >= 1", name="ck_tutorial_positive_version"),
        CheckConstraint(
            "status IN ('not_started', 'in_progress', 'completed', 'dismissed')",
            name="ck_tutorial_status",
        ),
    )


def get_tutorial_state(
    db: Session, user_oid: str, *, tutorial_version: int = TUTORIAL_VERSION
) -> UserTutorialState | None:
    return db.get(
        UserTutorialState, (user_oid, tutorial_version), populate_existing=True
    )


def save_tutorial_state(
    db: Session,
    *,
    user_oid: str,
    status: TutorialStatus,
    step_id: TutorialStep | None,
    update_step: bool,
    tutorial_version: int = TUTORIAL_VERSION,
) -> UserTutorialState:
    """Atomically upsert without racing separate read/insert transactions.

    Omitted step IDs retain progress. Repeating identical input preserves the
    timestamp, while concurrent writes serialize through the unique database
    key. The caller owns commit/rollback.
    """
    dialect = db.get_bind().dialect.name
    insert: SQLiteInsert | PostgresInsert
    if dialect == "sqlite":
        insert = sqlite_insert(UserTutorialState)
    elif dialect == "postgresql":
        insert = postgres_insert(UserTutorialState)
    else:
        raise ValueError("Tutorial storage requires SQLite or PostgreSQL.")
    statement = insert.values(
        user_oid=user_oid,
        tutorial_version=tutorial_version,
        status=status,
        step_id=step_id,
        updated_at=datetime.now(UTC),
    )
    target_step = (
        statement.excluded.step_id if update_step else UserTutorialState.step_id
    )
    statement = statement.on_conflict_do_update(
        index_elements=[UserTutorialState.user_oid, UserTutorialState.tutorial_version],
        set_={
            "status": statement.excluded.status,
            "step_id": target_step,
            "updated_at": statement.excluded.updated_at,
        },
        where=or_(
            UserTutorialState.status != statement.excluded.status,
            UserTutorialState.step_id.is_distinct_from(target_step),
        ),
    )
    db.execute(statement)
    record = db.scalar(
        select(UserTutorialState)
        .where(
            UserTutorialState.user_oid == user_oid,
            UserTutorialState.tutorial_version == tutorial_version,
        )
        .execution_options(populate_existing=True)
    )
    if record is None:
        raise ValueError("Tutorial state was not persisted.")
    return record
