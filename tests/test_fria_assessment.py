from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from src.services.fria_assessment import FRIAAssessmentRequest, assess_fria, risk_band


ASSESSMENT_TIME = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)


def valid_payload(**overrides):
    payload = {
        "case_id": "K-2026-0200",
        "system_name": "Kommunal assistent",
        "purpose": "At hjælpe medarbejdere med en ensartet og rettidig kommunal sagsbehandling.",
        "deployment_context": "Systemet foreslår relevante arbejdsgange, mens medarbejderen træffer beslutningen.",
        "use_period_and_frequency": "Løbende brug på hverdage i en afgrænset pilot på seks måneder.",
        "makes_or_supports_decisions_about_people": True,
        "decision_owner": "Fagchefen for Borgerservice",
        "rights_or_dpo_expert_involved": True,
        "affected_groups": [
            {
                "id": "citizens",
                "name": "Borgere",
                "how_affected": "Borgernes sager kan blive prioriteret eller beskrevet med støtte fra systemet.",
                "estimated_number": 500,
                "vulnerability_factors": ["none_identified"],
                "consulted": False,
            }
        ],
        "rights_impacts": [
            {
                "id": "privacy-1",
                "right": "private_life_and_data_protection",
                "impact_description": "Uvedkommende adgang eller fejlagtig sammenstilling kan eksponere sagsoplysninger.",
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
            "legitimate_objective": "At reducere fejl og ventetid i den kommunale sagsbehandling.",
            "legal_basis_reference": "Forvaltningsloven og den konkrete sektorloven verificeres af jurist.",
            "suitability_reasoning": "En afgrænset pilot måler, om forslagene faktisk reducerer fejl uden automatiske afgørelser.",
            "less_intrusive_alternatives": [
                "Manuel tjekliste uden behandling i et AI-system."
            ],
            "chosen_option_reasoning": "Piloten er valgt, fordi manuel kontrol bevares og datamængden er afgrænset.",
            "data_and_function_minimisation": "Kun nødvendige sagsfelter anvendes, og systemet kan ikke afsende afgørelser.",
        },
        "proportionality": {
            "expected_public_benefit": "Færre fejl og hurtigere svar til borgere i de afgrænsede sagstyper.",
            "expected_rights_cost": "Behandling af sagsoplysninger kan øge risikoen for uvedkommende adgang.",
            "balancing_reasoning": "Nytten vurderes at opveje det begrænsede indgreb, fordi anvendelsen er frivilligt kontrolleret, afgrænset og kan stoppes straks.",
            "conclusion": "proportionate",
        },
        "human_oversight": {
            "enabled": True,
            "responsible_role": "Uddannet kommunal sagsbehandler med beslutningskompetence",
            "can_override_or_stop": True,
            "sufficient_time_and_information": True,
            "competence_and_training": "Obligatorisk kursus, cases og årlig opfølgning dokumenteres i LMS.",
            "review_and_override_procedure": "Alle forslag kontrolleres mod primærkilden og kan tilsidesættes uden begrundelsesbyrde.",
            "automation_bias_controls": "UI viser usikkerhed, kræver aktiv bekræftelse og måler systematisk tilsidesættelser.",
        },
        "complaints_and_remedies": {
            "people_are_informed": True,
            "accessible_complaint_channel": True,
            "human_reconsideration_available": True,
            "appeal_or_independent_review_available": True,
            "contact_point": "Digital post eller Borgerservice",
            "response_target": "Kvittering inden fem arbejdsdage",
            "accessibility_accommodations": "Telefon, fysisk fremmøde, læseadgang og relevant sproglig hjælp tilbydes.",
        },
        "measures": [
            {
                "id": "access-control",
                "title": "Rollebaseret adgang",
                "description": "Adgang afgrænses efter arbejdsfunktion og kontrolleres kvartalsvist.",
                "owner": "Systemejer",
                "status": "implemented_verified",
                "evidence": "Adgangstest AC-02 er godkendt og signeret af sikkerhedsansvarlig.",
            }
        ],
        "monitoring": {
            "responsible_owner": "Systemejer",
            "metrics": [
                "Fejl fordelt på berørt gruppe",
                "Andel menneskelige tilsidesættelser",
            ],
            "review_date": "2027-02-28",
            "incident_and_escalation_process": "Alvorlige hændelser stopper piloten og eskaleres til DPO og fagchef.",
            "change_triggers": [
                "Nyt formål",
                "Ny modelversion",
                "Væsentlig stigning i fejl",
            ],
        },
    }
    payload.update(overrides)
    return payload


def assess(payload=None):
    request = FRIAAssessmentRequest.model_validate(payload or valid_payload())
    return assess_fria(
        request,
        assessment_id="fria-test-1",
        assessed_at=ASSESSMENT_TIME,
    )


def test_complete_low_residual_assessment_is_only_ready_for_human_decision():
    result = assess()
    assert result.decision_readiness == "ready_for_human_decision"
    assert result.requires_human_approval is True
    assert result.completeness == 100
    assert result.overall_inherent_risk == "medium"
    assert result.overall_residual_risk == "low"
    assert result.rights_findings[0].residual_score == 2
    assert result.rights_findings[0].effective_measure_ids == ["access-control"]
    assert result.necessity_demonstrated is True
    assert result.human_oversight_ready is True
    assert result.complaints_and_remedies_ready is True
    assert result.affected_groups[0].id == "citizens"
    assert result.measures[0].id == "access-control"
    assert "ikke i sig selv dansk ret" in result.meta.legal_notice


def test_unverified_measure_cannot_reduce_calculated_residual_risk():
    payload = valid_payload()
    payload["rights_impacts"][0].update(
        severity=4,
        likelihood=4,
        expected_residual_severity=2,
        expected_residual_likelihood=2,
    )
    payload["measures"][0].update(
        status="in_progress",
        evidence="",
        due_date="2026-12-01",
    )
    result = assess(payload)
    finding = result.rights_findings[0]
    assert finding.claimed_residual_score == 4
    assert finding.residual_score == 16
    assert finding.residual_risk == "very_high"
    assert result.decision_readiness == "blocked"
    assert finding.unverified_measure_ids == ["access-control"]


def test_missing_necessity_and_remedies_fail_closed():
    payload = valid_payload()
    payload["necessity"]["legal_basis_reference"] = ""
    payload["necessity"]["less_intrusive_alternatives"] = []
    payload["complaints_and_remedies"] = {
        "people_are_informed": False,
        "accessible_complaint_channel": False,
        "human_reconsideration_available": False,
        "appeal_or_independent_review_available": False,
    }
    result = assess(payload)
    assert result.decision_readiness == "blocked"
    assert result.completeness < 100
    assert any("retsgrundlag" in blocker for blocker in result.blockers)
    assert any("mindre indgribende" in blocker for blocker in result.blockers)
    assert any("klagekanal" in blocker for blocker in result.blockers)


def test_vulnerable_group_without_consultation_requires_action():
    payload = valid_payload()
    payload["affected_groups"][0]["vulnerability_factors"] = [
        "dependency_on_public_service"
    ]
    result = assess(payload)
    assert result.decision_readiness == "requires_action"
    assert result.completeness == 90
    assert any("sårbare gruppe" in action for action in result.action_items)


def test_high_impact_without_meaningful_human_oversight_is_blocked():
    payload = valid_payload()
    payload["rights_impacts"][0].update(
        severity=4,
        likelihood=3,
        expected_residual_severity=4,
        expected_residual_likelihood=3,
        measure_ids=[],
    )
    payload["human_oversight"] = {
        "enabled": False,
        "can_override_or_stop": False,
        "sufficient_time_and_information": False,
    }
    result = assess(payload)
    assert result.decision_readiness == "blocked"
    assert any("menneskeligt tilsyn" in blocker for blocker in result.blockers)
    assert any("tilsidesætte" in blocker for blocker in result.blockers)


def test_expired_review_date_requires_action_and_reduces_completeness():
    payload = valid_payload()
    payload["monitoring"]["review_date"] = "2026-08-31"
    result = assess(payload)
    assert result.decision_readiness == "requires_action"
    assert result.completeness == 90
    assert any("fremtidig dato" in action for action in result.action_items)


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (1, "low"),
        (3, "low"),
        (4, "medium"),
        (7, "medium"),
        (8, "high"),
        (11, "high"),
        (12, "very_high"),
        (16, "very_high"),
    ],
)
def test_risk_matrix_boundaries(score, expected):
    assert risk_band(score) == expected


@pytest.mark.parametrize(
    "mutator",
    [
        lambda payload: payload["rights_impacts"][0].update(
            affected_group_ids=["unknown"]
        ),
        lambda payload: payload["rights_impacts"][0].update(measure_ids=["unknown"]),
        lambda payload: payload["rights_impacts"][0].update(
            measure_ids=[], expected_residual_severity=1
        ),
        lambda payload: payload["measures"][0].update(evidence=""),
        lambda payload: payload["affected_groups"][0].update(unexpected="must fail"),
    ],
)
def test_invalid_references_or_unsubstantiated_reductions_are_rejected(mutator):
    payload = valid_payload()
    mutator(payload)
    with pytest.raises(ValidationError):
        FRIAAssessmentRequest.model_validate(payload)
