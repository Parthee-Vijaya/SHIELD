"""Authenticated suggestions from the most recent imported catalog snapshot."""

from typing import Literal, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import case, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.auth import UserPrincipal, require_roles
from src.database.connection import get_db
from src.database.system_catalog import (
    CatalogParty,
    CatalogRelationship,
    CatalogSystem,
    SystemCatalogImport,
)
from src.services.system_catalog_import import normalize_name

router = APIRouter(prefix="/api/system-catalog", tags=["system-catalog"])
ACCESS = require_roles(
    "Hammeren.Sagsbehandler", "Hammeren.Godkender", "Hammeren.DPO", "Hammeren.Admin"
)
ROLE_LABELS = {
    "rights_holder": "Rettighedshaver",
    "data_processor": "Databehandler i DBS",
}
CatalogEntry = TypeVar("CatalogEntry", CatalogSystem, CatalogParty)


def _matching_entries(
    db: Session,
    model: type[CatalogEntry],
    import_id: str,
    query: str,
    limit: int,
    related_ids: set[str] | None = None,
) -> tuple[list[CatalogEntry], int]:
    statement = select(model).where(model.import_id == import_id)
    for token in query.split()[:12]:
        statement = statement.where(model.search_name.contains(token, autoescape=True))
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    if related_ids:
        statement = statement.order_by(case((model.id.in_(related_ids), 0), else_=1))
    prefix = case((model.search_name.startswith(query, autoescape=True), 0), else_=1)
    entries = list(
        db.scalars(statement.order_by(prefix, model.search_name, model.id).limit(limit))
    )
    return entries, total


@router.get("")
def search_catalog(
    response: Response,
    kind: Literal["systems", "suppliers"] = "systems",
    q: str = Query(default="", max_length=255),
    system_id: str | None = Query(default=None, max_length=36),
    limit: int = Query(default=12, ge=1, le=30),
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(ACCESS),
) -> dict[str, object]:
    response.headers["Cache-Control"] = "no-store"
    try:
        snapshot = db.scalar(
            select(SystemCatalogImport)
            .order_by(
                SystemCatalogImport.imported_at.desc(), SystemCatalogImport.id.desc()
            )
            .limit(1)
        )
        if not snapshot:
            return {"items": [], "total": 0, "source": None}
        query = normalize_name(q)
        source = {
            "name": snapshot.source_name,
            "imported_at": snapshot.imported_at.isoformat(),
            "system_count": snapshot.system_count,
            "supplier_count": snapshot.party_count,
            "type": "local_import",
        }
        related_ids: set[str] = set()
        if kind == "suppliers" and system_id:
            related_ids = set(
                db.scalars(
                    select(CatalogRelationship.party_id)
                    .join(
                        CatalogSystem, CatalogRelationship.system_id == CatalogSystem.id
                    )
                    .where(
                        CatalogSystem.id == system_id,
                        CatalogSystem.import_id == snapshot.id,
                    )
                )
            )
        items: list[dict[str, object]]
        if kind == "systems":
            systems, total = _matching_entries(
                db, CatalogSystem, snapshot.id, query, limit
            )
            ids = [entry.id for entry in systems]
            parties: dict[str, list[dict[str, str]]] = {
                entry_id: [] for entry_id in ids
            }
            if ids:
                rows = db.execute(
                    select(CatalogRelationship, CatalogParty)
                    .join(CatalogParty, CatalogRelationship.party_id == CatalogParty.id)
                    .where(CatalogRelationship.system_id.in_(ids))
                    .order_by(CatalogRelationship.role, CatalogParty.search_name)
                )
                for relation, party in rows:
                    parties[relation.system_id].append(
                        {
                            "id": party.id,
                            "name": party.name,
                            "role": relation.role,
                            "role_label": ROLE_LABELS[relation.role],
                        }
                    )
            items = [
                {
                    "id": entry.id,
                    "source_id": entry.source_id,
                    "name": entry.name,
                    "available": entry.available,
                    "parties": parties[entry.id],
                }
                for entry in systems
            ]
        else:
            suppliers, total = _matching_entries(
                db, CatalogParty, snapshot.id, query, limit, related_ids
            )
            ids = [entry.id for entry in suppliers]
            roles: dict[str, set[str]] = {entry_id: set() for entry_id in ids}
            if ids:
                for party_id, role in db.execute(
                    select(CatalogRelationship.party_id, CatalogRelationship.role)
                    .where(CatalogRelationship.party_id.in_(ids))
                    .distinct()
                ):
                    roles[party_id].add(role)
            items = [
                {
                    "id": entry.id,
                    "name": entry.name,
                    "roles": sorted(roles[entry.id]),
                    "role_labels": [
                        ROLE_LABELS[role] for role in sorted(roles[entry.id])
                    ],
                    "related_to_system": entry.id in related_ids,
                }
                for entry in suppliers
            ]
        return {"items": items, "total": total, "source": source}
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            503,
            "Systemkataloget kan ikke hentes lige nu. Du kan stadig skrive navnet manuelt.",
        ) from None
