from __future__ import annotations

import os
from pathlib import Path
import tempfile
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


# Configure an isolated file-backed database before importing main/connection.
# A file DB lets readiness open a second connection and see the same schema.
_DB_PATH = Path(tempfile.gettempdir()) / f"judge-dredd-dpia-api-{uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ["API_RELOAD"] = "false"
os.environ["CORS_ALLOWED_ORIGINS"] = "http://localhost,http://127.0.0.1"

import main  # noqa: E402
import src.database.connection as database_connection  # noqa: E402
from src.database.connection import Base  # noqa: E402
from src.services.legal_basis_verifier import (  # noqa: E402
    LegalBasisVerificationResponse,
    LegalCitationReceipt,
)
from tests.test_dpia_assessment import valid_payload  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def database_schema():
    test_engine = create_engine(f"sqlite:///{_DB_PATH}")
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(test_engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    original_engine = database_connection.engine
    database_connection.engine = test_engine
    main.app.dependency_overrides[main.get_db] = override_get_db
    yield
    main.app.dependency_overrides.clear()
    database_connection.engine = original_engine
    test_engine.dispose()
    _DB_PATH.unlink(missing_ok=True)


@pytest.fixture(scope="module")
def client():
    # Deliberately avoid the lifespan context: these endpoint tests do not need
    # news fetches or schedulers, only the route/middleware/database contract.
    return TestClient(main.app)


def test_create_detail_list_and_export_contract(client: TestClient, monkeypatch):
    checked_at = main.datetime(2026, 8, 31, 12, 0, tzinfo=main.UTC)
    verified = LegalBasisVerificationResponse(
        status="verified_sources",
        status_label="Officielle kildetekster verificeret",
        checked_at=checked_at,
        selected_basis="public_task",
        specific_reference="Servicelovens § 11",
        conclusion="Kildetekster verificeret; relevans kræver juridisk review.",
        receipts=[LegalCitationReceipt(
            citation_id="gdpr.art6.e",
            law="Databeskyttelsesforordningen (GDPR)",
            provision="Artikel 6, stk. 1, litra e",
            authority="EUR-Lex",
            official_url="https://eur-lex.europa.eu/eli/reg/2016/679/oj/dan",
            match_status="verified_exact",
            checked_at=checked_at,
            fetched_at=checked_at,
            source_sha256="a" * 64,
            http_status=200,
            message="Eksakt verificeret.",
        )],
    )
    monkeypatch.setattr(main, "verify_legal_basis", lambda _request: verified)
    created = client.post("/api/dpia/assessments", json=valid_payload(vulnerable_subjects=False))
    assert created.status_code == 201, created.text
    result = created.json()
    assert result["status"] == "ready_for_review"
    assert len(result["sections"]) == 39
    assert len(result["risks"]) == 33
    assert result["legal_verification"]["status"] == "verified_sources"

    detail = client.get(f"/api/dpia/assessments/{result['id']}")
    assert detail.status_code == 200
    assert detail.json() == result

    listing = client.get("/api/dpia/assessments?limit=10&offset=0")
    assert listing.status_code == 200
    assert listing.json()["count"] == 1
    assert listing.json()["items"][0]["id"] == result["id"]

    exported = client.get(f"/api/dpia/assessments/{result['id']}/export.xlsx")
    assert exported.status_code == 200
    assert exported.content.startswith(b"PK")
    assert exported.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "attachment" in exported.headers["content-disposition"]


def test_api_validation_readiness_and_not_found_are_fail_closed(client: TestClient):
    invalid = valid_payload()
    invalid.pop("purpose")
    response = client.post("/api/dpia/assessments", json=invalid)
    assert response.status_code == 422
    assert client.get(f"/api/dpia/assessments/{uuid4()}").status_code == 404
    ready = client.get("/readyz")
    assert ready.status_code == 200
    assert ready.json()["checks"] == {
        "database": "ok", "dpia_storage": "ok", "dpia_template": "ok"
    }


def test_cors_allows_localhost_and_rejects_untrusted_origin(client: TestClient):
    headers = {
        "Origin": "http://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    allowed = client.options("/api/dpia/assessments", headers=headers)
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost"

    rejected = client.options(
        "/api/dpia/assessments",
        headers={**headers, "Origin": "https://evil.example"},
    )
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_v3_empty_input_is_rejected_instead_of_returning_go(client: TestClient):
    response = client.post(
        "/api/v3/assess",
        json={"signals": {}, "predicates": {}, "use_llm_extraction": False},
    )
    assert response.status_code == 422
    assert "signal" in response.json()["detail"].lower()


def test_manual_freshness_endpoint_returns_a_response_for_rate_limit_headers(
    client: TestClient,
    monkeypatch,
):
    monkeypatch.setattr(main, "_v3_run_citation_verifier", lambda: None)

    async def fake_freshness():
        return {"count": 0, "checked_at": "2026-08-31T12:00:00Z", "items": []}

    monkeypatch.setattr(main, "v3_law_freshness", fake_freshness)
    response = client.post("/api/v3/law/freshness/run", json={})
    assert response.status_code == 200
    assert response.json()["items"] == []
