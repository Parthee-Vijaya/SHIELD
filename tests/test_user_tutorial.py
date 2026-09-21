"""Tutorial progress is durable, idempotent and scoped to verified identity."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import sessionmaker

from src.api.user_tutorial import router
from src.auth import UserPrincipal, get_current_user
from src.database.connection import get_db
from src.database.user_tutorial import (
    UserTutorialState,
    get_tutorial_state,
    save_tutorial_state,
)


def principal(oid="synthetic-user-a", *, roles=None):
    return UserPrincipal(
        oid=oid,
        name="Syntetisk testbruger",
        roles=roles if roles is not None else ["Hammeren.Sagsbehandler"],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )


@pytest.fixture
def database(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'tutorial.db'}", connect_args={"timeout": 10}
    )
    UserTutorialState.__table__.create(engine, checkfirst=True)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    yield sessions
    engine.dispose()


@pytest.fixture
def api(database):
    app = FastAPI()
    app.include_router(router)
    identity = {"user": principal()}

    def session():
        with database() as db:
            yield db

    app.dependency_overrides[get_db] = session
    app.dependency_overrides[get_current_user] = lambda: identity["user"]
    with TestClient(app) as client:
        yield client, identity


def test_fresh_user_defaults_without_creating_a_row(api, database):
    client, _ = api
    response = client.get("/api/user/tutorial")
    assert response.status_code == 200
    assert response.json() == {
        "tutorial_version": 1,
        "status": "not_started",
        "step_id": None,
        "updated_at": None,
    }
    assert response.headers["cache-control"] == "no-store"
    with database() as db:
        assert db.query(UserTutorialState).count() == 0


def test_two_principals_are_isolated_and_new_browser_resumes_same_identity(
    api, database
):
    client, identity = api
    first = client.patch(
        "/api/user/tutorial", json={"status": "in_progress", "step_id": "documents"}
    )
    assert first.status_code == 200, first.text
    assert set(first.json()) == {"tutorial_version", "status", "step_id", "updated_at"}
    assert first.json()["updated_at"].endswith("Z")
    identity["user"] = principal("synthetic-user-b")
    assert client.get("/api/user/tutorial").json()["status"] == "not_started"
    assert (
        client.patch("/api/user/tutorial", json={"status": "dismissed"}).json()[
            "status"
        ]
        == "dismissed"
    )
    identity["user"] = principal()
    with TestClient(client.app) as another_browser:
        assert another_browser.get("/api/user/tutorial").json() == first.json()
        assert (
            another_browser.get("/api/user/tutorial?user_oid=synthetic-user-b").json()
            == first.json()
        )
    with database() as db:
        assert db.query(UserTutorialState).count() == 2


def test_patch_is_idempotent_preserves_omitted_step_and_allows_explicit_restart(
    api, database
):
    client, _ = api
    payload = {"tutorial_version": 1, "status": "in_progress", "step_id": "review"}
    first = client.patch("/api/user/tutorial", json=payload).json()
    assert client.patch("/api/user/tutorial", json=payload).json() == first
    completed = client.patch("/api/user/tutorial", json={"status": "completed"}).json()
    assert completed["status"] == "completed" and completed["step_id"] == "review"
    assert client.get("/api/user/tutorial").json() == completed
    restarted = client.patch(
        "/api/user/tutorial", json={"status": "in_progress", "step_id": "welcome"}
    ).json()
    assert restarted["step_id"] == "welcome"
    reset = client.patch(
        "/api/user/tutorial", json={"status": "not_started", "step_id": None}
    ).json()
    assert reset["step_id"] is None and reset["status"] == "not_started"
    with database() as db:
        assert db.query(UserTutorialState).count() == 1


@pytest.mark.parametrize(
    "invalid",
    [
        {},
        {"status": "approved"},
        {"status": None},
        {"status": "in_progress", "step_id": "other-page"},
        {"status": "in_progress", "step_id": 1},
        {"status": "in_progress", "tutorial_version": 2},
        {"status": "in_progress", "tutorial_version": True},
        {"status": "in_progress", "tutorial_version": "1"},
        {"status": "completed", "user_oid": "another-user"},
        {"status": "completed", "user_id": "another-user"},
        {"status": "completed", "updated_at": "2026-01-01T00:00:00Z"},
    ],
)
def test_invalid_steps_versions_and_client_identities_are_rejected(
    api, database, invalid
):
    client, _ = api
    response = client.patch("/api/user/tutorial", json=invalid)
    assert response.status_code == 422
    with database() as db:
        assert db.query(UserTutorialState).count() == 0


@pytest.mark.parametrize(
    "step",
    ["welcome", "cases", "documents", "assessment", "review", "export", "finish"],
)
def test_all_published_steps_can_be_saved(api, step):
    client, _ = api
    response = client.patch(
        "/api/user/tutorial", json={"status": "in_progress", "step_id": step}
    )
    assert response.status_code == 200
    assert response.json()["step_id"] == step


def test_both_routes_require_authentication_and_case_roles(api, database):
    client, identity = api
    identity["user"] = principal(roles=[])
    assert client.get("/api/user/tutorial").status_code == 403
    assert (
        client.patch("/api/user/tutorial", json={"status": "completed"}).status_code
        == 403
    )

    def unauthenticated():
        raise HTTPException(401, "Authentication required")

    client.app.dependency_overrides[get_current_user] = unauthenticated
    assert client.get("/api/user/tutorial").status_code == 401
    assert (
        client.patch("/api/user/tutorial", json={"status": "completed"}).status_code
        == 401
    )
    with database() as db:
        assert db.query(UserTutorialState).count() == 0


def test_concurrent_first_updates_have_one_durable_row_and_stable_timestamp(database):
    barrier = Barrier(4)

    def save(_):
        with database() as db:
            barrier.wait(timeout=5)
            record = save_tutorial_state(
                db,
                user_oid="concurrent-user",
                status="completed",
                step_id="finish",
                update_step=True,
            )
            db.commit()
            return record.updated_at

    with ThreadPoolExecutor(max_workers=4) as pool:
        timestamps = list(pool.map(save, range(4)))
    assert len(set(timestamps)) == 1
    with database() as db:
        assert db.query(UserTutorialState).count() == 1
        record = get_tutorial_state(db, "concurrent-user")
        assert record.status == "completed" and record.step_id == "finish"


def test_guide_versions_have_separate_rows(database):
    with database() as db:
        first = save_tutorial_state(
            db,
            user_oid="versioned-user",
            status="completed",
            step_id="finish",
            update_step=True,
        )
        second = save_tutorial_state(
            db,
            user_oid="versioned-user",
            status="not_started",
            step_id=None,
            update_step=True,
            tutorial_version=2,
        )
        db.commit()
        assert first.tutorial_version == 1 and second.tutorial_version == 2
        assert get_tutorial_state(db, "versioned-user").status == "completed"


def test_postgresql_uses_atomic_conflict_update_without_overwriting_omitted_step():
    captured = []
    row = UserTutorialState(
        user_oid="postgres-user",
        tutorial_version=1,
        status="completed",
        step_id="review",
        updated_at=datetime.now(UTC),
    )
    db = SimpleNamespace(
        get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name="postgresql")),
        execute=lambda statement: captured.append(statement),
        scalar=lambda statement: row,
    )
    assert (
        save_tutorial_state(
            db,
            user_oid="postgres-user",
            status="completed",
            step_id=None,
            update_step=False,
        )
        is row
    )
    compiled = str(captured[0].compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT (user_oid, tutorial_version) DO UPDATE" in compiled
    assert "step_id = user_tutorial_states.step_id" in compiled
    assert "IS DISTINCT FROM" in compiled


def test_runtime_schema_registration_adds_table_without_replacing_existing_state(
    database,
):
    import main

    assert any(route.path == "/api/user/tutorial" for route in main.app.routes)
    with database() as db:
        save_tutorial_state(
            db, user_oid="kept-user", status="dismissed", step_id=None, update_step=True
        )
        db.commit()
        UserTutorialState.__table__.create(db.get_bind(), checkfirst=True)
        assert (
            db.scalar(
                select(UserTutorialState).where(
                    UserTutorialState.user_oid == "kept-user"
                )
            ).status
            == "dismissed"
        )
