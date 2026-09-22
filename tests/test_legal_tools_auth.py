"""Legal AI tools require API roles before any model/search work begins."""

import asyncio
import inspect
import json

import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

import main
from src.auth import UserPrincipal
from src.auth import entra
import src.law
import src.research.web_searcher as research


@pytest.fixture
def legal_api(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_MODE", "entra")
    monkeypatch.setenv("ENTRA_TENANT_ID", "synthetic-tenant")
    monkeypatch.setenv("ENTRA_API_AUDIENCE", "synthetic-api")
    entra.get_auth_settings.cache_clear()
    monkeypatch.setattr(main.app, "dependency_overrides", {})
    monkeypatch.setattr(main.limiter, "enabled", False)
    calls = []

    def verify(token, _settings):
        if token not in {"synthetic-member", "synthetic-no-role", "synthetic-admin"}:
            raise HTTPException(401, "Invalid synthetic token")
        return UserPrincipal(
            oid="synthetic-user",
            name="Verified user",
            roles=(
                ["Hammeren.Admin"]
                if token == "synthetic-admin"
                else (["Hammeren.Sagsbehandler"] if token == "synthetic-member" else [])
            ),
            auth_mode="entra",
            identity_assurance="verified_entra_token",
        )

    monkeypatch.setattr(entra, "_verify_entra_token", verify)

    class Searcher:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

        async def research_topic(self, **kwargs):
            calls.append("research")
            if kwargs.get("progress_callback"):
                await kwargs["progress_callback"]("Synthetic progress", "searching", 25)
            return {"sources": [], "summary": "Synthetic result"}

    class Assistant:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

        async def ask(self, **kwargs):
            calls.append("law")
            return {"answer": "Synthetic answer", "sources": []}

        async def ask_stream(self, **kwargs):
            calls.append("law")
            yield {"event": "retrieval", "sources": []}
            yield {"event": "delta", "text": "Synthetic "}
            yield {"event": "final", "answer": "Synthetic answer"}

    monkeypatch.setattr(research, "WebSearcher", Searcher)
    monkeypatch.setattr(src.law, "LawAssistant", Assistant)
    yield TestClient(main.app, raise_server_exceptions=False), calls
    entra.get_auth_settings.cache_clear()


REQUESTS = [
    (
        "POST",
        "/api/research/juridisk",
        {"json": {"emne": "Synthetic GDPR", "fokusområder": ["GDPR"]}},
    ),
    (
        "GET",
        "/api/research/juridisk/stream",
        {"params": {"emne": "Synthetic GDPR", "focus_areas": "GDPR"}},
    ),
    ("POST", "/api/law/ask", {"json": {"query": "Synthetic GDPR"}}),
    ("POST", "/api/law/ask/stream", {"json": {"query": "Synthetic GDPR"}}),
]


@pytest.mark.parametrize("method,path,options", REQUESTS)
@pytest.mark.parametrize(
    "headers,status",
    [
        ({}, 401),
        ({"X-User": "Administrator"}, 401),
        ({"Authorization": "Bearer synthetic-invalid"}, 401),
        ({"Authorization": "Bearer synthetic-no-role"}, 403),
    ],
)
def test_legal_tools_reject_before_starting_work(
    legal_api, method, path, options, headers, status
):
    client, calls = legal_api
    response = client.request(method, path, headers=headers, **options)
    assert response.status_code == status, response.text
    assert calls == []


@pytest.mark.parametrize("method,path,options", REQUESTS)
def test_authorized_tools_keep_json_or_streaming_contract(
    legal_api, method, path, options
):
    client, calls = legal_api
    response = client.request(
        method, path, headers={"Authorization": "Bearer synthetic-member"}, **options
    )
    assert response.status_code == 200, response.text
    assert len(calls) == 1
    if path.endswith("/stream"):
        assert response.headers["content-type"].startswith("text/event-stream")
        events = [
            json.loads(line[5:].strip())
            for line in response.text.splitlines()
            if line.startswith("data:")
        ]
        if "/research/" in path:
            assert events[0]["progress"] == 25
            assert events[-1]["status"] == "complete"
        else:
            assert [event["event"] for event in events] == [
                "retrieval",
                "delta",
                "final",
            ]
    else:
        assert response.json()["success"] is True


def test_research_disconnect_cancels_background_work(monkeypatch):
    async def scenario():
        stopped = asyncio.Event()

        class Searcher:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                pass

            async def research_topic(self, **kwargs):
                try:
                    await kwargs["progress_callback"]("Working", "searching", 25)
                    await asyncio.Event().wait()
                finally:
                    stopped.set()

        monkeypatch.setattr(research, "WebSearcher", Searcher)
        handler = inspect.unwrap(main.juridisk_research_stream)
        response = await handler(
            request=Request(
                {
                    "type": "http",
                    "method": "GET",
                    "path": "/api/research/juridisk/stream",
                    "headers": [],
                }
            ),
            emne="Synthetic GDPR",
            focus_areas=["GDPR"],
            _user=UserPrincipal(
                oid="user",
                name="Synthetic",
                roles=["Hammeren.Sagsbehandler"],
                auth_mode="development",
                identity_assurance="development_only",
            ),
        )
        iterator = response.body_iterator
        first = await asyncio.wait_for(anext(iterator), timeout=1)
        assert '"progress": 25' in first
        await asyncio.wait_for(iterator.aclose(), timeout=1)
        assert stopped.is_set()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "path",
    [
        "/api/law/rag/build",
        "/api/v3/admin/backups/run",
        "/api/compliance/test-llm",
        "/api/ai/diagnose-issue",
        "/api/knowledge-base/update",
    ],
)
@pytest.mark.parametrize(
    "headers,status",
    [
        ({}, 401),
        ({"X-User": "Administrator"}, 401),
        ({"Authorization": "Bearer synthetic-member"}, 403),
    ],
)
def test_admin_model_and_maintenance_jobs_reject_non_admins(
    legal_api, path, headers, status
):
    client, calls = legal_api
    response = client.post(path, headers=headers, json={})
    assert response.status_code == status, response.text
    assert calls == []


def test_admin_can_rebuild_law_index_without_invoking_a_real_embedding_model(
    legal_api, monkeypatch
):
    from types import SimpleNamespace
    import src.services.law_rag as rag

    builds = []

    def build():
        builds.append("rebuilt")
        return {"chunks": 3}

    monkeypatch.setattr(rag, "get_default_index", lambda: SimpleNamespace(build=build))
    client, _ = legal_api
    response = client.post(
        "/api/law/rag/build", headers={"Authorization": "Bearer synthetic-admin"}
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "chunks": 3}
    assert builds == ["rebuilt"]


def test_retired_upload_cannot_write_a_client_controlled_filename(
    legal_api, monkeypatch
):
    from unittest.mock import Mock

    filesystem_write = Mock(side_effect=AssertionError("No legacy filesystem writes"))
    monkeypatch.setattr(main, "open", filesystem_write, raising=False)
    client, _ = legal_api
    response = client.post(
        "/api/documents/upload",
        files={"file": ("../../synthetic-outside-file", b"synthetic")},
        headers={"Authorization": "Bearer synthetic-member"},
    )
    assert response.status_code == 410, response.text
    assert "dokumentbanken" in response.json()["detail"]
    filesystem_write.assert_not_called()
    assert (
        client.post(
            "/api/documents/upload",
            files={"file": ("../../synthetic-outside-file", b"synthetic")},
        ).status_code
        == 401
    )


LEGACY_CASE_ROUTES = [
    ("GET", "/api/ai-cases"),
    ("POST", "/api/ai-cases"),
    ("POST", "/api/news/llm-search"),
    ("POST", "/api/law/search"),
    ("POST", "/api/compliance/analyser"),
    ("POST", "/api/compliance/hurtig-tjek"),
    ("POST", "/api/compliance/7-punkts-vurdering"),
    ("POST", "/api/compliance/report/synthetic/generate"),
    ("POST", "/api/v3/compare"),
    ("GET", "/api/compliance/progress/synthetic"),
    ("GET", "/api/compliance/intermediate/synthetic"),
    ("GET", "/api/compliance/assessment/synthetic"),
    ("GET", "/api/compliance/assessments"),
    ("GET", "/api/v3/admin/ops-summary"),
]


@pytest.mark.parametrize("method,path", LEGACY_CASE_ROUTES)
@pytest.mark.parametrize(
    "headers,status", [({}, 401), ({"Authorization": "Bearer synthetic-no-role"}, 403)]
)
def test_legacy_case_and_model_routes_require_membership(
    legal_api, method, path, headers, status
):
    client, calls = legal_api
    response = client.request(method, path, headers=headers, json={})
    assert response.status_code == status, response.text
    assert calls == []


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/compliance/test-search"),
        ("POST", "/api/news/refresh"),
        ("POST", "/api/eu-ai-act-checker/refresh"),
        ("POST", "/api/ai-projects/refresh"),
        ("GET", "/api/v3/admin/config"),
        ("GET", "/api/v3/admin/backups"),
        ("GET", "/api/v3/admin/errors"),
    ],
)
@pytest.mark.parametrize(
    "headers,status", [({}, 401), ({"Authorization": "Bearer synthetic-member"}, 403)]
)
def test_maintenance_and_private_diagnostics_require_admin(
    legal_api, method, path, headers, status
):
    client, calls = legal_api
    response = client.request(method, path, headers=headers, json={})
    assert response.status_code == status, response.text
    assert calls == []


def test_member_can_read_legacy_cases_without_reading_the_live_store(
    legal_api, monkeypatch
):
    async def load_cases():
        return [
            {
                "id": "synthetic-id",
                "title": "Synthetic municipal case",
                "description": "Synthetic description",
                "created_at": "2026-09-22T00:00:00Z",
                "email_status": "skipped",
            }
        ]

    monkeypatch.setattr(main, "_load_ai_cases", load_cases)
    client, _ = legal_api
    response = client.get(
        "/api/ai-cases", headers={"Authorization": "Bearer synthetic-member"}
    )
    assert response.status_code == 200, response.text
    assert response.json()[0]["title"] == "Synthetic municipal case"


@pytest.mark.parametrize("path", ["/api/news/latest", "/api/news/ticker"])
@pytest.mark.parametrize(
    "headers,status",
    [
        ({}, 401),
        ({"X-User": "Administrator"}, 401),
        ({"Authorization": "Bearer synthetic-member"}, 403),
    ],
)
def test_public_news_cannot_bypass_refresh_admin_gate(
    legal_api, monkeypatch, path, headers, status
):
    from unittest.mock import AsyncMock

    refresh = AsyncMock(side_effect=AssertionError("Must authorize before refreshing"))
    monkeypatch.setattr(main.news_service, "get_latest_news", refresh)
    monkeypatch.setattr(main, "_build_ticker_payload", refresh)
    client, _ = legal_api
    response = client.get(path, params={"force_refresh": "true"}, headers=headers)
    assert response.status_code == status, response.text
    refresh.assert_not_called()


@pytest.mark.parametrize("path", ["/api/news/latest", "/api/news/ticker"])
def test_public_cached_news_and_authorized_refresh_are_preserved(
    legal_api, monkeypatch, path
):
    from unittest.mock import AsyncMock

    payload = {"items": [], "cache_ttl_seconds": 900}
    service = AsyncMock(return_value=payload)
    monkeypatch.setattr(main.news_service, "get_latest_news", service)
    monkeypatch.setattr(main, "_build_ticker_payload", service)
    client, _ = legal_api
    response = client.get(path)
    assert response.status_code == 200, response.text
    assert service.call_args.kwargs["force_refresh"] is False
    response = client.get(
        path,
        params={"force_refresh": "true"},
        headers={"Authorization": "Bearer synthetic-admin"},
    )
    assert response.status_code == 200, response.text
    assert service.call_args.kwargs["force_refresh"] is True
