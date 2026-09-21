from copy import deepcopy
from datetime import UTC, datetime, timedelta
import json
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import sessionmaker

from src.api.technical_runs import router
from src.api.workspace import WORKSPACE_ACCESS
from src.auth import UserPrincipal, get_current_user
from src.database.cases import create_case
from src.database.connection import Base, get_db, get_test_engine
from src.database.dpia import DPIAAssessmentRecord
from src.database.procurement import ProcurementAnalysis
from src.services.technical_runs import build_technical_runs

NOW = datetime(2026, 9, 21, 12, tzinfo=UTC)


@pytest.fixture
def setup():
    engine = get_test_engine()
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    app = FastAPI()
    app.include_router(router)
    principal = UserPrincipal(
        oid="reviewer",
        name="Reviewer",
        username="reviewer@example.invalid",
        roles=["Hammeren.Sagsbehandler"],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )
    app.dependency_overrides[get_current_user] = lambda: principal

    def database():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = database
    with factory() as db:
        case = create_case(db, case_id="K-2026-RUNS", title="Kommunens AI-løsning")
        other = create_case(db, case_id="K-OTHER", title="Anden sag")
        db.commit()
        case_id, other_id = case.id, other.id
    with TestClient(app) as client:
        yield {
            "factory": factory,
            "client": client,
            "app": app,
            "case": case_id,
            "other": other_id,
            "principal": principal,
        }
    Base.metadata.drop_all(engine)
    engine.dispose()


def ai_payload():
    return {
        "executive_summary": "Vurderingen kræver faglig gennemgang.",
        "scope": "Interne møder",
        "summary_source_ids": ["supplier:1"],
        "sections": [
            {
                "id": "1.1",
                "title": "Formål",
                "text": "AI skriver mødereferater.",
                "source_ids": ["supplier:1"],
                "source": "ai_assisted",
            }
        ],
        "risks": [
            {
                "id": "4.1",
                "area": "Data",
                "scenario": "Utilsigtet eksponering",
                "consequences": "Fortrolighedstab",
                "measures": "Afprøv adgangskontrol",
                "rationale": "Lyd behandles",
                "likelihood": 3,
                "impact": 4,
                "residual_likelihood": 2,
                "residual_impact": 4,
                "source_ids": ["supplier:1"],
            }
        ],
        "recommendations": [
            {
                "id": "local",
                "title": "Overvej lokal behandling",
                "proposal": "Afprøv lokal model",
                "rationale": "Følsom lyd",
                "prerequisites": "Teknisk afklaring",
                "verification": "Dokumenteret kontrol",
                "source_ids": ["supplier:1"],
            }
        ],
        "ai_generation": {
            "model": "gpt-5.6-sol",
            "provider": "codex-local",
            "model_run_provenance": "operator_reported",
            "run_id": "run-1",
            "prompt_version": "codex-local-dpia-planned-scenario-2026-09-21-v1",
            "generated_at": NOW.isoformat(),
            "source_pack_sha256": "abc",
            "draft_sha256": "def",
            "base_fingerprint": "ghi",
            "sources": [
                {
                    "id": "supplier:1",
                    "title": "Leverandørens dokument",
                    "text": "Leverandørens gemte kildetekst.",
                    "checksum": "file-hash",
                    "source_url": "https://example.invalid/dpa",
                    "api_key": "should-not-leak",
                }
            ],
            "review": {
                "model": "typesafe-ai/jev",
                "rubric_version": "dpia-evidence-review-2026-09-21-v4",
                "status": "findings_require_review",
                "threshold": 0.5,
                "threshold_note": "Kildegrundlag i separate delkald; højeste problemsignal.",
                "checks": [
                    {
                        "id": "summary",
                        "label": "Resumé",
                        "section_ids": ["summary"],
                        "probability": 0.6,
                        "requires_review": True,
                    },
                    {
                        "id": "section:1.1",
                        "label": "Formål",
                        "section_ids": ["section:1.1"],
                        "probability": 0.2,
                        "requires_review": False,
                    },
                    {
                        "id": "recommendation:local",
                        "label": "Forslag",
                        "section_ids": ["recommendation:local"],
                        "probability": 0.1,
                        "requires_review": False,
                    },
                ],
                "usage": [
                    {
                        "inputTokens": 100,
                        "outputTokens": 20,
                        "totalTokens": 120,
                        "authorization": "should-not-leak",
                    }
                ],
                "reasoning": "should-not-leak",
            },
            "usage": {
                "drafting": None,
                "evaluation": [{"inputTokens": 100, "totalTokens": 120}],
                "drafting_usage_note": "Ikke registreret",
                "headers": {"authorization": "should-not-leak"},
            },
            "api_key": "should-not-leak",
            "limitations": ["Faglig gennemgang kræves."],
        },
    }


def save_dpia(setup, payload, *, case_id=None, version=1, when=NOW):
    with setup["factory"]() as db:
        record = DPIAAssessmentRecord(
            id=str(uuid4()),
            case_db_id=case_id or setup["case"],
            version=version,
            project_name="Kommunens AI",
            organisation="Kalundborg Kommune",
            status="blocked",
            risk_level="high",
            template_version="2026-v1",
            request_payload={
                "purpose": "Gemte oplysninger om interne møder",
                "model_training": None,
                "AI_GATEWAY_API_KEY": "should-not-leak",
            },
            result_payload=deepcopy(payload),
            created_at=when,
            updated_at=when,
        )
        db.add(record)
        db.commit()
        return record.id


def get_runs(setup):
    response = setup["client"].get(f"/api/v3/cases/{setup['case']}/technical-runs")
    assert response.status_code == 200, response.text
    return response.json()["runs"]


def test_empty_and_unknown_case(setup):
    assert get_runs(setup) == []
    response = setup["client"].get("/api/v3/cases/absent/technical-runs")
    assert response.status_code == 404
    assert response.json()["detail"] == "Sagen blev ikke fundet."


def test_baseline_is_rules_not_failed_ai(setup):
    payload = ai_payload()
    payload.pop("ai_generation")
    id = save_dpia(setup, payload)
    run = get_runs(setup)[0]
    assert run["kind"] == "dpia_rules"
    assert run["assessment_id"] == id
    assert run["model"] is None and run["review"] is None and run["usage"] is None
    assert "regelbaseret" in " ".join(run["recording_notes"])
    assert run["input_snapshot"]["model_training"] is None


def test_ai_evidence_signal_provenance_and_no_secret_metadata(setup):
    payload = ai_payload()
    id = save_dpia(setup, payload)
    run = get_runs(setup)[0]
    assert run["kind"] == "dpia_ai" and run["model"] == "gpt-5.6-sol"
    assert run["provenance"]["model_attestation"] == "operator_reported"
    assert run["review"]["threshold"] == 0.5
    assert run["review"]["checks"][0]["source_ids"] == ["supplier:1"]
    assert run["review"]["checks"][0]["probability"] == 0.6
    assert run["review"]["checks"][0]["output_item_ids"] == ["summary"]
    assert run["sources"][0]["text"] == "Leverandørens gemte kildetekst."
    assert run["review"]["reviewed_assessment_id"] == id
    assert run["usage"]["drafting"] is None
    assert run["review"]["usage"][0]["totalTokens"] == 120
    assert "should-not-leak" not in json.dumps(run)
    assert "begrundelse" in run["review"]["reasoning_note"]
    assert "batchgrænser" in run["review"]["source_note"]
    with setup["factory"]() as db:
        assert db.get(DPIAAssessmentRecord, id).result_payload == payload


def test_generated_by_is_actor_not_inferred_provider_and_unknown_legacy_rubric(setup):
    payload = ai_payload()
    generation = payload["ai_generation"]
    for key in ["provider", "run_id", "model_run_provenance"]:
        generation.pop(key)
    generation["generated_by"] = "actor-id-123"
    generation["review"]["rubric_version"] = "old-unrecorded-rubric"
    generation["review"]["threshold"] = 0.7
    save_dpia(setup, payload)
    run = get_runs(setup)[0]
    assert run["provider"] is None
    assert run["provenance"]["run_id"] is None
    assert run["review"]["threshold"] == 0.7
    assert run["review"]["criteria"] == []
    assert "actor-id-123" not in json.dumps(run)


def test_manual_revision_preserves_historical_review_text_and_flags(setup):
    original = ai_payload()
    base_id = save_dpia(setup, original)
    changed = deepcopy(original)
    changed["executive_summary"] = "Menneskeligt redigeret tekst."
    changed["summary_source_ids"] = []
    changed["parent_assessment_id"] = base_id
    changed["editorial_revision"] = {
        "base_assessment_id": base_id,
        "edited_by": "Sagsbehandler",
        "edited_at": (NOW + timedelta(hours=1)).isoformat(),
        "note": "Præcisering",
        "changed_targets": ["summary"],
        "stale_check_ids": ["summary", "recommendation:local"],
        "review_status": "pending_recheck",
    }
    save_dpia(setup, changed, version=2, when=NOW + timedelta(hours=1))
    revision, original_run = get_runs(setup)
    assert revision["kind"] == "dpia_revision"
    assert (
        revision["output_items"][0]["fields"]["Resumé"] == changed["executive_summary"]
    )
    assert (
        revision["review"]["reviewed_output_items"][0]["fields"]["Resumé"]
        == original["executive_summary"]
    )
    assert revision["review"]["reviewed_assessment_id"] == base_id
    assert [check["stale"] for check in revision["review"]["checks"]] == [
        True,
        False,
        True,
    ]
    assert revision["review"]["checks"][0]["source_ids"] == ["supplier:1"]
    assert (
        revision["generation_created_at"] == original["ai_generation"]["generated_at"]
    )
    assert revision["usage"] is None and revision["review"]["usage"] is None
    assert original_run["review"]["usage"][0]["totalTokens"] == 120


def test_cross_case_parent_is_not_disclosed_and_unknown_parent_is_honest(setup):
    original = ai_payload()
    original["executive_summary"] = "Other case private text"
    other_id = save_dpia(setup, original, case_id=setup["other"])
    payload = ai_payload()
    payload["editorial_revision"] = {
        "base_assessment_id": other_id,
        "stale_check_ids": ["summary"],
    }
    save_dpia(setup, payload)
    run = get_runs(setup)[0]
    assert run["review"]["reviewed_output_items"] == []
    assert run["review"]["reviewed_assessment_id"] is None
    assert run["review"]["checks"][0]["source_ids"] == []
    assert "Other case private text" not in json.dumps(run)


def test_material_snapshot_with_flat_stored_draft_and_unknown_drafting_usage(setup):
    payload = ai_payload()["ai_generation"]
    payload.update(
        {
            "summary": "Leverandørmaterialet beskriver AI",
            "facts": [
                {
                    "id": "f1",
                    "field": "model_training",
                    "value": False,
                    "source_refs": [
                        {
                            "source_id": "supplier:1",
                            "quote": "Anvendes ikke til modeltræning",
                        }
                    ],
                }
            ],
            "questions": [
                {
                    "id": "q1",
                    "topic": "Aftale",
                    "question": "Foreligger underskrevet aftale?",
                    "priority": "high",
                }
            ],
            "conflicts": [],
            "profile_snapshot": {
                "organisation": "Kalundborg Kommune",
                "system_name": "AI",
                "api_key": "should-not-leak",
            },
        }
    )
    payload.pop("usage")
    with setup["factory"]() as db:
        db.add(
            ProcurementAnalysis(
                id=str(uuid4()),
                case_id=setup["case"],
                created_at=NOW,
                profile_fingerprint="profilehash",
                source_fingerprint="sourcehash",
                generation_payload=payload,
                model="openai/gpt-5.5",
                generation_provider="vercel-ai-gateway",
                status="requires_human_review",
            )
        )
        db.commit()
    run = get_runs(setup)[0]
    assert run["kind"] == "material_analysis" and run["assessment_id"] is None
    assert run["output_items"][1]["fields"]["Udledt oplysning"] == "Nej"
    assert run["output_items"][0]["source_ids"] == ["supplier:1"]
    assert run["input_snapshot"]["organisation"] == "Kalundborg Kommune"
    assert run["usage"] is None
    assert "should-not-leak" not in json.dumps(run)


def test_partial_history_still_reads_and_no_request_means_no_network(
    setup, monkeypatch
):
    import subprocess

    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *a, **kw: pytest.fail("Read-only history must never invoke a worker"),
    )
    save_dpia(setup, {"ai_generation": {"model": "historic-model"}})
    run = get_runs(setup)[0]
    assert run["review"] is None and run["sources"] == []
    assert "ingen gemt JEV-kontrol" in " ".join(run["recording_notes"])


def test_workspace_role_requirement_and_unauthenticated(setup):
    setup["principal"].roles = []
    assert (
        setup["client"].get(f"/api/v3/cases/{setup['case']}/technical-runs").status_code
        == 403
    )

    def not_logged_in():
        raise HTTPException(401, "Log ind")

    setup["app"].dependency_overrides[get_current_user] = not_logged_in
    assert (
        setup["client"].get(f"/api/v3/cases/{setup['case']}/technical-runs").status_code
        == 401
    )
    # Even an unknown case must not disclose existence before authorization.
    assert (
        setup["client"].get("/api/v3/cases/unknown/technical-runs").status_code == 401
    )


def test_source_type_is_marked_as_derived_and_malformed_usage_is_not_exposed(setup):
    payload = ai_payload()
    payload["ai_generation"]["sources"][0]["id"] = "document:1"
    payload["ai_generation"]["usage"] = {
        "inputTokens": "should-not-leak",
        "outputTokens": -1,
        "totalTokens": 0,
        "evaluation": ["should-not-leak"],
    }
    save_dpia(setup, payload)
    run = get_runs(setup)[0]
    assert run["sources"][0]["kind"] == "document"
    assert run["sources"][0]["kind_inferred"] is True
    assert run["usage"] == {
        "inputTokens": None,
        "outputTokens": None,
        "totalTokens": 0,
        "evaluation": [None],
    }
    assert "should-not-leak" not in json.dumps(run)


def test_database_error_returns_safe_message(setup, monkeypatch):
    from sqlalchemy.exc import OperationalError

    def failed(*args):
        raise OperationalError(
            "sql", {}, RuntimeError("database-password-must-not-leak")
        )

    monkeypatch.setattr("src.api.technical_runs.build_technical_runs", failed)
    response = setup["client"].get(f"/api/v3/cases/{setup['case']}/technical-runs")
    assert response.status_code == 503
    assert "database-password" not in response.text


@pytest.mark.parametrize("kind", ["dpia", "material"])
def test_saved_batch_coverage_is_visible_without_private_worker_metadata(setup, kind):
    payload = ai_payload()
    batching = {
        "strategy": "map-reduce-v1",
        "batch_count": 2,
        "source_count": 2,
        "source_text_chars": 60,
        "map_call_count": 2,
        "synthesis_call_count": 1,
        "authorization": "should-not-leak",
        "batches": [
            {
                "index": index,
                "source_ids": [f"supplier:{index}"],
                "source_text_chars": 30,
                "document_count": 1,
                "summary": f"Gemt resumé for del {index}.",
                "fact_count": 1,
                "headers": {"authorization": "should-not-leak"},
            }
            for index in (1, 2)
        ],
    }
    payload["ai_generation"]["batching"] = batching
    if kind == "dpia":
        save_dpia(setup, payload)
    else:
        with setup["factory"]() as db:
            db.add(
                ProcurementAnalysis(
                    id=str(uuid4()),
                    case_id=setup["case"],
                    created_at=NOW,
                    profile_fingerprint="profile",
                    source_fingerprint="sources",
                    generation_payload=payload["ai_generation"],
                    model="openai/gpt-5.5",
                    generation_provider="vercel-ai-gateway",
                    status="requires_human_review",
                )
            )
            db.commit()
    run = get_runs(setup)[0]
    assert run["batching"]["batch_count"] == 2
    assert run["batching"]["source_count"] == 2
    assert run["batching"]["batches"][1]["source_ids"] == ["supplier:2"]
    assert run["batching"]["batches"][1]["summary"] == "Gemt resumé for del 2."
    assert "should-not-leak" not in json.dumps(run)


def test_old_runs_do_not_invent_batch_execution(setup):
    save_dpia(setup, ai_payload())
    run = get_runs(setup)[0]
    assert run["batching"] is None
