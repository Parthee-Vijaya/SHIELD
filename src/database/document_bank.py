"""Versioned metadata for the municipal document bank.

Binary storage is deliberately separate from these records.  A version is
identified by its SHA-256 checksum and a server-generated storage key, so a
case always points to the exact bytes that were reviewed.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Session, relationship

from src.database.cases import get_case
from src.database.connection import Base


DOCUMENT_STATUSES = {"draft", "approved", "superseded", "withdrawn"}
DOCUMENT_CATEGORIES = {
    "data_processing_agreement",
    "policy",
    "security_documentation",
    "supplier_documentation",
    "assessment",
    "template",
    "other",
}
LINK_ROLES = {"evidence", "basis", "attachment", "output", "template"}
ALLOWED_FILE_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
}
_CHECKSUM = re.compile(r"^[a-fA-F0-9]{64}$")
_UNSAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return str(uuid.uuid4())


def safe_filename(filename: str) -> str:
    """Return a traversal-free filename restricted to supported file types."""

    leaf = Path(filename or "").name.strip().replace("\x00", "")
    sanitized = _UNSAFE_FILENAME.sub("-", leaf).strip(".-")
    if not sanitized or "." not in sanitized:
        raise ValueError("filename must include a supported extension")
    extension = Path(sanitized).suffix.lower()
    if extension not in ALLOWED_FILE_TYPES:
        raise ValueError(f"unsupported document extension: {extension}")
    stem = Path(sanitized).stem[:120].strip(".-") or "document"
    return f"{stem}{extension}"


def document_storage_key(document_id: str, version_number: int, filename: str) -> str:
    """Build a relative, server-controlled object key (never a filesystem path)."""

    try:
        normalized_id = str(uuid.UUID(document_id))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("document_id must be a UUID") from exc
    if version_number < 1:
        raise ValueError("version_number must be positive")
    return f"document-bank/{normalized_id}/v{version_number}/{safe_filename(filename)}"


class MunicipalDocument(Base):
    """Logical municipal document with one or more immutable versions."""

    __tablename__ = "municipal_documents"

    id = Column(String(36), primary_key=True, default=_uuid)
    document_key = Column(String(128), nullable=True, unique=True, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(64), nullable=False, default="other", index=True)
    owner = Column(String(128), nullable=True, index=True)
    classification = Column(String(64), nullable=True)
    tags = Column(JSON, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_by = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    versions = relationship(
        "MunicipalDocumentVersion",
        back_populates="document",
        cascade="all, delete-orphan",
        foreign_keys="MunicipalDocumentVersion.document_id",
        order_by="MunicipalDocumentVersion.version_number",
    )

    def to_dict(self, *, include_versions: bool = False) -> dict[str, Any]:
        payload = {
            "id": self.id,
            "document_key": self.document_key,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "owner": self.owner,
            "classification": self.classification,
            "tags": self.tags or [],
            "is_active": self.is_active,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_versions:
            payload["versions"] = [version.to_dict() for version in self.versions]
        return payload


class MunicipalDocumentVersion(Base):
    """Immutable file metadata for one exact document version."""

    __tablename__ = "municipal_document_versions"

    id = Column(String(36), primary_key=True, default=_uuid)
    document_id = Column(
        String(36),
        ForeignKey("municipal_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False)
    original_filename = Column(String(255), nullable=False)
    media_type = Column(String(255), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    content_sha256 = Column(String(64), nullable=False)
    storage_key = Column(String(1000), nullable=False, unique=True)
    status = Column(String(24), nullable=False, default="draft", index=True)
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_to = Column(DateTime(timezone=True), nullable=True, index=True)
    review_at = Column(DateTime(timezone=True), nullable=True, index=True)
    supersedes_id = Column(
        String(36), ForeignKey("municipal_document_versions.id"), nullable=True
    )
    uploaded_by = Column(String(128), nullable=True)
    approved_by = Column(String(128), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approval_note = Column(Text, nullable=True)
    version_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    document = relationship(
        "MunicipalDocument",
        back_populates="versions",
        foreign_keys=[document_id],
    )
    supersedes = relationship(
        "MunicipalDocumentVersion",
        remote_side=[id],
        foreign_keys=[supersedes_id],
    )

    __table_args__ = (
        UniqueConstraint(
            "document_id", "version_number", name="uq_document_version_number"
        ),
        UniqueConstraint(
            "document_id", "content_sha256", name="uq_document_version_content"
        ),
        Index("ix_document_version_status", "document_id", "status", "version_number"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "document_id": self.document_id,
            "version_number": self.version_number,
            "original_filename": self.original_filename,
            "media_type": self.media_type,
            "size_bytes": self.size_bytes,
            "sha256": self.content_sha256,
            "storage_key": self.storage_key,
            "status": self.status,
            "valid_from": self.valid_from.isoformat() if self.valid_from else None,
            "valid_to": self.valid_to.isoformat() if self.valid_to else None,
            "review_at": self.review_at.isoformat() if self.review_at else None,
            "supersedes_id": self.supersedes_id,
            "uploaded_by": self.uploaded_by,
            "approved_by": self.approved_by,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "approval_note": self.approval_note,
            "metadata": self.version_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CaseDocumentLink(Base):
    """Version-pinned link between a case and a bank document."""

    __tablename__ = "case_document_links"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_db_id = Column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id = Column(
        String(36),
        ForeignKey("municipal_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_version_id = Column(
        String(36),
        ForeignKey("municipal_document_versions.id"),
        nullable=False,
        index=True,
    )
    link_role = Column(String(32), nullable=False, default="evidence")
    note = Column(Text, nullable=True)
    linked_by = Column(String(128), nullable=True)
    linked_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    case = relationship("Case")
    document = relationship("MunicipalDocument")
    version = relationship("MunicipalDocumentVersion")

    __table_args__ = (
        UniqueConstraint(
            "case_db_id",
            "document_version_id",
            "link_role",
            name="uq_case_document_version_role",
        ),
        Index("ix_case_document_linked", "case_db_id", "linked_at"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "case_db_id": self.case_db_id,
            "document_id": self.document_id,
            "document_version_id": self.document_version_id,
            "link_role": self.link_role,
            "note": self.note,
            "linked_by": self.linked_by,
            "linked_at": self.linked_at.isoformat() if self.linked_at else None,
            "document": self.document.to_dict() if self.document else None,
            "version": self.version.to_dict() if self.version else None,
        }


def create_document(
    session: Session,
    *,
    title: str,
    category: str,
    document_key: Optional[str] = None,
    description: Optional[str] = None,
    owner: Optional[str] = None,
    classification: Optional[str] = None,
    tags: Optional[list[str]] = None,
    created_by: Optional[str] = None,
) -> MunicipalDocument:
    if len((title or "").strip()) < 3:
        raise ValueError("document title must be at least 3 characters")
    if category not in DOCUMENT_CATEGORIES:
        raise ValueError(f"invalid document category: {category}")
    normalized_key = (document_key or "").strip() or None
    if normalized_key:
        existing = (
            session.query(MunicipalDocument)
            .filter(MunicipalDocument.document_key == normalized_key)
            .one_or_none()
        )
        if existing is not None:
            raise ValueError(f"document key already exists: {normalized_key}")
    document = MunicipalDocument(
        document_key=normalized_key,
        title=title.strip(),
        description=(description or "").strip() or None,
        category=category,
        owner=(owner or "").strip() or None,
        classification=(classification or "").strip() or None,
        tags=sorted({item.strip() for item in (tags or []) if item.strip()}),
        created_by=(created_by or "").strip() or None,
    )
    session.add(document)
    session.flush()
    return document


def add_document_version(
    session: Session,
    *,
    document_id: str,
    original_filename: str,
    size_bytes: int,
    sha256: str,
    media_type: Optional[str] = None,
    version_number: Optional[int] = None,
    status: str = "draft",
    valid_from: Optional[datetime] = None,
    valid_to: Optional[datetime] = None,
    review_at: Optional[datetime] = None,
    uploaded_by: Optional[str] = None,
    approved_by: Optional[str] = None,
    approval_note: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> MunicipalDocumentVersion:
    document = session.get(MunicipalDocument, document_id)
    if document is None:
        raise ValueError(f"document not found: {document_id}")
    normalized_filename = safe_filename(original_filename)
    expected_media_type = ALLOWED_FILE_TYPES[Path(normalized_filename).suffix.lower()]
    normalized_media_type = (media_type or expected_media_type).strip().lower()
    if normalized_media_type != expected_media_type:
        raise ValueError("media type does not match the file extension")
    if size_bytes < 1:
        raise ValueError("document size must be positive")
    normalized_hash = (sha256 or "").strip().lower()
    if not _CHECKSUM.fullmatch(normalized_hash):
        raise ValueError("sha256 must contain 64 hexadecimal characters")
    if status not in DOCUMENT_STATUSES:
        raise ValueError(f"invalid document status: {status}")
    if valid_from and valid_to and valid_to <= valid_from:
        raise ValueError("valid_to must be after valid_from")
    latest = (
        session.query(MunicipalDocumentVersion)
        .filter(MunicipalDocumentVersion.document_id == document_id)
        .order_by(MunicipalDocumentVersion.version_number.desc())
        .first()
    )
    next_version = version_number or ((latest.version_number + 1) if latest else 1)
    if next_version < 1:
        raise ValueError("version_number must be positive")
    duplicate = (
        session.query(MunicipalDocumentVersion)
        .filter(
            MunicipalDocumentVersion.document_id == document_id,
            MunicipalDocumentVersion.content_sha256 == normalized_hash,
        )
        .one_or_none()
    )
    if duplicate is not None:
        raise ValueError("this file content already exists as a document version")
    if status == "approved" and len((approved_by or "").strip()) < 2:
        raise ValueError("approved versions require an approver")
    version = MunicipalDocumentVersion(
        document_id=document_id,
        version_number=next_version,
        original_filename=normalized_filename,
        media_type=normalized_media_type,
        size_bytes=size_bytes,
        content_sha256=normalized_hash,
        storage_key=document_storage_key(
            document_id, next_version, normalized_filename
        ),
        status=status,
        valid_from=valid_from,
        valid_to=valid_to,
        review_at=review_at,
        supersedes_id=latest.id if latest else None,
        uploaded_by=(uploaded_by or "").strip() or None,
        approved_by=(approved_by or "").strip() or None,
        approved_at=_now() if status == "approved" else None,
        approval_note=(approval_note or "").strip() or None,
        version_metadata=metadata or {},
    )
    if status == "approved":
        _supersede_approved_versions(session, document_id)
    session.add(version)
    document.updated_at = _now()
    session.flush()
    return version


def approve_document_version(
    session: Session,
    version_id: str,
    *,
    approved_by: str,
    approval_note: str,
) -> MunicipalDocumentVersion:
    version = session.get(MunicipalDocumentVersion, version_id)
    if version is None:
        raise ValueError(f"document version not found: {version_id}")
    if version.status not in {"draft", "approved"}:
        raise ValueError(f"cannot approve a {version.status} document version")
    if len((approved_by or "").strip()) < 2:
        raise ValueError("approver is required")
    if len((approval_note or "").strip()) < 10:
        raise ValueError("approval note must be at least 10 characters")
    _supersede_approved_versions(session, version.document_id, except_id=version.id)
    version.status = "approved"
    version.approved_by = approved_by.strip()
    version.approved_at = _now()
    version.approval_note = approval_note.strip()
    session.flush()
    return version


def _supersede_approved_versions(
    session: Session, document_id: str, *, except_id: Optional[str] = None
) -> None:
    query = session.query(MunicipalDocumentVersion).filter(
        MunicipalDocumentVersion.document_id == document_id,
        MunicipalDocumentVersion.status == "approved",
    )
    if except_id:
        query = query.filter(MunicipalDocumentVersion.id != except_id)
    for existing in query.all():
        existing.status = "superseded"


def list_documents(
    session: Session,
    *,
    category: Optional[str] = None,
    owner: Optional[str] = None,
    include_inactive: bool = False,
    limit: int = 200,
) -> list[MunicipalDocument]:
    query = session.query(MunicipalDocument)
    if not include_inactive:
        query = query.filter(MunicipalDocument.is_active.is_(True))
    if category:
        query = query.filter(MunicipalDocument.category == category)
    if owner:
        query = query.filter(MunicipalDocument.owner == owner)
    return query.order_by(MunicipalDocument.updated_at.desc()).limit(limit).all()


def link_document_to_case(
    session: Session,
    *,
    case_db_id: str,
    document_id: str,
    document_version_id: Optional[str] = None,
    link_role: str = "evidence",
    note: Optional[str] = None,
    linked_by: Optional[str] = None,
    allow_unapproved: bool = False,
) -> CaseDocumentLink:
    if get_case(session, case_db_id) is None:
        raise ValueError(f"case not found: {case_db_id}")
    document = session.get(MunicipalDocument, document_id)
    if document is None:
        raise ValueError(f"document not found: {document_id}")
    if link_role not in LINK_ROLES:
        raise ValueError(f"invalid document link role: {link_role}")
    if document_version_id:
        version = session.get(MunicipalDocumentVersion, document_version_id)
        if version is None or version.document_id != document_id:
            raise ValueError("document version does not belong to the document")
    else:
        version = (
            session.query(MunicipalDocumentVersion)
            .filter(
                MunicipalDocumentVersion.document_id == document_id,
                MunicipalDocumentVersion.status == "approved",
            )
            .order_by(MunicipalDocumentVersion.version_number.desc())
            .first()
        )
        if version is None:
            raise ValueError("document has no approved version")
    if not allow_unapproved and version.status != "approved":
        raise ValueError("only approved document versions can be linked")
    existing = (
        session.query(CaseDocumentLink)
        .filter(
            CaseDocumentLink.case_db_id == case_db_id,
            CaseDocumentLink.document_version_id == version.id,
            CaseDocumentLink.link_role == link_role,
        )
        .one_or_none()
    )
    if existing is not None:
        return existing
    link = CaseDocumentLink(
        case_db_id=case_db_id,
        document_id=document_id,
        document_version_id=version.id,
        link_role=link_role,
        note=(note or "").strip() or None,
        linked_by=(linked_by or "").strip() or None,
    )
    session.add(link)
    session.flush()
    return link


def list_case_documents(session: Session, case_db_id: str) -> list[CaseDocumentLink]:
    return (
        session.query(CaseDocumentLink)
        .filter(CaseDocumentLink.case_db_id == case_db_id)
        .order_by(CaseDocumentLink.linked_at.desc())
        .all()
    )
