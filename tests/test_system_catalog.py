"""Catalog import minimises personal data and preserves source relationships."""

import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from src.api.system_catalog import router
from src.auth import UserPrincipal, get_current_user
from src.database.connection import Base, get_db
from src.database.system_catalog import (
    CATALOG_TABLES,
    CatalogParty,
    CatalogRelationship,
    CatalogSystem,
    SystemCatalogImport,
)
from src.services.system_catalog_import import import_catalog, read_catalog_workbook


def workbook(path: Path, *, duplicate=False, missing=False):
    headers = [
        "IT systemnavn",
        "UUID",
        "Rettighedshaver",
        "Status",
        "DBS Databehandler",
        "Sidst redigeret: Bruger",
        "Beskrivelse",
    ]
    rows = [
        headers,
        [
            "Ældre Økonomi",
            "11111111-1111-4111-8111-111111111111",
            "Århus Software A/S (12345678)",
            "Tilgængelig",
            "Århus Software A/S",
            "PRIVATE PERSON",
            "PRIVATE DETAILS",
        ],
        [
            "Dokumentværktøj",
            "22222222-2222-4222-8222-222222222222",
            "Anden organisation",
            "Ikke tilgængelig",
            "En anden databehandler",
            "PRIVATE EMAIL",
            "PRIVATE PHONE",
        ],
    ]
    if duplicate:
        rows.append(rows[1])
    if missing:
        rows[0][1] = "Other"
    body = "".join(
        '<row r="%s">%s</row>'
        % (
            index,
            "".join(
                f'<c r="{chr(65+column)}{index}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
                for column, value in enumerate(row)
            ),
        )
        for index, row in enumerate(rows, 1)
    )
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Systemer" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{body}</sheetData></worksheet>',
        )
    return path


@pytest.fixture
def database(tmp_path):
    engine = create_engine(f'sqlite:///{tmp_path / "catalog.db"}')
    Base.metadata.create_all(engine, tables=CATALOG_TABLES)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    yield sessions
    engine.dispose()


@pytest.fixture
def api(database, tmp_path):
    catalog = read_catalog_workbook(workbook(tmp_path / "catalog.xlsx"))
    with database.begin() as db:
        import_catalog(db, catalog)
    app = FastAPI()
    app.include_router(router)
    identity = {"roles": ["Hammeren.Sagsbehandler"]}

    def session():
        with database() as db:
            yield db

    app.dependency_overrides[get_db] = session
    app.dependency_overrides[get_current_user] = lambda: UserPrincipal(
        oid="synthetic",
        name="Test",
        roles=identity["roles"],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )
    with TestClient(app) as client:
        yield client, identity


def test_extraction_only_keeps_allowlisted_data_without_changing_source(tmp_path):
    path = workbook(tmp_path / "catalog.xlsx")
    before = path.read_bytes()
    data = read_catalog_workbook(path)
    assert path.read_bytes() == before
    assert len(data["entries"]) == 2
    assert "PRIVATE" not in str(data)
    assert "12345678" not in str(data)
    assert data["entries"][0]["parties"] == [
        {"name": "Århus Software A/S", "role": "rights_holder"},
        {"name": "Århus Software A/S", "role": "data_processor"},
    ]
    assert data["entries"][1]["available"] is False


@pytest.mark.parametrize("options", [{"duplicate": True}, {"missing": True}])
def test_invalid_source_is_rejected_before_import(tmp_path, options):
    with pytest.raises(ValueError):
        read_catalog_workbook(workbook(tmp_path / "invalid.xlsx", **options))


def test_reimport_is_idempotent_and_roles_are_not_conflated(database, tmp_path):
    data = read_catalog_workbook(workbook(tmp_path / "catalog.xlsx"))
    with database.begin() as db:
        first, created = import_catalog(db, data)
        assert created
        timestamp, snapshot_id = first.imported_at, first.id
    with database.begin() as db:
        again, created = import_catalog(db, data)
        assert not created
        assert again.id == snapshot_id
        assert again.imported_at.replace(tzinfo=None) == timestamp.replace(tzinfo=None)
        assert db.query(SystemCatalogImport).count() == 1
        assert db.query(CatalogSystem).count() == 2
        assert db.query(CatalogParty).count() == 3
        assert db.query(CatalogRelationship).count() == 4
        # Rights holder and processor differ on the second system and stay so.
        rows = db.execute(
            select(CatalogParty.name, CatalogRelationship.role)
            .join(CatalogRelationship, CatalogRelationship.party_id == CatalogParty.id)
            .join(CatalogSystem, CatalogSystem.id == CatalogRelationship.system_id)
            .where(CatalogSystem.name == "Dokumentværktøj")
        ).all()
        assert set(rows) == {
            ("Anden organisation", "rights_holder"),
            ("En anden databehandler", "data_processor"),
        }


def test_failed_import_transaction_leaves_current_catalog_untouched(database, tmp_path):
    data = read_catalog_workbook(workbook(tmp_path / "catalog.xlsx"))
    with database.begin() as db:
        import_catalog(db, data)
    with pytest.raises(RuntimeError):
        with database.begin() as db:
            import_catalog(db, {**data, "source_sha256": "a" * 64})
            raise RuntimeError("interrupted before commit")
    with database() as db:
        assert db.query(SystemCatalogImport).count() == 1
        assert db.query(CatalogSystem).count() == 2


def test_danish_search_shows_provenance_and_relationships(api):
    client, _ = api
    response = client.get("/api/system-catalog", params={"q": "AELDRE oKoNoMI"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Ældre Økonomi"
    assert body["items"][0]["source_id"] == "11111111-1111-4111-8111-111111111111"
    assert {party["role"] for party in body["items"][0]["parties"]} == {
        "rights_holder",
        "data_processor",
    }
    assert body["source"]["type"] == "local_import"
    assert body["source"]["system_count"] == 2
    assert "PRIVATE" not in response.text
    assert "12345678" not in response.text


def test_supplier_search_prioritises_relation_but_preserves_manual_choice(api):
    client, _ = api
    system = client.get("/api/system-catalog", params={"q": "ældre"}).json()["items"][0]
    body = client.get(
        "/api/system-catalog", params={"kind": "suppliers", "system_id": system["id"]}
    ).json()
    assert body["items"][0]["name"] == "Århus Software A/S"
    assert body["items"][0]["related_to_system"] is True
    assert len(body["items"]) == 3
    assert (
        client.get(
            "/api/system-catalog", params={"kind": "suppliers", "q": "ARHUS"}
        ).json()["total"]
        == 1
    )
    assert (
        client.get("/api/system-catalog", params={"q": "unknown"}).json()["items"] == []
    )


def test_catalog_requires_authorised_role_and_bounds_search(api):
    client, identity = api
    assert client.get("/api/system-catalog?kind=secrets").status_code == 422
    assert client.get("/api/system-catalog?limit=9999").status_code == 422
    identity["roles"] = []
    assert client.get("/api/system-catalog").status_code == 403
