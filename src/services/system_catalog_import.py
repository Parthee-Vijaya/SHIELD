"""Allowlisted, transactional import of a municipal system-catalog workbook."""

from __future__ import annotations

import hashlib
import io
import re
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import TypedDict
from uuid import UUID, uuid4
from xml.etree import ElementTree as ET

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database.system_catalog import (
    CatalogParty,
    CatalogRelationship,
    CatalogSystem,
    SystemCatalogImport,
)

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REQUIRED = {"IT systemnavn", "UUID", "Rettighedshaver", "Status"}
ALLOWED = REQUIRED | {"DBS Databehandler"}
DANISH_TRANSLITERATION: dict[str, str | int | None] = {"æ": "ae", "ø": "o", "å": "a"}


class CatalogPartyInput(TypedDict):
    name: str
    role: str


class CatalogSystemInput(TypedDict):
    source_id: str
    name: str
    available: bool
    parties: list[CatalogPartyInput]


class CatalogImportInput(TypedDict):
    source_name: str
    source_sheet: str
    source_sha256: str
    entries: list[CatalogSystemInput]


def normalize_name(value: str) -> str:
    """Case, accents and common Danish keyboard transliterations are equivalent."""
    value = value.casefold().translate(str.maketrans(DANISH_TRANSLITERATION))
    value = "".join(
        c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)
    )
    return " ".join(re.sub(r"[^\w]+", " ", value).split())


def party_name(value: str) -> str:
    # KITOS exports append the CVR number to rights holders. The intake only
    # needs the organisation name; never conflate the number with a contact.
    return re.sub(r"\s*\(\d{8}\)\s*$", "", value).strip()


def _cell_text(cell: ET.Element, strings: list[str]) -> str:
    if cell.attrib.get("t") == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//s:t", NS)).strip()
    value = cell.find("s:v", NS)
    text = value.text or "" if value is not None else ""
    if cell.attrib.get("t") == "s":
        try:
            return strings[int(text)].strip()
        except (ValueError, IndexError):
            raise ValueError("Katalogets teksthenvisninger er ugyldige.") from None
    return text.strip()


def read_catalog_workbook(path: Path) -> CatalogImportInput:
    """Read only catalog names/relationships. The source workbook is never edited."""
    if path.suffix.lower() != ".xlsx" or path.stat().st_size > 50 * 1024 * 1024:
        raise ValueError("Kataloget skal være en XLSX-fil på højst 50 MB.")
    raw = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if sum(item.file_size for item in archive.infolist()) > 200 * 1024 * 1024:
            raise ValueError("Katalogets udpakkede indhold er for stort.")
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [
                "".join(t.text or "" for t in item.findall(".//s:t", NS))
                for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))
            ]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"] for item in relations}
        for sheet in workbook.findall("s:sheets/s:sheet", NS):
            target = targets[
                sheet.attrib[
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                ]
            ]
            sheet_path = (
                target.lstrip("/")
                if target.startswith("/")
                else str(PurePosixPath("xl") / target)
            )
            root = ET.fromstring(archive.read(sheet_path))
            rows = root.findall("s:sheetData/s:row", NS)
            if not rows:
                continue
            headers = {
                re.sub(r"\d", "", c.attrib["r"]): _cell_text(c, strings)
                for c in rows[0]
            }
            if not REQUIRED.issubset(set(headers.values())):
                continue
            selected = {
                column: name for column, name in headers.items() if name in ALLOWED
            }
            entries: list[CatalogSystemInput] = []
            seen: set[str] = set()
            for row in rows[1:]:
                values = {
                    selected[column]: _cell_text(cell, strings)
                    for cell in row
                    if (column := re.sub(r"\d", "", cell.attrib["r"])) in selected
                }
                if not any(values.values()):
                    continue
                name = values.get("IT systemnavn", "")
                try:
                    source_id = str(UUID(values.get("UUID", "")))
                except ValueError:
                    raise ValueError(
                        f"Række {row.attrib.get('r', '?')} mangler et gyldigt system-UUID."
                    ) from None
                if not name or len(name) > 255 or source_id in seen:
                    raise ValueError(
                        f"Række {row.attrib.get('r', '?')} har ugyldigt navn eller gentaget UUID."
                    )
                status = values.get("Status", "")
                if status not in {"Tilgængelig", "Ikke tilgængelig"}:
                    raise ValueError(
                        f"Række {row.attrib.get('r', '?')} har ukendt tilgængelighed."
                    )
                parties: list[CatalogPartyInput] = []
                for column, role in [
                    ("Rettighedshaver", "rights_holder"),
                    ("DBS Databehandler", "data_processor"),
                ]:
                    candidate = party_name(values.get(column, ""))
                    if len(candidate) > 500:
                        raise ValueError(
                            f"Række {row.attrib.get('r', '?')} har et for langt organisationsnavn."
                        )
                    if candidate:
                        parties.append({"name": candidate, "role": role})
                entries.append(
                    {
                        "source_id": source_id,
                        "name": name,
                        "available": status == "Tilgængelig",
                        "parties": parties,
                    }
                )
                seen.add(source_id)
            if not entries:
                raise ValueError("Kataloget indeholder ingen systemer.")
            return {
                "source_name": path.name,
                "source_sheet": sheet.attrib["name"],
                "source_sha256": hashlib.sha256(raw).hexdigest(),
                "entries": entries,
            }
    raise ValueError("Arket mangler IT systemnavn, UUID, Rettighedshaver eller Status.")


def import_catalog(
    db: Session, catalog: CatalogImportInput
) -> tuple[SystemCatalogImport, bool]:
    """Append a snapshot atomically. Reimporting identical bytes changes nothing.

    The caller owns commit/rollback. Existing case profiles and old snapshots
    are never rewritten, and failed imports cannot become the active snapshot.
    """
    existing = db.scalar(
        select(SystemCatalogImport).where(
            SystemCatalogImport.source_sha256 == catalog["source_sha256"]
        )
    )
    if existing:
        return existing, False
    parties: dict[str, str] = {}
    for entry in catalog["entries"]:
        for party in entry["parties"]:
            parties.setdefault(party["name"].casefold(), party["name"])
    snapshot = SystemCatalogImport(
        id=str(uuid4()),
        source_name=catalog["source_name"],
        source_sheet=catalog["source_sheet"],
        source_sha256=catalog["source_sha256"],
        system_count=len(catalog["entries"]),
        party_count=len(parties),
    )
    db.add(snapshot)
    db.flush()
    ids: dict[str, str] = {}
    for key, name in parties.items():
        ids[key] = str(uuid4())
        db.add(
            CatalogParty(
                id=ids[key],
                import_id=snapshot.id,
                name=name,
                search_name=normalize_name(name),
            )
        )
    systems: list[tuple[CatalogSystem, CatalogSystemInput]] = []
    for entry in catalog["entries"]:
        system = CatalogSystem(
            id=str(uuid4()),
            import_id=snapshot.id,
            source_id=entry["source_id"],
            name=entry["name"],
            search_name=normalize_name(entry["name"]),
            available=entry["available"],
        )
        db.add(system)
        systems.append((system, entry))
    db.flush()
    for system, entry in systems:
        for party in entry["parties"]:
            db.add(
                CatalogRelationship(
                    system_id=system.id,
                    party_id=ids[party["name"].casefold()],
                    role=party["role"],
                )
            )
    db.flush()
    return snapshot, True
