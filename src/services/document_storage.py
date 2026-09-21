"""Persistent storage of uploaded documents tied to audit-log entries.

Why: the document-analyzer (M1) was previously fire-and-forget — once the
analysis returned, the source PDF/DOCX was discarded. Jurists need to see
WHERE in the document each predikat was extracted from to trust the result.
This module stores the original bytes alongside their audit_log_id and
serves them back via /api/v3/documents/{id}/source.

Storage layout:
    data/documents/<audit_log_id>.<ext>      — raw upload
    data/documents/<audit_log_id>.meta.json  — content_type + original filename

Files are read-only after write. Content-type is preserved so the API can
serve the right Content-Type header back to the browser.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# Default storage root; override with env var DOCUMENT_STORAGE_DIR.
_DEFAULT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "documents"

_SAFE_ID = re.compile(r"^[A-Za-z0-9._\-]+$")
_VALID_EXT = {".pdf", ".docx"}


@dataclass(frozen=True)
class StoredDocument:
    """Pointer to a previously-saved document."""

    audit_log_id: str
    path: Path
    content_type: str
    original_filename: str
    size_bytes: int


def _storage_dir() -> Path:
    override = os.getenv("DOCUMENT_STORAGE_DIR")
    base = Path(override) if override else _DEFAULT_DIR
    base.mkdir(parents=True, exist_ok=True)
    return base


def _validate_id(audit_log_id: str) -> None:
    """Reject anything that could escape the storage directory."""
    if not audit_log_id or not _SAFE_ID.match(audit_log_id):
        raise ValueError(f"invalid audit_log_id: {audit_log_id!r}")


def _ext_for(filename: str, kind: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf") or kind == "pdf":
        return ".pdf"
    if name.endswith(".docx") or kind == "docx":
        return ".docx"
    raise ValueError(f"unsupported file type for storage: {filename!r} ({kind})")


def store(
    audit_log_id: str,
    *,
    content: bytes,
    filename: str,
    kind: str,
    content_type: Optional[str] = None,
) -> StoredDocument:
    """Persist the document bytes + metadata. Idempotent on audit_log_id."""
    _validate_id(audit_log_id)
    ext = _ext_for(filename, kind)
    base = _storage_dir()
    file_path = base / f"{audit_log_id}{ext}"
    meta_path = base / f"{audit_log_id}.meta.json"

    if not content_type:
        content_type = (
            "application/pdf" if ext == ".pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )

    # Atomic-ish write: tempfile + rename
    tmp_path = file_path.with_suffix(file_path.suffix + ".tmp")
    with tmp_path.open("wb") as fh:
        fh.write(content)
    tmp_path.replace(file_path)

    meta = {
        "audit_log_id": audit_log_id,
        "original_filename": filename or "",
        "content_type": content_type,
        "size_bytes": len(content),
        "kind": ext.lstrip("."),
    }
    with meta_path.open("w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

    logger.info("Stored document %s (%d bytes) -> %s", audit_log_id, len(content), file_path.name)
    return StoredDocument(
        audit_log_id=audit_log_id,
        path=file_path,
        content_type=content_type,
        original_filename=filename or "",
        size_bytes=len(content),
    )


def find(audit_log_id: str) -> Optional[StoredDocument]:
    """Return a pointer to the stored document, or None if not present."""
    try:
        _validate_id(audit_log_id)
    except ValueError:
        return None
    base = _storage_dir()
    meta_path = base / f"{audit_log_id}.meta.json"
    if not meta_path.exists():
        return None
    try:
        with meta_path.open("r", encoding="utf-8") as fh:
            meta = json.load(fh)
    except Exception:
        logger.exception("Failed to read meta for %s", audit_log_id)
        return None

    ext = "." + (meta.get("kind") or "pdf")
    file_path = base / f"{audit_log_id}{ext}"
    if not file_path.exists():
        return None

    return StoredDocument(
        audit_log_id=audit_log_id,
        path=file_path,
        content_type=meta.get("content_type") or "application/octet-stream",
        original_filename=meta.get("original_filename") or "",
        size_bytes=int(meta.get("size_bytes") or file_path.stat().st_size),
    )


def delete(audit_log_id: str) -> bool:
    """Remove a stored document. Returns True if anything was deleted."""
    try:
        _validate_id(audit_log_id)
    except ValueError:
        return False
    base = _storage_dir()
    deleted = False
    for ext in _VALID_EXT:
        p = base / f"{audit_log_id}{ext}"
        if p.exists():
            p.unlink()
            deleted = True
    meta = base / f"{audit_log_id}.meta.json"
    if meta.exists():
        meta.unlink()
        deleted = True
    return deleted
