"""Read filters for technical fixtures, without altering historical records.

Only the explicit E2E title prefixes used by development fixtures are hidden.
Ordinary municipal names and deliberately marked example cases remain visible.
This is presentation filtering, never an authorization boundary; direct UUID
lookups retain the existing authenticated access checks.
"""

from sqlalchemy import func, or_
from sqlalchemy.sql.elements import ColumnElement


def internal_test_title(column: ColumnElement) -> ColumnElement[bool]:
    normalized = func.lower(func.trim(func.coalesce(column, "")))
    return or_(normalized.like("e2e test%"), normalized.like("e2e-test%"))


def visible_title(column: ColumnElement) -> ColumnElement[bool]:
    return ~internal_test_title(column)
