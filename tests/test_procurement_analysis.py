"""No network: extraction validates evidence, preserves history and detects races."""

from copy import deepcopy

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.api import procurement as api
from src.auth import UserPrincipal
from src.database.cases import Case
from src.database.connection import Base, get_db
from src.database.procurement import (
    ProcurementAnalysis,
    ProcurementFactReview,
    ProcurementProfile,
)
from src.services import procurement_analysis as service


PROFILE = {
    "system_name": "Kommunal dokumenthåndtering",
    "supplier_name": "Fiktiv leverandør",
    "organisation": "Kalundborg Kommune",
    "department": "Organisationsstaben",
    "owner": "Systemejer",
    "intended_use": "Dokumenthåndtering til kommunens administrative sagsbehandling.",
    "procurement_stage": "new_purchase",
}
SOURCE = {
    "id": "document:version1:1",
    "title": "Leverandørmateriale",
    "text": "Løsningen er en SaaS-tjeneste. Kundens data hostes i Danmark. De opbevares højst 30 dage.",
    "locator": "Side 1",
    "version": "1",
    "checksum": "abc",
    "document_version_id": "version1",
}
DRAFT = {
    "summary": "Leverandøren oplyser, at tjenesten er SaaS og hostes i Danmark. Kommunens aftalegrundlag skal afklares.",
    "facts": [
        {
            "id": "hosting",
            "field": "hosting_region",
            "value": "denmark",
            "label": "Hosting",
            "source_refs": [
                {"source_id": SOURCE["id"], "quote": "Kundens data hostes i Danmark."}
            ],
        }
    ],
    "questions": [
        {
            "id": "dpa",
            "question": "Foreligger en underskrevet databehandleraftale?",
            "topic": "Databehandleraftale",
            "priority": "high",
        }
    ],
    "conflicts": [],
}


def review(draft, flagged=False):
    ids = [
        "summary",
        *[f"fact:{item['id']}" for item in draft["facts"]],
        *[f"conflict:{item['id']}" for item in draft["conflicts"]],
    ]
    return {
        "model": "typesafe-ai/jev",
        "rubric_version": "test",
        "checks": [
            {
                "id": item,
                "label": item,
                "section_ids": [item],
                "probability": 0.9 if flagged else 0.1,
                "requires_review": flagged,
            }
            for item in ids
        ],
        "status": "findings_require_review" if flagged else "requires_human_review",
        "threshold": 0.5,
        "threshold_note": "Test",
        "usage": [],
    }


@pytest.fixture
def setup(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'procurement.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(api.router)

    def database():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[api.ACCESS] = lambda: UserPrincipal(
        oid="reviewer",
        name="Reviewer",
        roles=["Hammeren.Sagsbehandler"],
        auth_mode="development",
        identity_assurance="development_only",
    )
    monkeypatch.setattr(
        service, "evidence_for_case", lambda db, case: deepcopy([SOURCE])
    )
    monkeypatch.setattr(api, "evidence_for_case", lambda db, case: deepcopy([SOURCE]))
    client = TestClient(app)
    response = client.post("/api/v3/procurements", json=PROFILE)
    assert response.status_code == 201, response.text
    yield client, factory, response.json()["case_id"]
    engine.dispose()


def save_example(factory, case_id, flagged=False):
    with factory() as db:
        pack = service.prepare_source_pack(db, case_id)
        return service.import_codex_analysis(
            db,
            pack,
            DRAFT,
            model="gpt-5.6-sol",
            run_id="example-sol-run",
            worker=lambda payload: {"review": review(payload["draft"], flagged)},
        )


def test_saving_unchanged_profile_keeps_evidence_analysis_current(setup):
    client, factory, case_id = setup
    analysis = save_example(factory, case_id)
    result = client.patch(f"/api/v3/cases/{case_id}/procurement", json={**PROFILE, "revision": 1})
    assert result.status_code == 200
    assert result.json()["profile"]["revision"] == 1
    assert result.json()["analysis"]["id"] == analysis["id"]
    assert result.json()["analysis"]["outdated"] is False


def test_professional_case_creation_and_revision_conflict(setup):
    client, factory, case_id = setup
    with factory() as db:
        case = db.get(Case, case_id)
        assert case.case_id.startswith("FS-")
        assert case.title == PROFILE["system_name"]
        assert "E2E" not in case.notes
        assert case.status == "kladde"
    updated = client.patch(
        f"/api/v3/cases/{case_id}/procurement",
        json={**PROFILE, "revision": 1, "system_name": "Dokumenthåndtering"},
    )
    assert updated.status_code == 200
    assert updated.json()["profile"]["revision"] == 2
    assert (
        client.patch(
            f"/api/v3/cases/{case_id}/procurement", json={**PROFILE, "revision": 1}
        ).status_code
        == 409
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("legal_basis", "public_task"),
        ("verified_controls", ["encryption"]),
        ("transfer_outside_eea", "false"),
        ("hosting_region", "surely_eu"),
        ("data_subjects", ["citizens", "citizens"]),
    ],
)
def test_invalid_facts_rejected_before_evaluator(setup, field, value):
    _, factory, case_id = setup
    called = []
    with factory() as db:
        pack = service.prepare_source_pack(db, case_id)
        draft = deepcopy(DRAFT)
        draft["facts"][0].update(field=field, value=value)
        with pytest.raises(service.MaterialAnalysisError):
            service.import_codex_analysis(
                db,
                pack,
                draft,
                model="gpt-5.6-sol",
                run_id="run",
                worker=lambda payload: called.append(payload),
            )
    assert called == []


@pytest.mark.parametrize(
    "reference",
    [
        {"source_id": "other-case", "quote": "Kundens data hostes i Danmark."},
        {"source_id": SOURCE["id"], "quote": "Kundens data hostes i Tyskland."},
    ],
)
def test_cross_case_and_invented_quotes_rejected(setup, reference):
    _, factory, case_id = setup
    with factory() as db:
        pack = service.prepare_source_pack(db, case_id)
        draft = deepcopy(DRAFT)
        draft["facts"][0]["source_refs"] = [reference]
        with pytest.raises(service.MaterialAnalysisError):
            service.validate_draft(pack, draft)


def test_immutable_analysis_current_check_and_provenance(setup):
    client, factory, case_id = setup
    saved = save_example(factory, case_id)
    assert (
        saved["model"] == "gpt-5.6-sol"
        and saved["generation_provider"] == "codex-local-test"
    )
    assert saved["review"]["model"] == "typesafe-ai/jev"
    assert not client.get(f"/api/v3/cases/{case_id}/procurement").json()["analysis"][
        "outdated"
    ]
    client.patch(
        f"/api/v3/cases/{case_id}/procurement",
        json={
            **PROFILE,
            "revision": 1,
            "intended_use": "Ændret formål med dokumentation af borgernes ansøgninger.",
        },
    )
    assert client.get(f"/api/v3/cases/{case_id}/procurement").json()["analysis"][
        "outdated"
    ]
    with factory() as db:
        assert (
            db.get(ProcurementAnalysis, saved["id"]).generation_payload["summary"]
            == DRAFT["summary"]
        )
        assert db.get(Case, case_id).status == "kladde"


def test_source_change_during_model_call_saves_nothing(setup, monkeypatch):
    _, factory, case_id = setup

    def worker(payload):
        monkeypatch.setattr(
            service,
            "evidence_for_case",
            lambda db, case: [{**SOURCE, "checksum": "changed"}],
        )
        return {"review": review(payload["draft"])}

    with factory() as db:
        pack = service.prepare_source_pack(db, case_id)
        with pytest.raises(service.MaterialChangedError):
            service.import_codex_analysis(
                db, pack, DRAFT, model="gpt-5.6-sol", run_id="race", worker=worker
            )
        assert db.query(ProcurementAnalysis).count() == 0


def test_profile_change_during_model_call_saves_nothing(setup):
    _, factory, case_id = setup

    def worker(payload):
        with factory() as other:
            profile = other.get(ProcurementProfile, case_id)
            profile.revision += 1
            other.commit()
        return {"review": review(payload["draft"])}

    with factory() as db:
        pack = service.prepare_source_pack(db, case_id)
        with pytest.raises(service.MaterialChangedError):
            service.import_codex_analysis(
                db, pack, DRAFT, model="gpt-5.6-sol", run_id="race", worker=worker
            )
        assert db.query(ProcurementAnalysis).count() == 0


def test_partial_or_inconsistent_jev_review_cannot_save(setup):
    _, factory, case_id = setup
    with factory() as db:
        pack = service.prepare_source_pack(db, case_id)
        invalid = review(DRAFT)
        invalid["checks"].pop()
        with pytest.raises(service.MaterialAnalysisError):
            service.save_analysis(
                db,
                pack,
                DRAFT,
                invalid,
                model="gpt-5.6-sol",
                provider="codex-local-test",
            )
        assert db.query(ProcurementAnalysis).count() == 0


def test_fact_review_is_explicit_and_isolated_from_legal_approval(setup):
    client, factory, case_id = setup
    saved = save_example(factory, case_id, flagged=True)
    path = f"/api/v3/cases/{case_id}/procurement/review"
    body = {"analysis_id": saved["id"], "accepted_fact_ids": ["hosting"]}
    assert client.post(path, json=body).status_code == 422
    response = client.post(
        path,
        json={
            **body,
            "note": "Kommunens systemejer skal bekræfte aftalens hostingforhold.",
        },
    )
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["dpia_prefill"]["hosting_region"] == "denmark"
    assert result["dpia_prefill"]["purpose"] == PROFILE["intended_use"]
    assert "legal_basis" not in result["dpia_prefill"]
    assert result["reviewed_by"] == "reviewer"
    assert (
        client.get(f"/api/v3/cases/{case_id}/procurement/reviews/{result['id']}").json()
        == result
    )
    with factory() as db:
        assert db.get(Case, case_id).status == "kladde"
        assert db.query(ProcurementFactReview).count() == 1


def test_stale_review_and_cross_case_review_rejected(setup):
    client, factory, case_id = setup
    saved = save_example(factory, case_id)
    review_result = client.post(
        f"/api/v3/cases/{case_id}/procurement/review",
        json={"analysis_id": saved["id"], "accepted_fact_ids": []},
    ).json()
    other = client.post("/api/v3/procurements", json=PROFILE).json()["case_id"]
    assert (
        client.get(
            f"/api/v3/cases/{other}/procurement/reviews/{review_result['id']}"
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v3/cases/{other}/procurement/review",
            json={"analysis_id": saved["id"], "accepted_fact_ids": []},
        ).status_code
        == 404
    )
    client.patch(
        f"/api/v3/cases/{case_id}/procurement",
        json={**PROFILE, "revision": 1, "owner": "Ny systemejer"},
    )
    assert (
        client.get(
            f"/api/v3/cases/{case_id}/procurement/reviews/{review_result['id']}"
        ).status_code
        == 409
    )


def test_no_sources_or_failed_model_cannot_leave_analysis(setup, monkeypatch):
    client, factory, case_id = setup
    monkeypatch.setattr(service, "evidence_for_case", lambda db, case: [])
    assert (
        client.post(f"/api/v3/cases/{case_id}/procurement/analyze").status_code == 422
    )
    with factory() as db:
        assert db.query(ProcurementAnalysis).count() == 0


def test_copied_pack_cannot_change_profile_or_sources(setup):
    _, factory, case_id = setup
    with factory() as db:
        pack = service.prepare_source_pack(db, case_id)
        pack["sources"][0]["text"] = "Injected evidence"
        with pytest.raises(service.MaterialChangedError):
            service.check_pack(db, pack)
        pack["source_pack_sha256"] = service.digest(
            {key: value for key, value in pack.items() if key != "source_pack_sha256"}
        )
        with pytest.raises(service.MaterialChangedError):
            service.check_pack(db, pack)


def test_reimport_is_idempotent_without_repeating_paid_review(setup):
    _, factory, case_id = setup
    saved = save_example(factory, case_id)
    with factory() as db:
        pack = service.prepare_source_pack(db, case_id)

        def never_called(_):
            pytest.fail("An existing run must not call the evaluator again")

        result = service.import_codex_analysis(
            db,
            pack,
            DRAFT,
            model="gpt-5.6-sol",
            run_id="example-sol-run",
            worker=never_called,
        )
        assert result["id"] == saved["id"] and result["already_saved"]
        assert db.query(ProcurementAnalysis).count() == 1
        changed = {
            **DRAFT,
            "summary": "Et ændret resumé som ikke skal overskrive den oprindelige analyse.",
        }
        with pytest.raises(service.MaterialAnalysisError):
            service.import_codex_analysis(
                db,
                pack,
                changed,
                model="gpt-5.6-sol",
                run_id="example-sol-run",
                worker=never_called,
            )
