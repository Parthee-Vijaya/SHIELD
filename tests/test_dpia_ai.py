"""Offline contracts for report drafting, case snapshots and API permissions."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime
from hashlib import sha256
import json
import subprocess
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main
from src.auth.entra import UserPrincipal, get_current_user
from src.database.cases import Case
from src.database.connection import Base
from src.database.dpia import DPIAAssessmentRecord, save_assessment
from src.services import dpia_ai
from tests.test_dpia_assessment import make_assessment


def worker_output(original):
    """Synthetic complete Node contract; never invokes any model."""
    source_ids = ["input:purpose"]
    draft = {
        "executive_summary": "Syntetisk udkast til faglig gennemgang.",
        "scope": "Syntetisk afgrænsning med kendt kildegrundlag.",
        "summary_source_ids": source_ids,
        "sections": [
            {
                "id": section.id,
                "text": (
                    section.text
                    if section.review_status
                    in {"missing_information", "not_applicable"}
                    else f"Kildeunderbygget forslag til afsnit {section.id}."
                ),
                "source_ids": source_ids,
            }
            for section in original.sections
        ],
        "risks": [
            {
                "id": risk.id,
                "scenario": "En mulig hændelse kan skade de registrerede.",
                "measures": "Foreslået beskyttelse kræver dokumentation før anvendelse.",
                "rationale": "Scoren kræver fortsat faglig vurdering af sagens forhold.",
                "consequences": "Den registrerede kan miste kontrol over sine oplysninger.",
                "source_ids": source_ids,
            }
            for risk in original.risks
        ],
        "additional_risks": [
            {
                "title": "Supplerende forslag",
                "scenario": "Muligt tab af kontrol.",
                "measures": "Undersøg mulig begrænsning.",
                "source_ids": source_ids,
            }
        ],
        "open_questions": ["Hvilken dokumentation mangler?"],
    }
    targets = (
        ["summary"]
        + [f"section:{s.id}" for s in original.sections]
        + [f"risk:{r.id}" for r in original.risks]
        + ["additional:1"]
    )
    return {
        "draft": draft,
        "review": {
            "model": "typesafe-ai/jev",
            "rubric_version": "synthetic-v1",
            "checks": [
                {
                    "id": target,
                    "label": target,
                    "section_ids": [target],
                    "probability": 0.2,
                    "requires_review": False,
                }
                for target in targets
            ],
            "status": "requires_human_review",
            "threshold": 0.5,
            "threshold_note": "Kræver faglig vurdering.",
            "usage": [],
        },
        "model": "openai/gpt-5.5",
        "prompt_version": "synthetic-v1",
        "usage": {},
    }


def apply(original, output=None):
    request, _ = make_assessment()
    return dpia_ai.apply_ai_draft(
        original,
        output or worker_output(original),
        dpia_ai.build_sources(request, original),
        assessment_id=str(uuid4()),
        created_at=datetime.now(UTC),
        case_db_id=str(uuid4()),
    )


def test_prose_version_preserves_rules_and_protected_sections_and_original():
    _, original = make_assessment()
    before = original.model_dump(mode="json")
    candidate = apply(original)
    assert original.model_dump(mode="json") == before
    assert candidate.id != original.id
    assert candidate.parent_assessment_id == original.id
    for field in (
        "status",
        "risk_level",
        "risk_score",
        "residual_risk_level",
        "residual_risk_score",
        "blockers",
        "missing_information",
        "legal_verification",
    ):
        if field in before:
            assert getattr(candidate, field) == getattr(original, field)
    for old, new in zip(original.risks, candidate.risks):
        for field, value in old.model_dump().items():
            if field not in {
                "scenario",
                "measures",
                "rationale",
                "consequences",
                "source_ids",
            }:
                assert new.model_dump()[field] == value
    for old, new in zip(original.sections, candidate.sections):
        assert old.review_status == new.review_status
        if old.review_status in {"missing_information", "not_applicable"}:
            assert (new.text, new.source) == (old.text, old.source)
        else:
            assert new.source == "ai_assisted"
    assert candidate.ai_generation["human_review_required"] is True
    assert candidate.ai_generation["sources"][0]["text"]
    assert candidate.additional_risks and candidate.open_questions


def test_full_ai_generation_replaces_stale_human_edit_marker_but_keeps_parent():
    _, original = make_assessment()
    original.editorial_revision = {
        "stale_check_ids": ["summary"],
        "note": "En tidligere menneskelig ændring.",
    }
    candidate = apply(original)
    assert candidate.editorial_revision is None
    assert candidate.parent_assessment_id == original.id
    assert original.editorial_revision["stale_check_ids"] == ["summary"]
    assert len(candidate.ai_generation["review"]["checks"]) == 74


def recommendation():
    return {
        "id": "local_processing",
        "title": "Afprøv isoleret behandling",
        "proposal": "Overvej en lokal model til følsomme mødereferater, hvis løsningen kan understøtte det.",
        "rationale": "Det beskrevne formål kan indebære behandling af fortrolige oplysninger.",
        "prerequisites": "Afklar teknisk mulighed, kvalitet og kommunens driftsansvar.",
        "verification": "Afprøv med syntetiske møder og dokumentér kvalitet, adgang og sletning.",
        "source_ids": ["input:purpose"],
    }


def output_with_recommendation(original):
    output = worker_output(original)
    output["draft"]["recommendations"] = [recommendation()]
    output["review"]["checks"].append({
        "id": "recommendation:local_processing",
        "label": "Anbefaling om lokal behandling",
        "section_ids": ["recommendation:local_processing"],
        "probability": 0.2,
        "requires_review": False,
    })
    return output


def test_recommendations_are_separate_reviewed_proposals_not_assessment_changes():
    _, original = make_assessment()
    original.reading_guide = {"conclusion": "Old derived text"}
    candidate = apply(original, output_with_recommendation(original))
    assert candidate.recommendations[0].model_dump() == recommendation()
    assert original.recommendations == []
    assert candidate.reading_guide is None
    assert original.reading_guide is not None
    assert candidate.status == original.status
    assert candidate.blockers == original.blockers
    assert candidate.missing_information == original.missing_information
    assert candidate.next_steps == original.next_steps
    assert candidate.risk_level == original.risk_level
    assert len(candidate.ai_generation["review"]["checks"]) == 75


def test_old_drafts_and_reports_have_no_invented_recommendations():
    _, original = make_assessment()
    payload = original.model_dump()
    payload.pop("recommendations")
    assert type(original).model_validate(payload).recommendations == []
    assert apply(original).recommendations == []


@pytest.mark.parametrize("corruption", [
    "unknown_source", "missing_check", "duplicate", "too_many", "approval", "missing_verification",
])
def test_unreviewed_or_invalid_recommendations_fail_closed(corruption):
    _, original = make_assessment()
    output = output_with_recommendation(original)
    items = output["draft"]["recommendations"]
    if corruption == "unknown_source":
        items[0]["source_ids"] = ["document:other-case"]
    elif corruption == "missing_check":
        output["review"]["checks"].pop()
    elif corruption == "duplicate":
        items.append(deepcopy(items[0]))
    elif corruption == "too_many":
        items.extend([{**recommendation(), "id": f"proposal_{index}"} for index in range(8)])
    elif corruption == "approval":
        items[0]["approved"] = True
    elif corruption == "missing_verification":
        items[0].pop("verification")
    with pytest.raises(dpia_ai.InvalidAIDraft):
        apply(original, output)


@pytest.mark.parametrize(
    "corruption",
    [
        "section_duplicate",
        "risk_duplicate",
        "unknown_source",
        "unknown_summary_source",
        "extra_score",
        "approval",
        "missing_check",
        "unknown_check",
        "probability_nan",
        "protected_text",
        "false_flag",
    ],
)
def test_untrusted_worker_contract_fails_closed(corruption):
    _, original = make_assessment()
    output = worker_output(original)
    draft = output["draft"]
    if corruption == "section_duplicate":
        draft["sections"][1]["id"] = draft["sections"][0]["id"]
    elif corruption == "risk_duplicate":
        draft["risks"][1]["id"] = draft["risks"][0]["id"]
    elif corruption == "unknown_source":
        draft["risks"][0]["source_ids"] = ["document:other-case"]
    elif corruption == "unknown_summary_source":
        draft["summary_source_ids"] = ["invented"]
    elif corruption == "extra_score":
        draft["risks"][0]["risk_score"] = 1
    elif corruption == "approval":
        output["review"]["status"] = "approved"
    elif corruption == "missing_check":
        output["review"]["checks"].pop()
    elif corruption == "unknown_check":
        output["review"]["checks"][0]["section_ids"] = ["unknown"]
    elif corruption == "probability_nan":
        output["review"]["checks"][0]["probability"] = float("nan")
    elif corruption == "protected_text":
        protected = next(
            s
            for s in original.sections
            if s.review_status in {"missing_information", "not_applicable"}
        )
        next(s for s in draft["sections"] if s["id"] == protected.id)[
            "text"
        ] = "Uafklaret hjemmel er nu godkendt."
    elif corruption == "false_flag":
        output["review"]["checks"][0]["probability"] = 0.9
    with pytest.raises(dpia_ai.InvalidAIDraft):
        apply(original, output)


def test_worker_errors_never_expose_stdout_stderr_or_keys(monkeypatch):
    private = "SECRET_SHOULD_NEVER_BE_RETURNED"
    monkeypatch.setattr(
        dpia_ai.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout=json.dumps(
                {"error": {"code": "paid_credits_required", "message": private}}
            ),
            stderr=private,
        ),
    )
    with pytest.raises(dpia_ai.AIGenerationUnavailable) as exc:
        dpia_ai._run_worker({}, timeout=1)
    assert "kreditter" in str(exc.value)
    assert private not in str(exc.value)

    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("node", 1, stderr=private)

    monkeypatch.setattr(dpia_ai.subprocess, "run", timeout)
    with pytest.raises(dpia_ai.AIGenerationUnavailable) as exc:
        dpia_ai._run_worker({}, timeout=1)
    assert private not in str(exc.value)


def test_status_only_exposes_fixed_fields(monkeypatch):
    monkeypatch.setattr(
        dpia_ai,
        "_run_worker",
        lambda *a, **kw: {
            "configured": True,
            "model": "openai/gpt-5.5",
            "evaluator_model": "typesafe-ai/jev",
            "key": "SECRET",
        },
    )
    assert dpia_ai.gateway_status() == {
        "configured": True,
        "model": "openai/gpt-5.5",
        "evaluator_model": "typesafe-ai/jev",
    }


@pytest.fixture
def database(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'drafts.db'}", connect_args={"timeout": 10}
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    engine.dispose()


def create_base(factory, *, linked=True):
    request, result = make_assessment()
    with factory() as db:
        case = Case(
            id=str(uuid4()),
            case_id="SYNTHETIC-CASE",
            title="Syntetisk testsag",
            status="godkendt",
        )
        db.add(case)
        db.flush()
        save_assessment(
            db,
            assessment_id=result.id,
            created_at=result.created_at,
            request_payload=request.model_dump(mode="json"),
            result_payload=result.model_dump(mode="json"),
            case_db_id=case.id if linked else None,
        )
        db.commit()
        return case.id, result.id


def test_concurrent_case_versions_are_distinct_without_changing_case_state(database):
    case_id, original_id = create_base(database)
    barrier = Barrier(2)
    request, result = make_assessment()
    with database() as db:
        previous = deepcopy(db.get(DPIAAssessmentRecord, original_id).result_payload)
        case_before = db.get(Case, case_id).to_dict()

    def save_one(_):
        with database() as db:
            barrier.wait(timeout=5)
            saved = save_assessment(
                db,
                assessment_id=str(uuid4()),
                created_at=datetime.now(UTC),
                request_payload=request.model_dump(mode="json"),
                result_payload=result.model_dump(mode="json"),
                case_db_id=case_id,
            )
            db.commit()
            return saved.version

    with ThreadPoolExecutor(max_workers=2) as pool:
        versions = list(pool.map(save_one, range(2)))
    assert sorted(versions) == [2, 3]
    with database() as db:
        assert db.get(DPIAAssessmentRecord, original_id).result_payload == previous
        assert db.get(Case, case_id).to_dict() == case_before


@pytest.fixture
def api(database, monkeypatch):
    def get_db():
        with database() as db:
            yield db

    prior = dict(main.app.dependency_overrides)
    main.app.dependency_overrides[main.get_db] = get_db
    monkeypatch.setattr(main.limiter, "enabled", False)
    client = TestClient(main.app)
    yield client
    main.app.dependency_overrides.clear()
    main.app.dependency_overrides.update(prior)


def test_api_creates_addressable_version_and_downloads_exact_snapshot(
    api, database, monkeypatch
):
    case_id, base_id = create_base(database)
    original = api.get(f"/api/dpia/assessments/{base_id}").json()
    captured = {}

    def worker(payload, **kwargs):
        captured.update(payload)
        return worker_output(
            dpia_ai.DPIAAssessmentResponse.model_validate(payload["result"])
        )

    monkeypatch.setattr(dpia_ai, "_run_worker", worker)
    response = api.post(f"/api/dpia/assessments/{base_id}/generate")
    assert response.status_code == 201, response.text
    generated = response.json()
    assert (
        generated["version"],
        generated["parent_assessment_id"],
        generated["case_db_id"],
    ) == (2, base_id, case_id)
    assert generated["id"] != base_id
    assert api.get(f"/api/dpia/assessments/{generated['id']}").json() == generated
    assert api.get(f"/api/dpia/assessments/{base_id}").json() == original
    assert captured["sources"] and captured["request"]["project_name"]
    for extension in ("docx", "xlsx"):
        exported = api.get(
            f"/api/dpia/assessments/{generated['id']}/export.{extension}"
        )
        assert exported.status_code == 200, exported.text
        assert exported.content.startswith(b"PK")
    with database() as db:
        assert db.get(Case, case_id).status == "godkendt"


def save_human_revision(factory, base_id):
    from src.services.dpia_revisions import RevisionInput, revise_assessment

    with factory() as db:
        base = db.get(DPIAAssessmentRecord, base_id)
        section = next(
            item for item in base.result_payload["sections"]
            if item["review_status"] == "requires_review"
        )
        revision = revise_assessment(
            db, base_id,
            RevisionInput.model_validate({
                "request_id": str(uuid4()),
                "note": "En medarbejder præciserede afsnittet under gennemgangen.",
                "changes": [{
                    "kind": "section", "target_id": section["id"], "field": "text",
                    "text": "Den nyeste faglige præcisering skal bevares i rapporten.",
                    "source_ids": [],
                }],
            }),
            actor_id="reviewer", actor_name="Faglig reviewer",
        )
        db.commit()
        return revision.id, deepcopy(revision.result_payload)


def test_ai_rejects_historical_base_without_calling_model(api, database, monkeypatch):
    _, base_id = create_base(database)
    newest_id, newest_snapshot = save_human_revision(database, base_id)
    called = []

    def unexpected_worker(*args, **kwargs):
        called.append(True)
        raise AssertionError("Historical versions must not start model calls")

    monkeypatch.setattr(dpia_ai, "_run_worker", unexpected_worker)
    response = api.post(f"/api/dpia/assessments/{base_id}/generate")
    assert response.status_code == 409, response.text
    assert called == []
    with database() as db:
        assert db.query(DPIAAssessmentRecord).count() == 2
        assert db.get(DPIAAssessmentRecord, newest_id).result_payload == newest_snapshot


def test_slow_ai_cannot_overtake_human_revision_saved_during_model_call(
    api, database, monkeypatch
):
    case_id, base_id = create_base(database)
    original = api.get(f"/api/dpia/assessments/{base_id}").json()
    completed = {}

    def worker(payload, **kwargs):
        # A separate real transaction commits while the route is waiting on
        # its model. No live model or production database is involved.
        revision_id, snapshot = save_human_revision(database, base_id)
        completed.update(id=revision_id, snapshot=snapshot)
        return worker_output(
            dpia_ai.DPIAAssessmentResponse.model_validate(payload["result"])
        )

    monkeypatch.setattr(dpia_ai, "_run_worker", worker)
    response = api.post(f"/api/dpia/assessments/{base_id}/generate")
    assert response.status_code == 409, response.text
    assert "nyere version" in response.json()["detail"]
    assert api.get(f"/api/dpia/assessments/{base_id}").json() == original
    with database() as db:
        assert db.query(DPIAAssessmentRecord).count() == 2
        assert db.get(DPIAAssessmentRecord, completed["id"]).result_payload == completed["snapshot"]
        assert db.get(Case, case_id).status == "godkendt"
        assert db.query(DPIAAssessmentRecord).count() == 2


def test_unlinked_and_failed_generations_do_not_create_records(
    api, database, monkeypatch
):
    _, base_id = create_base(database, linked=False)
    assert api.post(f"/api/dpia/assessments/{base_id}/generate").status_code == 409
    with database() as db:
        row = db.get(DPIAAssessmentRecord, base_id)
        row.case_db_id = db.query(Case).first().id
        db.commit()
    monkeypatch.setattr(
        dpia_ai, "_run_worker", lambda *args, **kwargs: {"unsafe": "SECRET"}
    )
    response = api.post(f"/api/dpia/assessments/{base_id}/generate")
    assert response.status_code == 502
    assert "SECRET" not in response.text
    with database() as db:
        assert db.query(DPIAAssessmentRecord).count() == 1


def test_generate_and_status_require_existing_case_role(api, monkeypatch):
    main.app.dependency_overrides[get_current_user] = lambda: UserPrincipal(
        oid="synthetic",
        name="Test",
        roles=[],
        auth_mode="development",
        identity_assurance="development_only",
    )
    assert api.post(f"/api/dpia/assessments/{uuid4()}/generate").status_code == 403
    assert api.get("/api/dpia/ai/status").status_code == 403


def test_document_sources_are_case_pinned_verified_and_disclose_omissions(monkeypatch):
    import src.database.document_bank as bank
    import src.services.document_bank_storage as storage

    seen = []

    def link(id, filename, checksum):
        return SimpleNamespace(
            link_role="evidence",
            document_version_id=id,
            version=SimpleNamespace(
                version_metadata={},
                id=id,
                original_filename=filename,
                version_number=2,
                size_bytes=20,
                storage_key=id,
                content_sha256=checksum,
            ),
            document=SimpleNamespace(title=id),
        )

    good = b"Syntetisk kilde fra denne sags version 2."
    pinned = [
        link("this-version", "evidence.txt", sha256(good).hexdigest()),
        link("broken", "bad.txt", "wrong"),
        link("sheet", "risk.xlsx", "ignored"),
    ]

    def list_links(db, case_id):
        assert case_id == "this-case"
        return pinned

    def read(key, *, expected_sha256):
        seen.append(key)
        if expected_sha256 != sha256(good).hexdigest():
            raise ValueError("PRIVATE_PARSER_DETAIL")
        return good

    monkeypatch.setattr(bank, "list_case_documents", list_links)
    monkeypatch.setattr(storage, "read_document_bytes", read)
    sources = []
    limitations = dpia_ai.add_case_document_sources(None, "this-case", sources)
    assert [source["id"] for source in sources] == ["document:this-version"]
    assert sources[0]["version"] == "2" and sources[0]["text"] == good.decode()
    assert seen == ["this-version", "broken"]
    assert any("xlsx" in item for item in limitations)
    assert "PRIVATE_PARSER_DETAIL" not in str(limitations)


def test_regeneration_does_not_recursively_resend_prior_evidence(monkeypatch):
    request, original = make_assessment()
    original.ai_generation = {"sources": [{"text": "OLD_SNAPSHOT_MARKER"}]}
    original.reading_guide = {"conclusion": "DERIVED_GUIDE_MARKER"}

    def worker(payload, **kwargs):
        assert "ai_generation" not in payload["result"]
        assert "reading_guide" not in payload["result"]
        assert "OLD_SNAPSHOT_MARKER" not in json.dumps(payload)
        assert "DERIVED_GUIDE_MARKER" not in json.dumps(payload)
        return worker_output(original)

    monkeypatch.setattr(dpia_ai, "_run_worker", worker)
    dpia_ai.generate_dpia_draft(
        request,
        original,
        dpia_ai.build_sources(request, original),
        assessment_id=str(uuid4()),
        created_at=datetime.now(UTC),
        case_db_id=str(uuid4()),
    )


def test_public_source_provenance_survives_snapshot_but_case_outputs_are_never_evidence(
    monkeypatch,
):
    import src.database.document_bank as bank
    import src.services.document_bank_storage as storage

    content = b"Public supplier DPA states the processor obligations."
    checksum = sha256(content).hexdigest()
    metadata = {
        "source_url": "https://supplier.example/legal/dpa",
        "retrieved_at": "2026-09-20T12:00:00Z",
        "source_kind": "public_vendor_document",
        "original_sha256": "a" * 64,
        "arbitrary_private_metadata": "DO_NOT_COPY",
    }

    def link(identifier, role):
        return SimpleNamespace(
            link_role=role,
            document_version_id=identifier,
            version=SimpleNamespace(
                id=identifier,
                original_filename="source.txt",
                version_number=3,
                size_bytes=len(content),
                storage_key=identifier,
                content_sha256=checksum,
                version_metadata=metadata,
            ),
            document=SimpleNamespace(title="Public supplier DPA"),
        )

    links = [
        link("dpa", "basis"),
        link("previous-report", "evidence"),
        link("previous-report", "output"),
        link("test-receipt", "output"),
    ]
    reads = []
    monkeypatch.setattr(bank, "list_case_documents", lambda *a: links)

    def read(key, **kwargs):
        reads.append(key)
        return content

    monkeypatch.setattr(storage, "read_document_bytes", read)
    request, original = make_assessment()
    sources = dpia_ai.build_sources(request, original)
    limitations = dpia_ai.add_case_document_sources(None, "synthetic-case", sources)
    assert reads == ["dpa"]
    source = next(item for item in sources if item["id"] == "document:dpa")
    assert source["source_url"] == metadata["source_url"]
    assert source["retrieved_at"] == metadata["retrieved_at"]
    assert source["version"] == "3" and source["checksum"] == checksum
    assert not {
        "source_kind",
        "original_sha256",
        "arbitrary_private_metadata",
    }.intersection(source)
    assert any("sagsoutput" in item for item in limitations)
    result = dpia_ai.apply_ai_draft(
        original,
        worker_output(original),
        sources,
        assessment_id=str(uuid4()),
        created_at=datetime.now(UTC),
        case_db_id="synthetic-case",
    )
    assert source in result.ai_generation["sources"]
    for unsafe_url in [
        "https://user:password@supplier.example/dpa",
        "https://user@supplier.example/dpa",
        "javascript:alert(1)",
        "file:///private/file",
        "https://supplier.example:bad/dpa",
        "https://supplier.example/\nsecret",
    ]:
        assert (
            dpia_ai._document_source_provenance({**metadata, "source_url": unsafe_url})
            == {}
        )


@pytest.mark.parametrize(
    "excerpt_count,total_chars,expected_count", [(245, 173_966, 245), (401, 4_010, 400)]
)
def test_document_excerpt_budget_preserves_large_complete_packs_and_discloses_limit(
    monkeypatch, excerpt_count, total_chars, expected_count
):
    import src.database.document_bank as bank
    import src.services.document_bank_storage as storage
    import src.services.source_material as material

    groups = [[] for _ in range(8)]
    for index in range(excerpt_count):
        groups[index % 8].append(
            {
                "text": "x"
                * (
                    total_chars // excerpt_count + (index < total_chars % excerpt_count)
                ),
                "locator": f"Afsnit {index + 1}",
            }
        )
    links = []
    expected_ids = []
    for index, excerpts in enumerate(groups):
        key = f"version-{index}"
        links.append(
            SimpleNamespace(
                link_role="evidence",
                document_version_id=key,
                document=SimpleNamespace(title=f"Dokument {index + 1}"),
                version=SimpleNamespace(
                    id=key,
                    original_filename=f"document-{index}.pdf",
                    version_metadata={"source_material": True},
                    size_bytes=1000,
                    version_number=1,
                    storage_key=str(index),
                    content_sha256=sha256(str(index).encode()).hexdigest(),
                ),
            )
        )
        expected_ids.extend(
            f"document:{key}:{part + 1}" for part in range(len(excerpts))
        )

    def read(key, *, expected_sha256):
        assert expected_sha256 == sha256(key.encode()).hexdigest()
        return key.encode()

    monkeypatch.setattr(bank, "list_case_documents", lambda *args: links)
    monkeypatch.setattr(storage, "read_document_bytes", read)
    monkeypatch.setattr(
        material,
        "extract_source",
        lambda content, filename: SimpleNamespace(
            excerpts=groups[int(content)], warnings=[]
        ),
    )
    sources = []
    limitations = dpia_ai.add_case_document_sources(None, "case", sources)
    assert len(sources) == expected_count
    assert [source["id"] for source in sources] == expected_ids[:expected_count]
    if excerpt_count <= dpia_ai.MAX_DOCUMENT_SOURCE_EXCERPTS:
        assert sum(len(source["text"]) for source in sources) == total_chars
        assert not any("afkortet" in note or "udeladt" in note for note in limitations)
    else:
        assert any("400 kildeuddrag" in note for note in limitations)
