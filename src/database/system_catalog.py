"""Imported system names and documented supplier/rights-holder relationships.

This is a local snapshot, never an assertion of a live KITOS integration or of
the municipality's contractual supplier. No contact details are stored.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .connection import Base


class SystemCatalogImport(Base):
    __tablename__ = "system_catalog_imports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_sha256: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    source_sheet: Mapped[str] = mapped_column(String(255), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    system_count: Mapped[int] = mapped_column(Integer, nullable=False)
    party_count: Mapped[int] = mapped_column(Integer, nullable=False)


class CatalogSystem(Base):
    __tablename__ = "system_catalog_systems"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    import_id: Mapped[str] = mapped_column(
        ForeignKey("system_catalog_imports.id"), nullable=False, index=True
    )
    source_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    search_name: Mapped[str] = mapped_column(String(500), nullable=False)
    available: Mapped[bool] = mapped_column(Boolean, nullable=False)

    __table_args__ = (UniqueConstraint("import_id", "source_id"),)


class CatalogParty(Base):
    __tablename__ = "system_catalog_parties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    import_id: Mapped[str] = mapped_column(
        ForeignKey("system_catalog_imports.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    search_name: Mapped[str] = mapped_column(String(1000), nullable=False)


class CatalogRelationship(Base):
    __tablename__ = "system_catalog_relationships"

    system_id: Mapped[str] = mapped_column(
        ForeignKey("system_catalog_systems.id"), primary_key=True
    )
    party_id: Mapped[str] = mapped_column(
        ForeignKey("system_catalog_parties.id"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(32), primary_key=True)


CATALOG_TABLES = [
    model.__table__
    for model in (SystemCatalogImport, CatalogSystem, CatalogParty, CatalogRelationship)
]
