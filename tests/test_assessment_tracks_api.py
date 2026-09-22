from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from src.api.assessment_tracks import ASSESSMENT_ACCESS, router
from src.auth import UserPrincipal
from src.database.case_workspace import CaseAction, CaseWorkspaceReference
from src.database.cases import create_case
from src.database.connection import Base, get_db, get_test_engine


@pytest.fixture()
def api() -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = get_test_engine()
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    principal = UserPrincipal(
        oid="test-worker-oid",
        name="Test Sagsbehandler",
        username="worker@example.invalid",
        roles=["Hammeren.Sagsbehandler"],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )

    app = FastAPI()
    app.include_router(router)

    def override_db() -> Generator[Session, None, None]:
        session = testing_session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[ASSESSMENT_ACCESS] = lambda: principal

    with TestClient(app) as client:
        yield client, testing_session
    Base.metadata.drop_all(engine)
    engine.dispose()


def _ai_payload(case_id: str, *, prohibited: bool = False) -> dict:
    return {
        "case_id": case_id,
        "system_name": "Kommunal assistent",
        "intended_purpose": (
            "At hjælpe medarbejdere med at finde relevante interne arbejdsgange."
        ),
        "deployment_context": (
            "Systemet anvendes internt af uddannede medarbejdere med menneskelig kontrol."
        ),
        "is_ai_system": True,
        "union_nexus": True,
        "scope_exclusion": "none",
        "declared_roles": ["deployer"],
        "uses_system_under_own_authority": True,
        "article_5_practices": (
            ["social_scoring_with_detrimental_treatment"] if prohibited else []
        ),
    }


def _fria_payload(case_id: str) -> dict:
    return {
        "case_id": case_id,
        "system_name": "Kommunal assistent",
        "purpose": (
            "At hjælpe medarbejdere med en ensartet og rettidig kommunal sagsbehandling."
        ),
        "deployment_context": (
            "Systemet foreslår arbejdsgange, mens medarbejderen træffer beslutningen."
        ),
        "use_period_and_frequency": (
            "Løbende brug på hverdage i en afgrænset pilot på seks måneder."
        ),
        "makes_or_supports_decisions_about_people": True,
        "decision_owner": "Fagchefen for Borgerservice",
        "rights_or_dpo_expert_involved": True,
        "affected_groups": [
            {
                "id": "citizens",
                "name": "Borgere",
                "how_affected": (
                    "Borgernes sager kan blive prioriteret med støtte fra systemet."
                ),
                "estimated_number": 500,
                "vulnerability_factors": ["none_identified"],
                "consulted": False,
            }
        ],
        "rights_impacts": [
            {
                "id": "privacy-1",
                "right": "private_life_and_data_protection",
                "impact_description": (
                    "Uvedkommende adgang kan eksponere fortrolige sagsoplysninger."
                ),
                "harm_scenarios": [
                    "En medarbejder ser oplysninger uden et arbejdsbetinget behov."
                ],
                "affected_group_ids": ["citizens"],
                "evidence_references": ["DPIA-2026-14 og adgangstest AC-02"],
                "severity": 2,
                "likelihood": 2,
                "measure_ids": ["access-control"],
                "expected_residual_severity": 1,
                "expected_residual_likelihood": 2,
            }
        ],
        "necessity": {
            "legitimate_objective": (
                "At reducere fejl og ventetid i den kommunale sagsbehandling."
            ),
            "legal_basis_reference": "Forvaltningsloven og relevant sektorlov.",
            "suitability_reasoning": (
                "En pilot måler om forslagene reducerer fejl uden automatiske afgørelser."
            ),
            "less_intrusive_alternatives": [
                "Manuel tjekliste uden behandling i et AI-system."
            ],
            "chosen_option_reasoning": (
                "Piloten er valgt, fordi manuel kontrol bevares og data afgrænses."
            ),
            "data_and_function_minimisation": (
                "Kun nødvendige sagsfelter anvendes, og systemet kan ikke afsende afgørelser."
            ),
        },
        "proportionality": {
            "expected_public_benefit": (
                "Færre fejl og hurtigere svar til borgere i de afgrænsede sagstyper."
            ),
            "expected_rights_cost": (
                "Behandling af sagsoplysninger kan øge risikoen for uvedkommende adgang."
            ),
            "balancing_reasoning": (
                "Nytten opvejer det begrænsede indgreb, fordi anvendelsen er "
                "afgrænset, kontrolleret og kan stoppes straks."
            ),
            "conclusion": "proportionate",
        },
        "human_oversight": {
            "enabled": True,
            "responsible_role": (
                "Uddannet kommunal sagsbehandler med beslutningskompetence"
            ),
            "can_override_or_stop": True,
            "sufficient_time_and_information": True,
            "competence_and_training": (
                "Obligatorisk kursus og årlig opfølgning dokumenteres i LMS."
            ),
            "review_and_override_procedure": (
                "Alle forslag kontrolleres mod primærkilden og kan tilsidesættes."
            ),
            "automation_bias_controls": (
                "UI viser usikkerhed og kræver en aktiv menneskelig bekræftelse."
            ),
        },
        "complaints_and_remedies": {
            "people_are_informed": True,
            "accessible_complaint_channel": True,
            "human_reconsideration_available": True,
            "appeal_or_independent_review_available": True,
            "contact_point": "Digital post eller Borgerservice",
            "response_target": "Kvittering inden fem arbejdsdage",
            "accessibility_accommodations": (
                "Telefon, fysisk fremmøde og relevant sproglig hjælp tilbydes."
            ),
        },
        "measures": [
            {
                "id": "access-control",
                "title": "Rollebaseret adgang",
                "description": (
                    "Adgang afgrænses efter arbejdsfunktion og kontrolleres kvartalsvist."
                ),
                "owner": "Systemejer",
                "status": "implemented_verified",
                "evidence": (
                    "Adgangstest AC-02 er godkendt og signeret af sikkerhedsansvarlig."
                ),
            }
        ],
        "monitoring": {
            "responsible_owner": "Systemejer",
            "metrics": ["Fejl fordelt på berørt gruppe"],
            "review_date": "2027-12-31",
            "incident_and_escalation_process": (
                "Alvorlige hændelser stopper piloten og eskaleres til DPO og fagchef."
            ),
            "change_triggers": ["Ny modelversion"],
        },
    }


def test_ai_act_endpoint_resolves_external_case_and_persists_snapshot_and_actions(api):
    client, session_factory = api
    with session_factory() as session:
        case = create_case(
            session,
            case_id="K-2026-0990",
            title="AI i Borgerservice",
        )
        case_db_id = case.id
        session.commit()

    response = client.post(
        "/api/ai-act/assess",
        json=_ai_payload("K-2026-0990", prohibited=True),
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["classification"] == "prohibited"

    with session_factory() as session:
        references = session.query(CaseWorkspaceReference).all()
        actions = session.query(CaseAction).all()
        assert len(references) == 1
        assert references[0].case_db_id == case_db_id
        assert references[0].reference_type == "ai_act_assessment"
        assert references[0].source_version == payload["meta"]["methodology_version"]
        assert references[0].details["request"]["case_id"] == "K-2026-0990"
        assert references[0].details["result"]["classification"] == "prohibited"
        assert references[0].details["actor"]["oid"] == "test-worker-oid"
        assert any(action.priority == "critical" for action in actions)
        assert all(
            action.source_reference_id == payload["meta"]["assessment_id"]
            for action in actions
        )


def test_fria_endpoint_accepts_internal_case_id_and_completes_verified_measure(api):
    client, session_factory = api
    with session_factory() as session:
        case = create_case(
            session,
            case_id="K-2026-0991",
            title="Grundrettigheder i Borgerservice",
        )
        internal_id = case.id
        session.commit()

    response = client.post("/api/fria/assess", json=_fria_payload(internal_id))
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["decision_readiness"] == "ready_for_human_decision"

    with session_factory() as session:
        reference = (
            session.query(CaseWorkspaceReference)
            .filter_by(case_db_id=internal_id, reference_type="fria_assessment")
            .one()
        )
        measure = (
            session.query(CaseAction).filter(CaseAction.category == "measure").one()
        )
        assert reference.case_db_id == internal_id
        assert reference.reference_type == "fria_assessment"
        assert measure.status == "completed"
        assert measure.owner == "Systemejer"
        assert "AC-02" in measure.evidence_note
        event = (
            session.query(CaseWorkspaceReference)
            .filter_by(case_db_id=internal_id, reference_type="external_record")
            .one()
        )
        assert event.created_by == "Test Sagsbehandler"
        assert event.details["workspace_event"]["actor_id"] == "test-worker-oid"
        assert event.details["workspace_event"]["actor_kind"] == "human"
        assert event.details["workspace_event"]["target_id"] == measure.id
        assert event.details["workspace_event"]["after"]["status"] == "completed"
        assert event.created_at is not None


@pytest.mark.parametrize(
    ("setup_count", "case_id", "expected_status"),
    [
        (0, "K-2026-DOES-NOT-EXIST", 404),
        (2, "K-2026-DUPLICATE", 409),
    ],
)
def test_case_resolution_rejects_missing_and_ambiguous_external_ids(
    api,
    setup_count,
    case_id,
    expected_status,
):
    client, session_factory = api
    with session_factory() as session:
        for index in range(setup_count):
            create_case(session, case_id=case_id, title=f"Duplikat {index + 1}")
        session.commit()

    response = client.post("/api/ai-act/assess", json=_ai_payload(case_id))
    assert response.status_code == expected_status
