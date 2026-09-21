from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from src.services.ai_act_assessment import AIActAssessmentRequest, assess_ai_act


ASSESSMENT_TIME = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)


def valid_payload(**overrides):
    payload = {
        "case_id": "K-2026-0200",
        "system_name": "Kommunal assistent",
        "intended_purpose": "At hjælpe medarbejdere med at finde relevante interne arbejdsgange.",
        "deployment_context": "Systemet anvendes internt af uddannede medarbejdere med menneskelig kontrol.",
        "is_ai_system": True,
        "union_nexus": True,
        "scope_exclusion": "none",
        "declared_roles": ["deployer"],
        "uses_system_under_own_authority": True,
    }
    payload.update(overrides)
    return payload


def assess(**overrides):
    request = AIActAssessmentRequest.model_validate(valid_payload(**overrides))
    return assess_ai_act(
        request,
        assessment_id="ai-act-test-1",
        assessed_at=ASSESSMENT_TIME,
    )


def test_minimal_risk_still_returns_role_and_ai_literacy_obligation():
    result = assess()
    assert result.classification == "minimal_risk"
    assert result.workflow_status == "ready_for_legal_review"
    assert [role.role for role in result.roles] == ["deployer"]
    assert {item.id for item in result.obligations} == {"ai-literacy"}
    assert "ikke juridisk rådgivning" in result.meta.legal_notice
    assert result.meta.case_id == "K-2026-0200"


def test_article_5_prohibition_overrides_high_risk_and_transparency():
    result = assess(
        declared_roles=["provider", "deployer"],
        article_5_practices=["social_scoring_with_detrimental_treatment"],
        annex_iii_use_cases=["essential_public_services_or_benefits"],
        materially_influences_decision_outcome=True,
        significant_risk_to_health_safety_or_fundamental_rights=True,
        transparency_use_cases=["direct_interaction_with_people"],
    )
    assert result.classification == "prohibited"
    assert result.workflow_status == "blocked"
    assert "stop-prohibited-practice" in {item.id for item in result.obligations}
    assert any(finding.effect == "high_risk" for finding in result.findings)
    assert any(finding.effect == "transparency" for finding in result.findings)


def test_claimed_article_5_exception_stays_blocked_and_keeps_ai_literacy():
    result = assess(
        article_5_practices=["emotion_inference_in_workplace_or_education"],
        article_5_exception_claimed=True,
        article_5_exception_basis=(
            "Den ansvarlige anfører et dokumenteret medicinsk sikkerhedsformål."
        ),
    )
    assert result.classification == "undetermined"
    assert result.workflow_status == "blocked"
    assert {"ai-literacy", "stop-prohibited-practice"}.issubset(
        {item.id for item in result.obligations}
    )


def test_public_authority_deployer_of_annex_iii_system_gets_role_specific_duties_and_fria():
    result = assess(
        declared_roles=["provider", "deployer"],
        develops_or_has_developed_system=True,
        places_or_puts_into_service_under_own_name=True,
        is_public_authority=True,
        annex_iii_use_cases=["essential_public_services_or_benefits"],
        significant_risk_to_health_safety_or_fundamental_rights=True,
        materially_influences_decision_outcome=True,
    )
    obligation_ids = {item.id for item in result.obligations}
    assert result.classification == "high_risk"
    assert result.fundamental_rights_assessment_required is True
    assert result.workflow_status == "blocked"
    assert {
        "provider-risk-management",
        "deployer-instructions-oversight",
        "deployer-register-use",
        "fundamental-rights-impact-assessment",
    }.issubset(obligation_ids)
    assert {finding.role for finding in result.roles} == {"provider", "deployer"}


def test_critical_infrastructure_exception_does_not_hide_second_fria_eligible_use_case():
    result = assess(
        is_public_authority=True,
        annex_iii_use_cases=[
            "critical_infrastructure",
            "essential_public_services_or_benefits",
        ],
    )
    assert result.classification == "high_risk"
    assert result.fundamental_rights_assessment_required is True


def test_article_6_3_exception_is_explainable_and_requires_provider_documentation():
    result = assess(
        declared_roles=["provider"],
        uses_system_under_own_authority=False,
        annex_iii_use_cases=["employment_or_worker_management"],
        article_6_3_condition="narrow_procedural_task",
        significant_risk_to_health_safety_or_fundamental_rights=False,
        materially_influences_decision_outcome=False,
        profiles_natural_persons=False,
    )
    assert result.classification == "minimal_risk"
    assert "document-non-high-risk" in {item.id for item in result.obligations}
    annex_finding = next(
        item for item in result.findings if item.id.startswith("annex-iii")
    )
    assert annex_finding.effect == "high_risk_exception"
    assert "artikel 6, stk. 3" in annex_finding.explanation


def test_profiling_prevents_article_6_3_exception():
    result = assess(
        annex_iii_use_cases=["employment_or_worker_management"],
        article_6_3_condition="preparatory_task",
        profiles_natural_persons=True,
    )
    assert result.classification == "high_risk"


def test_transparency_tier_and_provider_deployer_duties_are_both_returned():
    result = assess(
        declared_roles=["provider", "deployer"],
        transparency_use_cases=["direct_interaction_with_people", "deepfake_content"],
    )
    assert result.classification == "transparency"
    assert {
        "provider-disclose-ai-interaction",
        "deployer-content-disclosure",
    }.issubset({item.id for item in result.obligations})


def test_out_of_scope_result_preserves_other_law_warning():
    result = assess(is_ai_system=False)
    assert result.scope_status == "not_in_scope"
    assert result.classification == "not_applicable"
    assert "GDPR" in result.follow_up_actions[0]


@pytest.mark.parametrize(
    "change",
    [
        {"case_id": "!"},
        {"intended_purpose": "for kort"},
        {"declared_roles": []},
        {"annex_i_safety_component_or_product": True},
        {
            "article_5_practices": ["social_scoring_with_detrimental_treatment"],
            "article_5_exception_claimed": True,
            "article_5_exception_basis": "Denne praksis kan ikke undtages i modellen.",
        },
        {"article_6_3_condition": "narrow_procedural_task"},
        {"unknown": "must fail closed"},
    ],
)
def test_invalid_or_ambiguous_core_facts_are_rejected(change):
    payload = valid_payload(**change)
    if change == {"declared_roles": []}:
        payload["uses_system_under_own_authority"] = False
    with pytest.raises(ValidationError):
        AIActAssessmentRequest.model_validate(payload)
