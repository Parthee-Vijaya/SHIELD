"""Observability — structured logging, request-ID, error-buffer, metrics.

Modul 4 i pilot-readiness-planen. Alle komponenter er lokale (ingen Sentry,
ingen ekstern observability-platform) — alt under Tailscale-grænsen.

Komponenter:
- ``configure_logging()`` — sætter loguru op til at skrive JSON-linjer til
  ~/Library/Logs/Tyr/backend.log med dag-rotation (7 dages bevarelse).
- ``RequestIDMiddleware`` — sikrer at hver request har en X-Request-ID; den
  bruges i logs og fejlbufferen så et UI-issue kan kortlægges til en
  konkret request linje for linje.
- ``record_error()`` + ``recent_errors()`` — append-only ring-buffer (i
  hukommelse + på disk) af de seneste fejl. Eksponeres af /api/v3/admin/
  errors-endpointet og bruges af /drift-siden i frontend.
- Prometheus-counters/histograms til /metrics — request count + latency +
  scheduler-status.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import traceback
import uuid
from collections import deque
from datetime import datetime, UTC
from pathlib import Path
from threading import Lock
from typing import Any, Optional

from loguru import logger as loguru_logger

# Prometheus metrics — initialised once at module load. Use prometheus-client
# directly because requirements.txt already pins it. We keep all counters
# global so middleware + scheduler-jobs can update without passing instances.
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST


# ---- Paths -----------------------------------------------------------------

def _log_dir() -> Path:
    override = os.getenv("TYR_LOG_DIR")
    if override:
        return Path(override)
    # Mac default — matches the Skynet pattern for Bifrost / Odin / Saga
    return Path.home() / "Library" / "Logs" / "Tyr"


def _errors_path() -> Path:
    return _log_dir() / "errors.jsonl"


# ---- Logging ---------------------------------------------------------------

_logging_configured = False


def configure_logging() -> None:
    """Configure loguru for structured JSON output + stdlib bridge.

    Writes:
    - JSON lines → backend.log (rotates daily, 7-day retention)
    - Plain console → stderr (so dev still sees readable output)
    Bridges Python's stdlib logging into loguru so SQLAlchemy / uvicorn /
    httpx all flow through the same sink.
    """
    global _logging_configured
    if _logging_configured:
        return

    log_dir = _log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)

    loguru_logger.remove()

    # Console — keep human-readable
    loguru_logger.add(
        sys.stderr,
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> "
            "<level>{level: <7}</level> "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> "
            "{extra} - <level>{message}</level>"
        ),
    )

    # File — JSON lines, daily rotation, 7-day retention
    loguru_logger.add(
        log_dir / "backend.log",
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        rotation="00:00",  # rotate at midnight
        retention="7 days",
        compression="gz",
        serialize=True,  # JSON output
        enqueue=True,  # thread-safe
    )

    # Bridge stdlib logging → loguru. Uvicorn, FastAPI, SQLAlchemy etc.
    # write to stdlib; this captures them.
    class _InterceptHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover
            try:
                level = loguru_logger.level(record.levelname).name
            except ValueError:
                level = record.levelno
            frame, depth = sys._getframe(6), 6
            while frame and frame.f_code.co_filename == logging.__file__:
                frame = frame.f_back
                depth += 1
            loguru_logger.opt(depth=depth, exception=record.exc_info).log(
                level, record.getMessage()
            )

    logging.basicConfig(handlers=[_InterceptHandler()], level=0, force=True)

    _logging_configured = True


# ---- Request-ID ------------------------------------------------------------

REQUEST_ID_HEADER = "X-Request-ID"


def new_request_id() -> str:
    return uuid.uuid4().hex[:16]


class RequestIDMiddleware:
    """ASGI-middleware that ensures each request has a request_id.

    Reads X-Request-ID from incoming headers (e.g. set by a reverse proxy);
    falls back to a fresh hex token. The id is added to the response header
    and bound to loguru so any log call within the request is tagged.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        # Pull request_id from headers if present
        request_id: Optional[str] = None
        for name, value in scope.get("headers", []):
            if name.lower() == REQUEST_ID_HEADER.lower().encode():
                request_id = value.decode(errors="replace")[:64]
                break
        if not request_id:
            request_id = new_request_id()

        scope.setdefault("state", {})
        scope["state"]["request_id"] = request_id

        # Bind for any logger.info() inside the request
        with loguru_logger.contextualize(request_id=request_id):
            async def send_with_request_id(message):
                if message["type"] == "http.response.start":
                    headers = list(message.get("headers", []))
                    headers.append(
                        (REQUEST_ID_HEADER.lower().encode(), request_id.encode())
                    )
                    message["headers"] = headers
                await send(message)

            await self.app(scope, receive, send_with_request_id)


# ---- Error buffer ----------------------------------------------------------

_BUFFER_MAX = 500
_buffer: deque[dict] = deque(maxlen=_BUFFER_MAX)
_buffer_lock = Lock()
_errors_disk_lock = Lock()


def record_error(
    *,
    error: BaseException,
    endpoint: Optional[str] = None,
    request_id: Optional[str] = None,
    actor: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> dict:
    """Capture a single error for /diagnostics. Append to memory ring +
    JSONL on disk. Never raises — must work even if disk is full.
    """
    entry = {
        "occurred_at": datetime.now(UTC).isoformat(),
        "error_class": type(error).__name__,
        "message": str(error)[:500],
        "endpoint": endpoint,
        "request_id": request_id,
        "actor": actor,
        "stack": "".join(traceback.format_exception(type(error), error, error.__traceback__))[-3000:],
        "extra": extra or {},
    }

    with _buffer_lock:
        _buffer.append(entry)

    try:
        path = _errors_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with _errors_disk_lock:
            with path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
            # Trim the disk file to last _BUFFER_MAX lines if it gets large
            try:
                size = path.stat().st_size
                if size > 5 * 1024 * 1024:  # 5 MB
                    _trim_errors_file(path, _BUFFER_MAX)
            except OSError:
                pass
    except Exception:
        # If we can't write to disk, the in-memory buffer still has it.
        pass

    return entry


def _trim_errors_file(path: Path, max_lines: int) -> None:
    """Keep only the last ``max_lines`` lines of the errors file."""
    try:
        with path.open("r", encoding="utf-8") as fh:
            lines = fh.readlines()
        if len(lines) > max_lines:
            with path.open("w", encoding="utf-8") as fh:
                fh.writelines(lines[-max_lines:])
    except OSError:
        pass


def recent_errors(limit: int = 50) -> list[dict]:
    """Return the most recent ``limit`` error entries, newest first."""
    with _buffer_lock:
        items = list(_buffer)
    items.reverse()
    return items[:limit]


def load_errors_from_disk() -> int:
    """Restore the in-memory ring from disk on startup. Returns count loaded."""
    path = _errors_path()
    if not path.exists():
        return 0
    try:
        with path.open("r", encoding="utf-8") as fh:
            lines = fh.readlines()[-_BUFFER_MAX:]
        with _buffer_lock:
            _buffer.clear()
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    _buffer.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return len(_buffer)
    except OSError:
        return 0


# ---- Metrics (Prometheus) --------------------------------------------------

# Request-level
HTTP_REQUESTS_TOTAL = Counter(
    "tyr_http_requests_total",
    "Total HTTP requests served by Tyr.",
    ["method", "endpoint", "status"],
)
HTTP_REQUEST_DURATION = Histogram(
    "tyr_http_request_duration_seconds",
    "HTTP request latency in seconds.",
    ["method", "endpoint"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60),
)

# LLM-call level (used by signal_extractor, law_assistant, document_analyzer)
LLM_CALLS_TOTAL = Counter(
    "tyr_llm_calls_total",
    "Total LLM API calls broken down by provider + outcome.",
    ["provider", "outcome"],
)
LLM_CALL_DURATION = Histogram(
    "tyr_llm_call_duration_seconds",
    "LLM call latency in seconds.",
    ["provider"],
    buckets=(0.5, 1, 2, 5, 10, 20, 30, 60, 120),
)

# Scheduler jobs — last-run gauges so /drift can show "last successful run"
SCHEDULER_JOB_LAST_RUN = Gauge(
    "tyr_scheduler_job_last_run_timestamp",
    "Unix timestamp of last successful run for each scheduler job.",
    ["job_id"],
)
SCHEDULER_JOB_LAST_DURATION = Gauge(
    "tyr_scheduler_job_last_duration_seconds",
    "Duration in seconds of the last run for each scheduler job.",
    ["job_id"],
)

# Citation freshness summary
CITATION_FRESHNESS = Gauge(
    "tyr_citation_freshness_total",
    "Citation freshness rule counts.",
    ["status"],  # "ok" | "flagged"
)


def metrics_response_body() -> tuple[bytes, str]:
    """Return (body, content_type) for the /metrics endpoint."""
    return generate_latest(), CONTENT_TYPE_LATEST


# ---- Helper for scheduler jobs --------------------------------------------

def time_scheduler_job(job_id: str):
    """Context-manager helper that records a job's success + duration."""
    class _Timer:
        def __enter__(self):
            self._start = time.monotonic()
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            dur = time.monotonic() - self._start
            if exc_type is None:
                SCHEDULER_JOB_LAST_RUN.labels(job_id=job_id).set(time.time())
                SCHEDULER_JOB_LAST_DURATION.labels(job_id=job_id).set(dur)
            else:
                # Record as a failure via 0-timestamp gauge but still record duration
                SCHEDULER_JOB_LAST_DURATION.labels(job_id=job_id).set(dur)
                record_error(
                    error=exc_val,
                    endpoint=f"scheduler:{job_id}",
                )
            return False  # don't swallow

    return _Timer()
