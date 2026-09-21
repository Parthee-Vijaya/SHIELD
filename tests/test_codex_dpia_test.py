"""The local Codex bridge never weakens the assessment or evaluator boundary."""

from copy import deepcopy
import json
from unittest.mock import Mock
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from scripts import run_codex_dpia_test as bridge
from src.database.cases import Case, create_case
from src.database.connection import Base
from src.database.dpia import DPIAAssessmentRecord, get_assessment, save_assessment
from src.services.dpia_ai import AIGenerationUnavailable, InvalidAIDraft
from tests.test_dpia_ai import recommendation, worker_output
from tests.test_dpia_assessment import make_assessment


@pytest.fixture
def prepared(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'codex.db'}")
    Base.metadata.create_all(engine)
    request, result = make_assessment()
    request.project_name = "E2E TEST – Codex-isolation"
    with Session(engine) as db:
        case = create_case(db, case_id="E2E-CODEX", title=request.project_name)
        record = save_assessment(
            db,
            assessment_id=result.id,
            created_at=result.created_at,
            request_payload=request.model_dump(mode="json"),
            result_payload=result.model_dump(mode="json"),
            case_db_id=case.id,
        )
        db.commit()
        pack = bridge.prepare_pack(db, record.id, request.project_name)
        output = worker_output(result)
        yield db, pack, output
    engine.dispose()


def run(prepared, reviewer=None, **overrides):
    db, pack, output = prepared
    return bridge.import_draft(
        db,
        pack,
        output["draft"],
        model="gpt-5.6-sol",
        run_id="synthetic-unit-test",
        reviewer=reviewer or Mock(return_value=output["review"]),
        **overrides,
    )


@pytest.fixture
def planned(prepared):
    db, pack, output = prepared
    record = get_assessment(db, pack["assessment_id"])
    record.project_name = "AI-referater til kommunale projektmøder"
    record.request_payload = {
        **record.request_payload,
        "project_name": record.project_name,
    }
    db.get(Case, record.case_db_id).title = record.project_name
    db.commit()
    return (
        db,
        bridge.prepare_pack(
            db,
            record.id,
            record.project_name,
            planned_scenario=True,
        ),
        output,
    )


def test_import_new_version_is_idempotent_and_preserves_original_and_case(prepared):
    db, pack, output = prepared
    before = deepcopy(get_assessment(db, pack["assessment_id"]).result_payload)
    case_status = db.get(Case, pack["case_db_id"]).status
    reviewer = Mock(return_value=output["review"])
    receipt = run(prepared, reviewer)
    assert receipt["version"] == 2 and receipt["review_checks"] == 74
    assert not receipt["already_saved"]
    assert reviewer.call_count == 1
    stored = get_assessment(db, receipt["assessment_id"])
    generation = stored.result_payload["ai_generation"]
    assert generation["provider"] == "codex-local-test"
    assert generation["model"] == "gpt-5.6-sol"
    assert generation["usage"]["drafting"] is None
    assert generation["review"] == output["review"]
    assert stored.result_payload["parent_assessment_id"] == pack["assessment_id"]
    assert get_assessment(db, pack["assessment_id"]).result_payload == before
    assert db.get(Case, pack["case_db_id"]).status == case_status
    assert stored.result_payload["blockers"] == before["blockers"]
    assert stored.result_payload["status"] == before["status"]
    for old, new in zip(before["risks"], stored.result_payload["risks"]):
        for key in old:
            if key not in {
                "scenario",
                "measures",
                "rationale",
                "consequences",
                "source_ids",
            }:
                assert new[key] == old[key]
    repeated = run(prepared, reviewer)
    assert repeated["assessment_id"] == receipt["assessment_id"]
    assert repeated["already_saved"] and reviewer.call_count == 1
    assert db.query(DPIAAssessmentRecord).count() == 2


@pytest.mark.parametrize(
    "mutation", ["source", "summary", "duplicate", "score", "locked"]
)
def test_invalid_draft_never_calls_jev_or_saves(prepared, mutation):
    db, pack, output = prepared
    draft = output["draft"]
    if mutation == "source":
        draft["risks"][0]["source_ids"] = ["document:unrelated"]
    elif mutation == "summary":
        draft["summary_source_ids"] = ["invented"]
    elif mutation == "duplicate":
        draft["sections"][1]["id"] = draft["sections"][0]["id"]
    elif mutation == "score":
        draft["risks"][0]["residual_risk"] = 1
    else:
        locked = next(
            s
            for s in pack["result"]["sections"]
            if s["review_status"] in {"missing_information", "not_applicable"}
        )
        next(s for s in draft["sections"] if s["id"] == locked["id"])[
            "text"
        ] = "Alle forhold er dokumenteret."
    reviewer = Mock()
    with pytest.raises(InvalidAIDraft):
        run(prepared, reviewer)
    reviewer.assert_not_called()
    assert db.query(DPIAAssessmentRecord).count() == 1


@pytest.mark.parametrize("mutation", ["source", "duplicate", "verification"])
def test_invalid_recommendation_stops_before_paid_review(prepared, mutation):
    db, pack, output = prepared
    item = recommendation()
    output["draft"]["recommendations"] = [item]
    if mutation == "source":
        item["source_ids"] = ["document:other-case"]
    elif mutation == "duplicate":
        output["draft"]["recommendations"].append(deepcopy(item))
    else:
        item.pop("verification")
    reviewer = Mock()
    with pytest.raises(InvalidAIDraft):
        run(prepared, reviewer)
    reviewer.assert_not_called()
    assert db.query(DPIAAssessmentRecord).count() == 1


@pytest.mark.parametrize("mutation", ["pack", "source", "base", "relink"])
def test_stale_or_tampered_input_never_calls_jev(prepared, mutation):
    db, pack, output = prepared
    if mutation == "pack":
        pack["result"]["executive_summary"] = "Changed"
    elif mutation == "source":
        pack["sources"][0]["text"] = "Changed evidence"
    elif mutation == "base":
        get_assessment(db, pack["assessment_id"]).result_payload = {
            **pack["result"],
            "executive_summary": "Changed stored base",
        }
        db.commit()
    else:
        other = create_case(db, case_id="OTHER", title="Other")
        get_assessment(db, pack["assessment_id"]).case_db_id = other.id
        db.commit()
    reviewer = Mock()
    with pytest.raises(ValueError):
        run(prepared, reviewer)
    reviewer.assert_not_called()
    assert db.query(DPIAAssessmentRecord).count() == 1


@pytest.mark.parametrize("mutation", ["base", "relink"])
def test_source_changed_during_jev_cannot_save(prepared, mutation):
    db, pack, output = prepared

    def reviewer(*_):
        with Session(db.get_bind()) as writer:
            record = get_assessment(writer, pack["assessment_id"])
            if mutation == "base":
                record.result_payload = {
                    **record.result_payload,
                    "executive_summary": "Changed during review",
                }
            else:
                other = create_case(writer, case_id="OTHER", title="Other")
                record.case_db_id = other.id
            writer.commit()
        return output["review"]

    with pytest.raises(ValueError):
        run(prepared, reviewer)
    assert db.query(DPIAAssessmentRecord).count() == 1


def test_jev_failure_and_invalid_review_save_nothing(prepared):
    db, _, output = prepared
    with pytest.raises(AIGenerationUnavailable):
        run(
            prepared,
            Mock(side_effect=AIGenerationUnavailable("Synthetic offline failure")),
        )
    with pytest.raises(InvalidAIDraft):
        run(prepared, Mock(return_value={**output["review"], "checks": []}))
    assert db.query(DPIAAssessmentRecord).count() == 1


def test_run_id_cannot_be_reused_for_different_draft(prepared):
    db, _, output = prepared
    run(prepared)
    output["draft"]["executive_summary"] = "Et andet udkast."
    reviewer = Mock()
    with pytest.raises(ValueError, match="allerede brugt"):
        run(prepared, reviewer)
    reviewer.assert_not_called()
    assert db.query(DPIAAssessmentRecord).count() == 2


def test_import_failure_rolls_back_new_version(prepared, monkeypatch):
    db, _, _ = prepared
    original_save = bridge.save_assessment

    def failing_save(*args, **kwargs):
        original_save(*args, **kwargs)
        raise RuntimeError("Synthetic persistence failure")

    monkeypatch.setattr(bridge, "save_assessment", failing_save)
    with pytest.raises(RuntimeError):
        run(prepared)
    assert db.query(DPIAAssessmentRecord).count() == 1


def test_non_synthetic_name_is_rejected(prepared):
    db, pack, _ = prepared
    record = get_assessment(db, pack["assessment_id"])
    record.project_name = "Actual operational case"
    db.commit()
    with pytest.raises(ValueError):
        bridge.prepare_pack(db, record.id, record.project_name)


@pytest.mark.parametrize("code", ["evaluation_timeout", "private-upstream-details"])
def test_evaluator_failure_only_exposes_allowlisted_safe_messages(
    prepared, monkeypatch, code
):
    _, pack, output = prepared
    process = Mock(
        return_value=SimpleNamespace(
            returncode=1,
            stdout='{"error":{"code":"'
            + code
            + '","message":"private-provider-text"}}',
            stderr="private-headers",
        )
    )
    monkeypatch.setattr(bridge.subprocess, "run", process)
    with pytest.raises(AIGenerationUnavailable) as caught:
        bridge.run_jev(pack, output["draft"])
    message = str(caught.value)
    assert "private" not in message
    assert ("tidsgrænsen" in message) == (code == "evaluation_timeout")
    assert process.call_args.args[0] == [
        "node",
        "--env-file-if-exists=.env.local",
        "ai-gateway/review-draft.mts",
    ]


def test_unrecognized_model_cannot_trigger_evaluator(prepared):
    db, pack, output = prepared
    reviewer = Mock()
    with pytest.raises(ValueError):
        bridge.import_draft(
            db,
            pack,
            output["draft"],
            model="invented-model",
            run_id="test",
            reviewer=reviewer,
        )
    reviewer.assert_not_called()


def test_planned_scenario_requires_explicit_opt_in_and_exact_saved_name(planned):
    db, pack, _ = planned
    with pytest.raises(ValueError, match="planned-scenario"):
        bridge.prepare_pack(db, pack["assessment_id"], pack["expected_name"])
    with pytest.raises(ValueError, match="præcise navn"):
        bridge.prepare_pack(
            db, pack["assessment_id"], "Et andet scenarie", planned_scenario=True
        )
    record = get_assessment(db, pack["assessment_id"])
    record.request_payload = {
        **record.request_payload,
        "project_name": "Uoverensstemmelse",
    }
    db.commit()
    with pytest.raises(ValueError, match="sagsgrundlag"):
        bridge.prepare_pack(
            db, pack["assessment_id"], pack["expected_name"], planned_scenario=True
        )


def test_planned_import_uses_same_jev_boundary_and_honest_non_test_provenance(
    planned, monkeypatch
):
    db, pack, output = planned
    before = deepcopy(get_assessment(db, pack["assessment_id"]).result_payload)
    process = Mock(
        return_value=SimpleNamespace(
            returncode=0,
            stdout=json.dumps(output["review"]),
            stderr="",
        )
    )
    monkeypatch.setattr(bridge.subprocess, "run", process)
    receipt = run(planned, bridge.run_jev)
    generation = get_assessment(db, receipt["assessment_id"]).result_payload[
        "ai_generation"
    ]
    assert generation["provider"] == generation["generated_by"] == "codex-local"
    assert generation["planned_scenario"] is True
    assert generation["model_run_provenance"] == "operator_reported"
    assert generation["prompt_version"] == bridge.PLANNED_PROMPT_VERSION
    assert generation["review"] == output["review"]
    assert generation["model"] == "gpt-5.6-sol"
    assert generation["source_pack_sha256"] == pack["source_pack_sha256"]
    assert generation["limitations"][-2:] == [
        "Udkast udarbejdet i Codex med gpt-5.6-sol; JEV-kontrol via AI Gateway.",
        "Model og kørsels-ID er angivet af den lokale operatør; denne import starter ikke Codex.",
    ]
    assert process.call_count == 1
    assert process.call_args.args[0][-1] == "ai-gateway/review-draft.mts"
    evaluator_input = json.loads(process.call_args.kwargs["input"])
    assert evaluator_input["sources"] == pack["sources"]
    assert evaluator_input["result"] == pack["result"]
    assert get_assessment(db, pack["assessment_id"]).result_payload == before
    assert run(planned, bridge.run_jev)["already_saved"] is True
    assert process.call_count == 1
    assert db.query(DPIAAssessmentRecord).count() == 2


@pytest.mark.parametrize(
    "mutation",
    ["source", "digest", "remove_opt_in", "malformed_opt_in", "base", "newer_version"],
)
def test_planned_source_pack_mutations_stop_before_jev(planned, mutation):
    db, pack, _ = planned
    if mutation == "source":
        pack["sources"][0]["text"] = "Changed source"
    elif mutation == "digest":
        pack["source_pack_sha256"] = "invalid"
    elif mutation == "remove_opt_in":
        pack.pop("planned_scenario")
    elif mutation == "malformed_opt_in":
        pack["planned_scenario"] = "true"
    elif mutation == "base":
        record = get_assessment(db, pack["assessment_id"])
        record.result_payload = {
            **record.result_payload,
            "executive_summary": "Changed saved source",
        }
        db.commit()
    else:
        save_assessment(
            db,
            assessment_id="newer-version",
            created_at=bridge.datetime.now(bridge.UTC),
            request_payload=pack["request"],
            result_payload=pack["result"],
            case_db_id=pack["case_db_id"],
        )
        db.commit()
    count = db.query(DPIAAssessmentRecord).count()
    reviewer = Mock()
    with pytest.raises(ValueError):
        run(planned, reviewer)
    reviewer.assert_not_called()
    assert db.query(DPIAAssessmentRecord).count() == count


@pytest.mark.parametrize("mutation", ["base", "newer_version"])
def test_planned_source_or_latest_version_changed_during_jev_cannot_be_saved(
    planned, mutation
):
    db, pack, output = planned

    def reviewer(*_):
        with Session(db.get_bind()) as writer:
            if mutation == "base":
                record = get_assessment(writer, pack["assessment_id"])
                record.result_payload = {
                    **record.result_payload,
                    "executive_summary": "Changed during JEV",
                }
            else:
                save_assessment(
                    writer,
                    assessment_id="concurrent-version",
                    created_at=bridge.datetime.now(bridge.UTC),
                    request_payload=pack["request"],
                    result_payload=pack["result"],
                    case_db_id=pack["case_db_id"],
                )
            writer.commit()
        return output["review"]

    with pytest.raises(ValueError):
        run(planned, reviewer)
    assert db.query(DPIAAssessmentRecord).count() == (
        2 if mutation == "newer_version" else 1
    )


def test_planned_prepare_refuses_a_superseded_base(planned):
    db, pack, _ = planned
    run(planned)
    with pytest.raises(ValueError, match="seneste version"):
        bridge.prepare_pack(
            db, pack["assessment_id"], pack["expected_name"], planned_scenario=True
        )


def test_cli_prepare_records_explicit_planned_mode_in_read_only_source_pack(
    planned, tmp_path, monkeypatch, capsys
):
    db, pack, _ = planned
    destination = tmp_path / "planned-source-pack.json"
    monkeypatch.setattr(
        bridge.sys,
        "argv",
        [
            "run_codex_dpia_test.py",
            "--database",
            str(db.get_bind().url.database),
            "prepare",
            "--assessment-id",
            pack["assessment_id"],
            "--expected-name",
            pack["expected_name"],
            "--planned-scenario",
            "--output",
            str(destination),
        ],
    )
    assert bridge.main() == 0
    saved_pack = bridge.read_json(destination)
    assert saved_pack["planned_scenario"] is True
    assert saved_pack == pack
    assert destination.stat().st_mode & 0o222 == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["source_pack_sha256"] == pack["source_pack_sha256"]
