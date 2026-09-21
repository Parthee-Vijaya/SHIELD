from datetime import datetime, timezone
from unittest.mock import Mock

from starlette.requests import Request

import main
from src.auth.entra import get_auth_settings, get_current_user


def _case() -> main.AICase:
    return main.AICase(
        id="publication-defaults-case",
        title="Intern AI-assistent",
        description="Afgrænset kommunal vurdering af en intern AI-assistent.",
        created_at=datetime(2026, 9, 21, tzinfo=timezone.utc),
        email_status="skipped",
    )


def test_case_email_skips_smtp_when_recipient_is_not_configured(monkeypatch):
    monkeypatch.delenv("AI_CASES_RECIPIENT", raising=False)
    monkeypatch.delenv("AI_CASES_CC", raising=False)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.invalid")
    smtp = Mock(side_effect=AssertionError("SMTP must not be contacted"))
    monkeypatch.setattr(main.smtplib, "SMTP", smtp)

    assert main._send_case_email_sync(_case()) == "skipped"
    smtp.assert_not_called()


def test_case_email_skips_smtp_when_server_is_not_configured(monkeypatch):
    monkeypatch.setenv("AI_CASES_RECIPIENT", "caseworker@example.invalid")
    monkeypatch.delenv("AI_CASES_CC", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    smtp = Mock(side_effect=AssertionError("SMTP must not be contacted"))
    monkeypatch.setattr(main.smtplib, "SMTP", smtp)

    assert main._send_case_email_sync(_case()) == "skipped"
    smtp.assert_not_called()


def test_development_identity_defaults_to_a_generic_local_user(monkeypatch):
    for name in ("APP_ENV", "AUTH_MODE", "DEV_AUTH_USER", "DEV_AUTH_ROLES"):
        monkeypatch.delenv(name, raising=False)
    get_auth_settings.cache_clear()
    try:
        principal = get_current_user(Request({"type": "http"}), credentials=None)
        assert principal.name == "Lokal bruger"
        assert principal.oid == "development-local-user"
        assert principal.username == "local@development.invalid"
        assert principal.auth_mode == "development"
        assert principal.identity_assurance == "development_only"
    finally:
        get_auth_settings.cache_clear()
