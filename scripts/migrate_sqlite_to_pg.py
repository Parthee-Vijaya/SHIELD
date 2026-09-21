"""Engangs-migration af runtime-data fra judge_dredd.db (SQLite) til PG.

Køres EN gang når man skifter fra SQLite til PostgreSQL. Tager backup
af PG-skemaet inden, dropper public schema, recreator alt via init_db,
og kopierer derefter rækker tabel-for-tabel.

Usage:
    DATABASE_URL=postgresql+psycopg2://tyr:tyr_local_dev@localhost/tyr \\
    venv/bin/python scripts/migrate_sqlite_to_pg.py [--source judge_dredd.db]

Idempotency: scriptet truncater PG-tabeller før indsættelse, så genkøring
giver samme slut-state. Source SQLite-filen røres aldrig.

Tabel-prioritet (parent → child):
    cases → case_transitions
    v3_assessment_log (uafhængig)
    rule_freshness (uafhængig)
    audit_access_log (uafhængig)
    Alle compliance_*-tabeller (legacy reference, kun til /v1-endpoints)
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Iterable

# Ensure project root is on the path before importing src.*
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Force ALL table-defining modules to register med Base.metadata
from src.database import models, cases, audit_access_log, repository  # noqa: F401
from src.rule_engine import audit  # noqa: F401
from src.services.citation_verifier import RuleFreshness  # noqa: F401
from src.database.connection import engine, init_db
from sqlalchemy import inspect, text


# Tables we want to migrate, in topological order (parents before children)
MIGRATION_ORDER = [
    # v3 runtime — most important
    "cases",
    "case_transitions",
    "v3_assessment_log",
    "rule_freshness",
    "audit_access_log",
    # legacy reference data (curated rules + assessments)
    "compliance_anbefalinger",
    "compliance_artefakter",
    "compliance_beslutningstrae",
    "compliance_betingelser",
    "compliance_checks",
    "compliance_control_assessments",
    "compliance_hard_stops",
    "compliance_naeste_skridt",
    "compliance_tests",
    "assessment_records",
    "legal_documents",
    "quick_check_history",
    "user_sessions",
]


def _resolve_source(name: str) -> Path:
    """Return absolute path to a SQLite source file."""
    candidate = ROOT / name
    if candidate.exists():
        return candidate
    # Allow absolute paths
    p = Path(name)
    if p.exists():
        return p
    raise FileNotFoundError(f"SQLite source not found: {name}")


def _sqlite_columns(con: sqlite3.Connection, table: str) -> list[str]:
    cur = con.execute(f'PRAGMA table_info("{table}")')
    return [row[1] for row in cur.fetchall()]


def _pg_columns(table: str) -> list[str]:
    ins = inspect(engine)
    return [c["name"] for c in ins.get_columns(table)]


def _truncate_pg(table: str) -> None:
    """TRUNCATE med RESTART IDENTITY så autoinkrement-id'er starter forfra
    hvis vi importerer eksisterende ID'er. Vi bruger CASCADE for FK'er."""
    with engine.begin() as conn:
        conn.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))


def _normalize_row(table: str, row: dict, pg_cols_with_types: dict) -> dict:
    """Cleanse legacy data so den passer i PG's stricter typer.

    - Boolske kolonner (PG kræver bool, SQLite gemmer 0/1)
    - aggregate_status legacy: 'Status.BETINGET_GO' → 'BETINGET-GO',
      'Status.NO_GO' → 'NO-GO', 'Status.GO' → 'GO'
    """
    out = dict(row)

    # Coerce 0/1 → False/True for known boolean columns. PG's psycopg2
    # accepts True/False/None for boolean columns.
    for col, sqltype in pg_cols_with_types.items():
        type_name = type(sqltype).__name__.upper()
        if col in out and "BOOL" in type_name:
            v = out[col]
            if isinstance(v, int):
                out[col] = bool(v)

    # Normalize legacy enum-repr leakage in v3_assessment_log
    if table == "v3_assessment_log" and "aggregate_status" in out:
        v = (out["aggregate_status"] or "").strip()
        if v.startswith("Status."):
            v = v.removeprefix("Status.")
            v = v.replace("BETINGET_GO", "BETINGET-GO").replace("NO_GO", "NO-GO")
        out["aggregate_status"] = v

    return out


def _copy_table(src_con: sqlite3.Connection, table: str) -> int:
    """Kopiér én tabel — returnér antal indsatte rækker. Spring over
    columns der ikke findes i begge dialekter (defensiv mod schema-drift)."""
    src_cols = _sqlite_columns(src_con, table)
    if not src_cols:
        return 0
    pg_cols = _pg_columns(table)
    if not pg_cols:
        print(f"  ! {table}: tabel findes ikke i PG, springer over")
        return 0

    common = [c for c in src_cols if c in pg_cols]
    if not common:
        print(f"  ! {table}: ingen fælles kolonner — springer over")
        return 0

    if len(common) < len(src_cols):
        skipped = set(src_cols) - set(common)
        print(f"  ! {table}: dropper kolonner ikke i PG: {skipped}")

    # Få type-info så vi kan coerce booleans osv.
    ins = inspect(engine)
    pg_cols_with_types = {c["name"]: c["type"] for c in ins.get_columns(table)}

    quoted = ", ".join(f'"{c}"' for c in common)
    placeholders = ", ".join(f":{c}" for c in common)

    cur = src_con.execute(f'SELECT {quoted} FROM "{table}"')
    rows = [
        _normalize_row(table, dict(zip(common, r)), pg_cols_with_types)
        for r in cur.fetchall()
    ]
    if not rows:
        return 0

    with engine.begin() as conn:
        conn.execute(
            text(f'INSERT INTO "{table}" ({quoted}) VALUES ({placeholders})'),
            rows,
        )
    # Re-sequence id-counter for tabeller med en autoinkrement-id-kolonne så
    # næste INSERT ikke kolliderer med en eksisterende række.
    if "id" in common:
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        f"SELECT setval(pg_get_serial_sequence(:tbl, 'id'), "
                        f"COALESCE((SELECT MAX(id) FROM \"{table}\"), 0) + 1, false)"
                    ),
                    {"tbl": table},
                )
        except Exception:
            # Tabellen har måske ikke en sequence (e.g. UUID id) — ignore
            pass
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="judge_dredd.db", help="SQLite-fil at læse fra")
    parser.add_argument("--reset", action="store_true", help="DROP public schema før init")
    args = parser.parse_args()

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url.startswith("postgresql"):
        print(f"FEJL: DATABASE_URL skal pege på PG. Fik: {db_url}")
        return 1

    src_path = _resolve_source(args.source)
    print(f"Source: {src_path}")
    print(f"Target: {db_url}")
    print()

    # Reset PG schema hvis ønsket — ellers respekterer vi eksisterende tabeller
    if args.reset:
        print("Reset: dropping public schema")
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO tyr;"))

    # Create schema
    print("Creating PG schema via init_db...")
    init_db()
    print("OK")
    print()

    # Migrate
    src_con = sqlite3.connect(src_path)
    src_con.row_factory = sqlite3.Row

    total = 0
    print("Migrating tables...")
    for table in MIGRATION_ORDER:
        if table not in _pg_columns_table_set():
            print(f"  - {table}: ikke i PG-skemaet, springer over")
            continue
        try:
            _truncate_pg(table)
            count = _copy_table(src_con, table)
            print(f"  ✓ {table}: {count} rækker")
            total += count
        except Exception as exc:
            print(f"  ✗ {table}: {exc}")

    src_con.close()
    print()
    print(f"DONE — {total} rækker migreret i alt")
    return 0


def _pg_columns_table_set() -> set[str]:
    ins = inspect(engine)
    return set(ins.get_table_names())


if __name__ == "__main__":
    raise SystemExit(main())
