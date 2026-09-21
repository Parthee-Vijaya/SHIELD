from __future__ import annotations

import pytest
from fastapi import HTTPException

from src.auth.entra import (
    UserPrincipal,
    authorize_case_transition,
    get_auth_settings,
)


@pytest.fixture(autouse=True)
def clear_auth_settings_cache():
    get_auth_settings.cache_clear()
    yield
    get_auth_settings.cache_clear()


def test_development_mode_is_explicit_and_role_scoped(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("AUTH_MODE", "development")
    monkeypatch.setenv("DEV_AUTH_ROLES", "Hammeren.Sagsbehandler")
    settings = get_auth_settings()
    assert settings.mode == "development"
    assert settings.development_roles == ("Hammeren.Sagsbehandler",)


def test_production_rejects_development_identity(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_MODE", "development")
    with pytest.raises(RuntimeError, match="Produktion kræver"):
        get_auth_settings()


def test_entra_mode_requires_complete_configuration(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_MODE", "entra")
    monkeypatch.delenv("ENTRA_TENANT_ID", raising=False)
    monkeypatch.delenv("ENTRA_API_AUDIENCE", raising=False)
    with pytest.raises(RuntimeError, match="ENTRA_TENANT_ID"):
        get_auth_settings()


def test_only_approval_roles_can_approve():
    worker = UserPrincipal(
        oid="1",
        name="Sagsbehandler",
        roles=["Hammeren.Sagsbehandler"],
        auth_mode="development",
        identity_assurance="development_only",
    )
    with pytest.raises(HTTPException) as exc:
        authorize_case_transition(worker, "godkendt")
    assert exc.value.status_code == 403

    approver = worker.model_copy(update={"roles": ["Hammeren.Godkender"]})
    authorize_case_transition(approver, "godkendt")
