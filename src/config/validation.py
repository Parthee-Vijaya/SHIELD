"""Config-validator + ConfigReport.

Bruges to steder:
1. **Lifespan startup** — kører ved boot, dør hvis kritisk konfig mangler,
   logger startup-banner ellers
2. **/api/v3/admin/config endpoint** — backer build-time diagnostic-modal
   i frontend OG /drift's "Konfiguration"-sektion

Designet til at være billigt (DB-ping max 2s, LM Studio-ping max 2s) så
det kan kaldes på hver page-refresh i bygge-fasen uden at bremse UX.
"""

from __future__ import annotations

import os
import shutil
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional

# Placeholder-detektion (samme pattern som law_assistant og law_rag)
_PLACEHOLDER_FRAGMENTS = ("your_", "_here", "sk-...", "changeme")


def _is_placeholder(value: Optional[str]) -> bool:
    if not value:
        return True
    low = value.lower()
    return any(frag in low for frag in _PLACEHOLDER_FRAGMENTS)


@dataclass
class CheckItem:
    name: str
    status: str  # "ok" | "warn" | "fail" | "info"
    summary: str
    detail: Optional[str] = None
    fatal: bool = False


@dataclass
class ConfigReport:
    generated_at: float
    api_port: int
    api_host: str
    api_reload: bool
    items: list[CheckItem] = field(default_factory=list)
    critical_failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    active_features: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            **{k: v for k, v in asdict(self).items() if k != "items"},
            "items": [asdict(it) for it in self.items],
        }

    def add(self, item: CheckItem) -> None:
        self.items.append(item)
        if item.status == "fail" and item.fatal:
            self.critical_failures.append(item.name)
        elif item.status == "warn":
            self.warnings.append(item.name)
        elif item.status == "ok":
            self.active_features.append(item.name)


# ---- Individuel checks -----------------------------------------------------


def _check_database(report: ConfigReport) -> None:
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        report.add(CheckItem(
            name="Database",
            status="fail",
            summary="DATABASE_URL ikke sat",
            detail="Backend kan ikke køre uden DB. Se .env.example",
            fatal=True,
        ))
        return

    # Resolve dialect + try a SELECT 1
    try:
        from src.database.connection import check_db_connection, engine
        ok = check_db_connection()
    except Exception as exc:
        report.add(CheckItem(
            name="Database",
            status="fail",
            summary=f"DB connection failed: {exc!s}",
            detail=str(exc)[:300],
            fatal=True,
        ))
        return

    if not ok:
        report.add(CheckItem(
            name="Database",
            status="fail",
            summary="check_db_connection() returned False",
            detail=f"URL: {_redact_db_url(db_url)}",
            fatal=True,
        ))
        return

    # Get dialect + version (best-effort)
    detail_parts = [_redact_db_url(db_url)]
    try:
        from sqlalchemy import text
        from src.database.connection import engine
        dialect = engine.dialect.name
        with engine.connect() as conn:
            if dialect == "postgresql":
                row = conn.execute(text("SHOW server_version")).fetchone()
                if row:
                    detail_parts.append(f"PostgreSQL {row[0]}")
            elif dialect == "sqlite":
                row = conn.execute(text("SELECT sqlite_version()")).fetchone()
                if row:
                    detail_parts.append(f"SQLite {row[0]}")
            else:
                detail_parts.append(dialect)
    except Exception:
        pass

    report.add(CheckItem(
        name="Database",
        status="ok",
        summary=detail_parts[0],
        detail=" · ".join(detail_parts[1:]) if len(detail_parts) > 1 else None,
    ))


def _check_auth(report: ConfigReport) -> None:
    try:
        from src.auth.entra import get_auth_settings

        get_auth_settings.cache_clear()
        settings = get_auth_settings()
    except Exception as exc:
        report.add(CheckItem(
            name="Identitet & roller",
            status="fail",
            summary=str(exc),
            detail="Se Microsoft Entra-konfigurationen i .env.example",
            fatal=True,
        ))
        return

    if settings.mode == "development":
        report.add(CheckItem(
            name="Identitet & roller",
            status="warn",
            summary="lokal arbejdsidentitet uden Entra-signatur",
            detail="Roller: " + ", ".join(settings.development_roles),
        ))
        return
    report.add(CheckItem(
        name="Identitet & roller",
        status="ok",
        summary="Microsoft Entra ID",
        detail=f"tenant {settings.tenant_id} · audience {settings.audience}",
    ))


def _redact_db_url(url: str) -> str:
    """Skjul password i DB-URL — vi viser den i UI."""
    import re
    return re.sub(r"://([^:/]+):[^@]+@", r"://\1:***@", url)


def _check_llm_provider(report: ConfigReport) -> None:
    from src.services.codex_text_provider import is_available, MODEL
    if is_available():
        report.add(CheckItem(
            name="LLM provider", status="ok",
            summary=f"{MODEL} · midlertidig lokal AI-forbindelse",
            detail="Aktiveret til lokal afprøvning. Modellen er ikke kaldt som del af denne konfigurationskontrol.",
        ))
        return
    azure_key = os.getenv("AZURE_OPENAI_API_KEY")
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    openai_key = os.getenv("OPENAI_API_KEY")
    lm_studio_url = (os.getenv("LM_STUDIO_BASE_URL") or "").rstrip("/")

    azure_active = azure_endpoint and not _is_placeholder(azure_key)
    openai_active = not _is_placeholder(openai_key)
    lm_active = bool(lm_studio_url)

    if not (azure_active or openai_active or lm_active):
        report.add(CheckItem(
            name="LLM provider",
            status="warn",
            summary="Ingen LLM-provider konfigureret",
            detail=(
                "Sæt enten AZURE_OPENAI_API_KEY+ENDPOINT, OPENAI_API_KEY, "
                "eller LM_STUDIO_BASE_URL i .env. Lov-assistenten og den ældre "
                "juridiske screening kræver en LLM; konsekvensanalysen gør ikke."
            ),
        ))
        return

    # Pick selected (highest priority) and verify it's reachable
    if azure_active:
        report.add(CheckItem(
            name="LLM provider",
            status="ok",
            summary=f"Azure OpenAI ({azure_endpoint})",
            detail=f"deployment: {os.getenv('AZURE_DEPLOYMENT_NAME', 'gpt-4o-mini')}",
        ))
    elif openai_active:
        report.add(CheckItem(
            name="LLM provider",
            status="ok",
            summary="OpenAI (api.openai.com)",
            detail=f"model: {os.getenv('OPENAI_MODEL', 'gpt-4o-mini')}",
        ))
    elif lm_active:
        # Live-ping LM Studio with 2s timeout
        models_summary = _ping_lm_studio(lm_studio_url)
        if models_summary["reachable"]:
            chat = models_summary.get("chat_model") or "auto-pick"
            embed = models_summary.get("embedding_model") or "—"
            report.add(CheckItem(
                name="LLM provider",
                status="ok",
                summary=f"LM Studio ({lm_studio_url})",
                detail=f"chat: {chat} · embed: {embed}",
            ))
        else:
            report.add(CheckItem(
                name="LLM provider",
                status="warn",
                summary=f"LM Studio konfigureret men ikke nåbar ({lm_studio_url})",
                detail=models_summary.get("error", "Start LM Studio app og indlæs model"),
            ))


def _ping_lm_studio(url: str) -> dict:
    """Hit /v1/models med 2s timeout. Returnér dict med model-info."""
    try:
        import httpx
        with httpx.Client(timeout=2.0) as client:
            r = client.get(f"{url}/models")
            if r.status_code != 200:
                return {"reachable": False, "error": f"HTTP {r.status_code}"}
            data = r.json()
            models = [m.get("id", "") for m in data.get("data", [])]
            chat_pref = os.getenv("LM_STUDIO_CHAT_MODEL") or os.getenv("LM_STUDIO_MODEL")
            chat = chat_pref or next(
                (m for m in sorted(models, key=lambda m: (
                    0 if "gpt-oss" in m.lower() else
                    1 if m.lower().startswith("openai/") else
                    3 if "gemma" in m.lower() else 2
                )) if "embed" not in m.lower()),
                None,
            )
            embed = next((m for m in models if "embed" in m.lower()), None)
            return {
                "reachable": True,
                "chat_model": chat,
                "embedding_model": embed,
                "all_models": models,
            }
    except Exception as exc:
        return {"reachable": False, "error": str(exc)[:200]}


def _check_rag_index(report: ConfigReport) -> None:
    try:
        from src.services.law_rag import get_default_index
        index = get_default_index()
        if not index.is_ready():
            report.add(CheckItem(
                name="Lov-RAG-index",
                status="warn",
                summary="Index ikke bygget",
                detail="POST /api/law/rag/build for at indeksere de 7 love",
            ))
            return
        stats = index.stats()
        report.add(CheckItem(
            name="Lov-RAG-index",
            status="ok",
            summary=f"{stats['chunks']} chunks · {stats['laws']} love",
            detail=f"provider: {stats.get('provider')} · model: {stats.get('model')} · built {stats.get('built_at', 'ukendt')}",
        ))
    except Exception as exc:
        report.add(CheckItem(
            name="Lov-RAG-index",
            status="warn",
            summary=f"Kunne ikke læse stats: {exc!s}",
        ))


def _check_backup(report: ConfigReport) -> None:
    try:
        from src.services.backup_service import list_backups
        bs = list_backups()
        items = bs.get("items", [])
        by_kind = bs.get("by_kind", {})
        rsync_target = bs.get("rsync_target")
        if not items:
            report.add(CheckItem(
                name="Backup",
                status="warn",
                summary=f"Ingen dumps i {bs.get('directory')}",
                detail="pg_dump-job kører dagligt 01:30. Manuel: POST /api/v3/admin/backups/run",
            ))
            return
        latest = items[0]
        offsite = "off-site ✓" if rsync_target else "lokalt"
        kind_summary = (
            f"{by_kind.get('daily', 0)}d · {by_kind.get('weekly', 0)}u · "
            f"{by_kind.get('monthly', 0)}m · {by_kind.get('manual', 0)}man"
        )
        report.add(CheckItem(
            name="Backup",
            status="ok",
            summary=f"{bs.get('directory')} ({kind_summary} · {offsite})",
            detail=f"seneste: {latest['filename']} ({_format_bytes(latest['size_bytes'])})",
        ))
    except Exception as exc:
        report.add(CheckItem(
            name="Backup",
            status="warn",
            summary=f"backup_service utilgængelig: {exc!s}",
        ))


def _check_pg_dump(report: ConfigReport) -> None:
    """pg_dump skal være i PATH for at backup-jobbet virker mod PG."""
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url.startswith("postgres"):
        return  # Irrelevant for SQLite
    paths = [
        "/opt/homebrew/opt/postgresql@16/bin/pg_dump",
        "/usr/local/opt/postgresql@16/bin/pg_dump",
    ]
    found = next((p for p in paths if Path(p).exists()), None) or shutil.which("pg_dump")
    if found:
        report.add(CheckItem(
            name="pg_dump",
            status="ok",
            summary=found,
        ))
    else:
        report.add(CheckItem(
            name="pg_dump",
            status="warn",
            summary="pg_dump ikke fundet — backup-job vil fejle",
            detail="brew install postgresql@16",
        ))


def _check_cron_jobs(report: ConfigReport, scheduler=None) -> None:
    """Vis registrerede APScheduler-jobs. Scheduler-instansen passes ind
    fra main.py så vi ikke importerer cirkulært."""
    if scheduler is None:
        try:
            import importlib
            mod = importlib.import_module("main")
            scheduler = getattr(mod, "kb_scheduler", None)
        except Exception:
            pass
    if scheduler is None:
        report.add(CheckItem(
            name="Cron jobs",
            status="info",
            summary="Scheduler ikke initialiseret endnu",
        ))
        return

    try:
        if not scheduler.running:
            report.add(CheckItem(
                name="Cron jobs",
                status="warn",
                summary="APScheduler kører ikke",
            ))
            return
        jobs = list(scheduler.get_jobs())
        next_job = min(
            (j for j in jobs if j.next_run_time),
            key=lambda j: j.next_run_time,
            default=None,
        )
        next_summary = (
            f"næste: {next_job.id} {next_job.next_run_time.strftime('%a %H:%M')}"
            if next_job else "ingen næste-tider"
        )
        report.add(CheckItem(
            name="Cron jobs",
            status="ok",
            summary=f"{len(jobs)} registreret",
            detail=next_summary,
        ))
    except Exception as exc:
        report.add(CheckItem(
            name="Cron jobs",
            status="warn",
            summary=f"Scheduler-introspection failed: {exc!s}",
        ))


def _check_log_dir(report: ConfigReport) -> None:
    log_dir = Path(os.getenv("TYR_LOG_DIR") or (Path.home() / "Library" / "Logs" / "Tyr"))
    if not log_dir.exists():
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            report.add(CheckItem(
                name="Log dir",
                status="warn",
                summary=f"Kan ikke oprette {log_dir}: {exc!s}",
            ))
            return
    if not os.access(log_dir, os.W_OK):
        report.add(CheckItem(
            name="Log dir",
            status="warn",
            summary=f"{log_dir} ikke skrivbar",
        ))
        return
    # Show size
    total = 0
    try:
        for p in log_dir.rglob("*"):
            if p.is_file():
                total += p.stat().st_size
    except OSError:
        pass
    report.add(CheckItem(
        name="Log dir",
        status="ok",
        summary=str(log_dir),
        detail=f"{_format_bytes(total)}",
    ))


def _check_smtp(report: ConfigReport) -> None:
    host = os.getenv("SMTP_HOST")
    user = os.getenv("SMTP_USER")
    if not host or _is_placeholder(host) or _is_placeholder(user):
        report.add(CheckItem(
            name="SMTP",
            status="warn",
            summary="ikke konfigureret",
            detail="Case re-review reminders sendes ikke. Sæt SMTP_HOST, SMTP_USER, SMTP_PASSWORD i .env",
        ))
        return
    report.add(CheckItem(
        name="SMTP",
        status="ok",
        summary=f"{user}@{host}",
    ))


def _check_sentry(report: ConfigReport) -> None:
    dsn = os.getenv("SENTRY_DSN")
    if dsn and not _is_placeholder(dsn):
        report.add(CheckItem(
            name="Sentry",
            status="ok",
            summary="ekstern error-tracking aktiv",
        ))
    else:
        report.add(CheckItem(
            name="Sentry",
            status="info",
            summary="ikke konfigureret",
            detail="lokal error-buffer aktiv (~/Library/Logs/Tyr/errors.jsonl)",
        ))


# ---- Helpers ----------------------------------------------------------------


def _format_bytes(n: int) -> str:
    if n is None:
        return "—"
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


# ---- Public API -------------------------------------------------------------


def build_config_report(scheduler=None) -> ConfigReport:
    """Saml en ConfigReport. Kaldes både ved lifespan-startup og fra
    /api/v3/admin/config-endpointet (~50ms total)."""
    report = ConfigReport(
        generated_at=time.time(),
        api_port=int(os.getenv("API_PORT", "8001")),
        api_host=os.getenv("API_HOST", "0.0.0.0"),
        api_reload=os.getenv("API_RELOAD", "False").lower() == "true",
    )

    # Run all checks — order matters for the banner output
    _check_database(report)
    _check_auth(report)
    _check_llm_provider(report)
    _check_rag_index(report)
    _check_backup(report)
    _check_pg_dump(report)
    _check_cron_jobs(report, scheduler)
    _check_log_dir(report)
    _check_smtp(report)
    _check_sentry(report)

    return report


def render_startup_banner(report: ConfigReport) -> str:
    """Returnér en multi-line ASCII-banner til backend.console.log."""
    lines = [
        "=" * 80,
        f"S.H.I.E.L.D. backend starter — port {report.api_port} (host {report.api_host}, reload={report.api_reload})",
        "-" * 80,
    ]
    for it in report.items:
        marker = "✓" if it.status == "ok" else "⚠" if it.status == "warn" else "✗" if it.status == "fail" else "ℹ"
        line = f"{marker} {it.name:18s} {it.summary}"
        lines.append(line)
        if it.detail:
            lines.append(f"  {' ' * 18} {it.detail}")
    if report.critical_failures:
        lines.append("-" * 80)
        lines.append(f"FATAL: {', '.join(report.critical_failures)}")
    lines.append("=" * 80)
    return "\n".join(lines)
