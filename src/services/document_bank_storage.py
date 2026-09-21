"""Safe local binary storage for municipal document-bank versions.

The database stores only server-generated relative keys.  These helpers keep
path validation, file signatures, size limits and checksum verification in one
place so a future object-storage adapter can preserve the same contract.
"""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
import zipfile
import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Optional

from src.database.document_bank import (
    ALLOWED_FILE_TYPES,
    document_storage_key,
    safe_filename,
)


_DEFAULT_ROOT = Path(__file__).resolve().parents[2] / "data" / "document-bank"


@dataclass(frozen=True)
class StoredBankFile:
    storage_key: str
    path: Path
    original_filename: str
    media_type: str
    size_bytes: int
    sha256: str


def _storage_root(root: Optional[Path] = None) -> Path:
    configured = root or Path(os.getenv("DOCUMENT_BANK_STORAGE_DIR", _DEFAULT_ROOT))
    resolved = configured.expanduser().resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def _max_bytes() -> int:
    try:
        configured = int(os.getenv("DOCUMENT_BANK_MAX_BYTES", str(50 * 1024 * 1024)))
    except ValueError:
        configured = 50 * 1024 * 1024
    return max(1, configured)


def safe_office_xml(content: bytes) -> ElementTree.Element:
    """Office XML never needs a DTD; reject it before parsing entity declarations."""
    normalized = content.replace(b"\x00", b"").upper()
    if b"<!DOCTYPE" in normalized or b"<!ENTITY" in normalized:
        raise ValueError("Office document contains unsafe XML declarations")
    try:
        return ElementTree.fromstring(content)
    except ElementTree.ParseError as exc:
        raise ValueError("Office document contains invalid XML") from exc


def validate_office_package(extension: str, content: bytes) -> None:
    """Bound ZIP expansion and reject encrypted, executable or mismatched Office files."""
    parts = {
        ".docx": "word/document.xml",
        ".xlsx": "xl/workbook.xml",
        ".pptx": "ppt/presentation.xml",
    }
    main_types = {
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    }
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            entries = archive.infolist()
            names = [item.filename for item in entries]
            if len(entries) > 1000 or len(names) != len(set(names)):
                raise ValueError(
                    "Office document contains too many or duplicate ZIP entries"
                )
            if sum(item.file_size for item in entries) > 40_000_000:
                raise ValueError("Office document expands beyond the safe size limit")
            for item in entries:
                name = item.filename.lower()
                relative = PurePosixPath(item.filename)
                if relative.is_absolute() or ".." in relative.parts or "\\" in name:
                    raise ValueError("Office document contains an unsafe package path")
                if item.flag_bits & 1:
                    raise ValueError("Encrypted Office documents are not supported")
                if item.file_size > 10_000_000 or item.file_size > max(
                    200_000, item.compress_size * 250
                ):
                    raise ValueError(
                        "Office document contains an unsafe compressed entry"
                    )
                if (
                    (
                        name.endswith(".bin")
                        and not re.fullmatch(
                            r"(?:ppt|word|xl)/printersettings/printersettings[0-9]+\.bin",
                            name,
                        )
                    )
                    or name.endswith((".exe", ".dll", ".js", ".vbs"))
                    or "vbaproject" in name
                ):
                    raise ValueError(
                        "Office documents with macros or embedded executable objects are not supported"
                    )
            if "[Content_Types].xml" not in names or parts[extension] not in names:
                raise ValueError(f"file content does not match {extension}")
            types = safe_office_xml(archive.read("[Content_Types].xml"))
            declared_main = next(
                (
                    node.attrib.get("ContentType")
                    for node in types
                    if node.attrib.get("PartName") == "/" + parts[extension]
                ),
                None,
            )
            if declared_main != main_types[extension]:
                raise ValueError(f"Office package signature does not match {extension}")
            # Standard Office exports carry inert printer settings. Accept only
            # that declared binary part; macros and OLE objects stay rejected.
            for name in names:
                if name.lower().endswith(".bin"):
                    declared = next(
                        (
                            node.attrib.get("ContentType", "")
                            for node in types
                            if node.attrib.get("PartName") == "/" + name
                        ),
                        None,
                    )
                    declared = declared or next(
                        (
                            node.attrib.get("ContentType", "")
                            for node in types
                            if node.attrib.get("Extension", "").lower() == "bin"
                        ),
                        "",
                    )
                    if not declared.endswith(".printerSettings"):
                        raise ValueError("Office binary part is not printer settings")
            if any(
                "macroenabled" in str(node.attrib.get("ContentType", "")).lower()
                for node in types
            ):
                raise ValueError("Office documents with macros are not supported")
            # Validate every XML entry, including relationships, before any parser sees it.
            for item in entries:
                if item.filename.lower().endswith((".xml", ".rels")):
                    safe_office_xml(archive.read(item))
    except (zipfile.BadZipFile, OSError, RuntimeError, NotImplementedError) as exc:
        raise ValueError("Office document is not a valid readable ZIP package") from exc


def _validate_content(extension: str, content: bytes) -> None:
    if extension == ".pdf" and not content.startswith(b"%PDF-"):
        raise ValueError("file content is not a PDF")
    if extension in {".docx", ".xlsx", ".pptx"}:
        validate_office_package(extension, content)
    if extension == ".txt":
        try:
            content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("text documents must use UTF-8") from exc


def store_document_bytes(
    *,
    document_id: str,
    version_number: int,
    filename: str,
    content: bytes,
    declared_media_type: Optional[str] = None,
    root: Optional[Path] = None,
) -> StoredBankFile:
    """Atomically persist validated bytes and return trusted file metadata."""

    if not content:
        raise ValueError("document content is empty")
    if len(content) > _max_bytes():
        raise ValueError("document exceeds the configured size limit")
    normalized_name = safe_filename(filename)
    extension = Path(normalized_name).suffix.lower()
    media_type = ALLOWED_FILE_TYPES[extension]
    if declared_media_type and declared_media_type.strip().lower() != media_type:
        raise ValueError("declared media type does not match the file extension")
    _validate_content(extension, content)
    storage_key = document_storage_key(document_id, version_number, normalized_name)
    storage_root = _storage_root(root)
    destination = (storage_root / PurePosixPath(storage_key)).resolve()
    if storage_root not in destination.parents:
        raise ValueError("invalid document storage key")
    destination.parent.mkdir(parents=True, exist_ok=True)
    checksum = hashlib.sha256(content).hexdigest()
    if destination.exists():
        existing_checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
        if existing_checksum != checksum:
            raise ValueError(
                "document version storage key already contains other content"
            )
        return StoredBankFile(
            storage_key=storage_key,
            path=destination,
            original_filename=normalized_name,
            media_type=media_type,
            size_bytes=len(content),
            sha256=checksum,
        )
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=".upload-", dir=destination.parent
    )
    try:
        with os.fdopen(file_descriptor, "wb") as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, destination)
    except Exception:
        try:
            Path(temporary_name).unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return StoredBankFile(
        storage_key=storage_key,
        path=destination,
        original_filename=normalized_name,
        media_type=media_type,
        size_bytes=len(content),
        sha256=checksum,
    )


def read_document_bytes(
    storage_key: str,
    *,
    expected_sha256: Optional[str] = None,
    root: Optional[Path] = None,
) -> bytes:
    storage_root = _storage_root(root)
    relative = PurePosixPath(storage_key or "")
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("invalid document storage key")
    source = (storage_root / relative).resolve()
    if storage_root not in source.parents or not source.is_file():
        raise FileNotFoundError(storage_key)
    content = source.read_bytes()
    if expected_sha256:
        actual = hashlib.sha256(content).hexdigest()
        if actual != expected_sha256.strip().lower():
            raise ValueError("stored document checksum does not match metadata")
    return content


def delete_document_bytes(storage_key: str, *, root: Optional[Path] = None) -> bool:
    """Delete one exact object key; callers remain responsible for DB policy."""

    storage_root = _storage_root(root)
    relative = PurePosixPath(storage_key or "")
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("invalid document storage key")
    target = (storage_root / relative).resolve()
    if storage_root not in target.parents:
        raise ValueError("invalid document storage key")
    if not target.is_file():
        return False
    target.unlink()
    return True
