"""Daglig database-backup med rotation + valgfri off-site sync.

Bruger pg_dump i custom format (`-Fc`) — pladseffektiv og kompatibel
med pg_restore. Kører kun når DATABASE_URL er PostgreSQL; SQLite-filer
sikres ikke (de er kun dev-fallback).

Rotation:
- Daglige: behold 7 (én pr. dag, sletter ældste)
- Ugentlige: behold 4 (én pr. uge — kopieres mandag)
- Månedlige: behold 12 (én pr. måned — kopieres 1. i måneden)

Off-site (valgfrit):
- TYR_BACKUP_RSYNC_TARGET sat (fx '/Volumes/ext-disk/tyr-backups' eller
  'user@nas:/share/tyr-backups') → rsync efter hver succesrig dump.

Cron: daglig 01:30 — før GDPR retention-sweep (02:00) så vi har en
backup OG før retention slettér gammel data.

Manual trigger: POST /api/v3/admin/backups/run
List: GET /api/v3/admin/backups
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
from dataclasses import dataclass, asdict
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ---- Configuration ---------------------------------------------------------

# Dump-filer placeres her. Override med TYR_BACKUP_DIR.
def _backup_dir() -> Path:
    override = os.getenv("TYR_BACKUP_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / "Backups" / "Tyr"


def _pg_dump_binary() -> str:
    # Brug homebrew-PG-bin'en hvis den findes — ellers PATH
    candidates = [
        "/opt/homebrew/opt/postgresql@16/bin/pg_dump",
        "/usr/local/opt/postgresql@16/bin/pg_dump",
        "pg_dump",
    ]
    for c in candidates:
        if c == "pg_dump" or Path(c).exists():
            return c
    return "pg_dump"


# Retention configuration — kan overrides via env
RETAIN_DAILY = int(os.getenv("TYR_BACKUP_RETAIN_DAILY", "7"))
RETAIN_WEEKLY = int(os.getenv("TYR_BACKUP_RETAIN_WEEKLY", "4"))
RETAIN_MONTHLY = int(os.getenv("TYR_BACKUP_RETAIN_MONTHLY", "12"))


# ---- DB-URL parsing --------------------------------------------------------

@dataclass
class _DbConn:
    user: str
    password: str
    host: str
    port: str
    dbname: str

    def to_pg_env(self) -> dict:
        """Return env-vars som pg_dump forstår."""
        return {
            "PGPASSWORD": self.password,
            "PGUSER": self.user,
            "PGHOST": self.host,
            "PGPORT": self.port,
            "PGDATABASE": self.dbname,
        }


def _parse_database_url(url: str) -> Optional[_DbConn]:
    """Parse postgresql+psycopg2://user:pass@host:port/dbname."""
    if not url or not url.startswith("postgres"):
        return None
    # Strip eventuel +driver
    body = re.sub(r"^postgres(ql)?(\+\w+)?://", "", url)
    # user:pass@host:port/dbname
    m = re.match(r"([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)", body)
    if not m:
        return None
    user, password, host, port, dbname = m.groups()
    return _DbConn(
        user=user,
        password=password,
        host=host,
        port=port or "5432",
        dbname=dbname.split("?")[0],
    )


# ---- Filename helpers ------------------------------------------------------

# tyr-2026-05-09-013012-daily.dump
_FILENAME_RE = re.compile(
    r"^tyr-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})-(daily|weekly|monthly|manual)\.dump$"
)


def _make_filename(now: datetime, kind: str) -> str:
    return f"tyr-{now:%Y-%m-%d-%H%M%S}-{kind}.dump"


def _list_dumps(directory: Path, kind: Optional[str] = None) -> list[Path]:
    """Returnér alle .dump-filer sorteret efter timestamp i navnet."""
    if not directory.exists():
        return []
    out: list[Path] = []
    for p in directory.glob("tyr-*.dump"):
        m = _FILENAME_RE.match(p.name)
        if not m:
            continue
        if kind and m.group(7) != kind:
            continue
        out.append(p)
    out.sort(key=lambda p: p.name)  # ISO-style names sort lexically
    return out


def _rotate(directory: Path, kind: str, retain: int) -> int:
    """Slet ældste filer af 'kind' så vi kun har 'retain' tilbage."""
    files = _list_dumps(directory, kind=kind)
    if len(files) <= retain:
        return 0
    to_delete = files[:-retain]
    for p in to_delete:
        try:
            p.unlink()
            logger.info(f"Rotated out backup: {p.name}")
        except OSError as exc:
            logger.warning(f"Failed to delete old backup {p.name}: {exc}")
    return len(to_delete)


# ---- pg_dump runner --------------------------------------------------------

def _run_pg_dump(target_path: Path, conn: _DbConn) -> dict:
    """Kør pg_dump → custom format. Returnér summary med timing + size."""
    pg_dump = _pg_dump_binary()
    target_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        pg_dump,
        "-Fc",                # custom format — komprimeret + pg_restore-ready
        "--no-owner",
        "--no-privileges",
        "-f", str(target_path),
        # connection params via env (PGUSER, PGHOST, etc.) — ikke flags
        # så password ikke ender i process listing
    ]

    env = {**os.environ, **conn.to_pg_env()}

    started = datetime.now(UTC)
    try:
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": "pg_dump timeout (>600s)",
            "started_at": started.isoformat(),
        }
    finished = datetime.now(UTC)

    if result.returncode != 0:
        # Cleanup partial file
        try:
            if target_path.exists():
                target_path.unlink()
        except OSError:
            pass
        return {
            "ok": False,
            "error": f"pg_dump exited {result.returncode}: {result.stderr.decode(errors='replace')[:500]}",
            "started_at": started.isoformat(),
            "finished_at": finished.isoformat(),
        }

    size = target_path.stat().st_size if target_path.exists() else 0
    return {
        "ok": True,
        "path": str(target_path),
        "size_bytes": size,
        "duration_seconds": (finished - started).total_seconds(),
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
    }


# ---- Off-site sync ---------------------------------------------------------

def _maybe_rsync(local_dir: Path) -> Optional[dict]:
    """Hvis TYR_BACKUP_RSYNC_TARGET er sat, sync hele backup-mappen."""
    target = os.getenv("TYR_BACKUP_RSYNC_TARGET")
    if not target:
        return None
    if not shutil.which("rsync"):
        return {"ok": False, "error": "rsync not in PATH"}

    cmd = ["rsync", "-a", "--delete", f"{local_dir}/", target]
    started = datetime.now(UTC)
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=300, check=False)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "rsync timeout"}
    finished = datetime.now(UTC)
    if result.returncode != 0:
        return {
            "ok": False,
            "error": f"rsync exited {result.returncode}: {result.stderr.decode(errors='replace')[:300]}",
        }
    return {
        "ok": True,
        "target": target,
        "duration_seconds": (finished - started).total_seconds(),
    }


# ---- Public API ------------------------------------------------------------

def list_backups() -> dict:
    """Returnér oversigt over alle dump-filer i backup-mappen."""
    directory = _backup_dir()
    if not directory.exists():
        return {"directory": str(directory), "count": 0, "items": []}

    items = []
    for p in sorted(_list_dumps(directory), reverse=True):  # newest first
        m = _FILENAME_RE.match(p.name)
        if not m:
            continue
        try:
            stat = p.stat()
            items.append({
                "filename": p.name,
                "kind": m.group(7),
                # Filnavn-timestamps er altid i UTC (sat af _make_filename
                # baseret på datetime.now(UTC)). Inkluder eksplicit Z så
                # JS Date i frontend ikke fejlfortolker som local time.
                "timestamp": (
                    f"{m.group(1)}-{m.group(2)}-{m.group(3)}T"
                    f"{m.group(4)}:{m.group(5)}:{m.group(6)}Z"
                ),
                "size_bytes": stat.st_size,
            })
        except OSError:
            continue

    # Group by kind for at vise rotation-status
    by_kind = {"daily": 0, "weekly": 0, "monthly": 0, "manual": 0}
    for it in items:
        by_kind[it["kind"]] = by_kind.get(it["kind"], 0) + 1

    return {
        "directory": str(directory),
        "count": len(items),
        "items": items,
        "by_kind": by_kind,
        "retention": {
            "daily": RETAIN_DAILY,
            "weekly": RETAIN_WEEKLY,
            "monthly": RETAIN_MONTHLY,
        },
        "rsync_target": os.getenv("TYR_BACKUP_RSYNC_TARGET"),
    }


def run_backup(kind: str = "daily") -> dict:
    """Kør én backup. Returnér summary-dict.

    kind: 'daily' | 'weekly' | 'monthly' | 'manual'
    """
    if kind not in {"daily", "weekly", "monthly", "manual"}:
        return {"ok": False, "error": f"invalid kind '{kind}'"}

    db_url = os.getenv("DATABASE_URL", "")
    conn = _parse_database_url(db_url)
    if not conn:
        return {
            "ok": False,
            "error": "DATABASE_URL is not PostgreSQL — backup skipped (SQLite is dev-fallback only)",
            "database_url_kind": "sqlite" if "sqlite" in db_url else "unknown",
        }

    directory = _backup_dir()
    now = datetime.now(UTC)
    target = directory / _make_filename(now, kind)

    logger.info(f"Starting {kind} backup → {target}")
    result = _run_pg_dump(target, conn)
    if not result.get("ok"):
        logger.error(f"Backup failed: {result}")
        return {**result, "kind": kind}

    # Rotation
    rotated_daily = _rotate(directory, "daily", RETAIN_DAILY)
    rotated_weekly = _rotate(directory, "weekly", RETAIN_WEEKLY)
    rotated_monthly = _rotate(directory, "monthly", RETAIN_MONTHLY)

    # Off-site
    rsync_result = _maybe_rsync(directory)

    return {
        **result,
        "kind": kind,
        "rotated": {
            "daily": rotated_daily,
            "weekly": rotated_weekly,
            "monthly": rotated_monthly,
        },
        "rsync": rsync_result,
    }


async def scheduled_backup_job() -> None:
    """APScheduler entry point.

    Kører altid en daily-dump. Hvis det er mandag, kopieres den ind som
    weekly. Hvis det er den 1. i måneden, kopieres den ind som monthly.
    Det betyder ÉT pg_dump-kald per kørsel — bare flere copy-on-write
    hardlinks lokalt.
    """
    try:
        result = await asyncio.to_thread(run_backup, "daily")
        if not result.get("ok"):
            logger.error(f"Daily backup failed: {result.get('error')}")
            return

        # Hvis det er mandag: lav weekly-kopi
        now = datetime.now(UTC)
        directory = _backup_dir()
        source = Path(result["path"])

        if now.isoweekday() == 1:  # mandag
            weekly_target = directory / _make_filename(now, "weekly")
            try:
                shutil.copy2(source, weekly_target)
                _rotate(directory, "weekly", RETAIN_WEEKLY)
                logger.info(f"Weekly snapshot taken: {weekly_target.name}")
            except OSError as exc:
                logger.warning(f"Failed to make weekly copy: {exc}")

        if now.day == 1:
            monthly_target = directory / _make_filename(now, "monthly")
            try:
                shutil.copy2(source, monthly_target)
                _rotate(directory, "monthly", RETAIN_MONTHLY)
                logger.info(f"Monthly snapshot taken: {monthly_target.name}")
            except OSError as exc:
                logger.warning(f"Failed to make monthly copy: {exc}")

    except Exception:
        logger.exception("scheduled_backup_job failed")
