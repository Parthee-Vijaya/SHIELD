from types import SimpleNamespace

from src.services.dpia_template_registry import (
    EDPB_DRAFT_PROFILE_ID,
    assess_edpb_alignment,
    list_template_profiles,
)


def test_registry_keeps_draft_separate_from_canonical_export():
    profiles = list_template_profiles()
    assert len(profiles) == 2
    assert sum(profile.status == "canonical_export" for profile in profiles) == 1
    draft = next(profile for profile in profiles if profile.id == EDPB_DRAFT_PROFILE_ID)
    assert draft.status == "consultation_preview"
    assert len(draft.sha256 or "") == 64


def test_alignment_surfaces_edpb_specific_gaps():
    request = SimpleNamespace(
        project_name="Velatir",
        organisation="Kalundborg Kommune",
        owner="Digitalisering",
        processing_version="1.0",
        legal_basis="public_task",
        controls=["logging"],
        alternatives_considered="",
        benefits_and_proportionality="",
        dpo_advice="",
        data_subject_consultation="",
    )
    result = SimpleNamespace(risks=[SimpleNamespace(owner="Digitalisering")])
    alignment = assess_edpb_alignment(request, result)
    assert alignment.profile_id == EDPB_DRAFT_PROFILE_ID
    assert alignment.score < 100
    necessity = next(item for item in alignment.areas if item.id == "necessity_proportionality")
    assert necessity.state == "partial"
    assert necessity.missing_fields
