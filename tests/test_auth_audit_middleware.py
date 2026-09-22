"""Authentication/technical-audit contract without model calls or live DB writes."""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import main
from src.auth import UserPrincipal, get_current_user, require_roles
from src.auth import entra


@pytest.fixture(autouse=True)
def auth_settings(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("AUTH_MODE", "development")
    monkeypatch.setenv("DEV_AUTH_USER", "Parthee")
    monkeypatch.setenv("DEV_AUTH_ROLES", "Hammeren.Sagsbehandler")
    entra.get_auth_settings.cache_clear()
    yield
    entra.get_auth_settings.cache_clear()


@pytest.fixture
def audit_api(monkeypatch):
    records = []
    monkeypatch.setattr(main, "record_error", lambda **record: records.append(record))
    app = FastAPI()
    app.middleware("http")(main._track_http_metrics)
    app.add_exception_handler(Exception, main._capture_unhandled_exception)

    @app.get("/broken")
    def broken(user: UserPrincipal = Depends(get_current_user)):
        raise RuntimeError("Synthetic audit regression")

    @app.get("/public-broken")
    def public_broken():
        raise RuntimeError("Synthetic unauthenticated failure")

    @app.post("/case-write")
    def write_case(
        user: UserPrincipal = Depends(require_roles("Hammeren.Sagsbehandler")),
    ):
        return {
            "actor": user.name,
            "roles": user.roles,
            "assurance": user.identity_assurance,
        }

    @app.post("/approve")
    def approve(user: UserPrincipal = Depends(require_roles("Hammeren.Godkender"))):
        return {"actor": user.name}

    return TestClient(app, raise_server_exceptions=False), records


def test_local_errors_use_server_name_and_ignore_forged_header(audit_api):
    client, records = audit_api
    response = client.get("/broken", headers={"X-User": "Forged administrator"})
    assert response.status_code == 500
    assert len(records) >= 1
    assert all(record["actor"] == "Parthee" for record in records)


def test_unauthenticated_error_records_an_explicit_unknown_actor(audit_api):
    client, records = audit_api
    response = client.get("/public-broken", headers={"X-User": "Forged administrator"})
    assert response.status_code == 500
    assert records and all(record["actor"] == "Ukendt aktør" for record in records)


def test_arbitrary_request_state_is_not_a_verified_principal():
    request = Request(
        {"type": "http", "state": {"user": {"name": "Forged administrator"}}}
    )
    assert main._verified_request_actor(request) == "Ukendt aktør"


def test_local_mutation_without_identity_header_keeps_server_roles(audit_api):
    client, _ = audit_api
    response = client.post("/case-write", json={"name": "Ignored client name"})
    assert response.status_code == 200
    assert response.json() == {
        "actor": "Parthee",
        "roles": ["Hammeren.Sagsbehandler"],
        "assurance": "development_only",
    }
    assert client.post("/approve", headers={"X-User": "Godkender"}).status_code == 403


def test_entra_request_preserves_verified_identity_and_role_enforcement(
    audit_api, monkeypatch
):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_MODE", "entra")
    monkeypatch.setenv("ENTRA_TENANT_ID", "synthetic-tenant")
    monkeypatch.setenv("ENTRA_API_AUDIENCE", "synthetic-audience")
    entra.get_auth_settings.cache_clear()
    principal = UserPrincipal(
        oid="synthetic-user",
        name="Verified municipal user",
        roles=["Hammeren.Sagsbehandler"],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )

    def verify(token, _settings):
        if token != "synthetic-valid-token":
            raise HTTPException(401, "Invalid synthetic token")
        return principal

    monkeypatch.setattr(entra, "_verify_entra_token", verify)
    client, records = audit_api
    # The client now sends only the bearer token, never an asserted X-User.
    headers = {"Authorization": "Bearer synthetic-valid-token"}
    response = client.post("/case-write", headers=headers)
    assert response.status_code == 200
    assert response.json()["actor"] == "Verified municipal user"
    assert response.json()["assurance"] == "verified_entra_token"
    assert client.post("/approve", headers=headers).status_code == 403
    assert (
        client.post("/case-write", headers={"X-User": "Godkender"}).status_code == 401
    )
    assert (
        client.post(
            "/case-write", headers={"Authorization": "Bearer synthetic-invalid-token"}
        ).status_code
        == 401
    )
    assert (
        client.get(
            "/broken", headers={**headers, "X-User": "Forged administrator"}
        ).status_code
        == 500
    )
    assert records and all(
        record["actor"] == "Verified municipal user" for record in records
    )
