"""Load a small, realistic municipal portfolio into a local installation.

The command is deliberately explicit and refused in production.  Every record
has a stable business key, so running it again repairs missing links without
duplicating cases, assessments, actions, approvals or documents.

Run inside the backend container::

    python -m src.cli.seed_municipal_portfolio
"""

from __future__ import annotations

import argparse
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from src.api.assessment_tracks import (
    _persist_ai_act_assessment,
    _persist_fria_assessment,
)
from src.auth import UserPrincipal
from src.database.case_workspace import (
    CaseAction,
    CaseApproval,
    add_workspace_reference,
    create_case_action,
    decide_case_approval,
    request_case_approval,
    update_case_action,
)
from src.database.cases import Case, attach_assessment, create_case, transition_case
from src.database.connection import SessionLocal
from src.database.document_bank import (
    MunicipalDocument,
    MunicipalDocumentVersion,
    add_document_version,
    create_document,
    link_document_to_case,
)
from src.database.dpia import DPIAAssessmentRecord, save_assessment
from src.rule_engine.audit import V3AssessmentLog
from src.rule_engine.loader import load_rules
from src.services.ai_act_assessment import AIActAssessmentRequest, assess_ai_act
from src.services.case_workspace_service import build_case_workspace
from src.services.document_bank_storage import (
    delete_document_bytes,
    store_document_bytes,
)
from src.services.dpia_assessment import DPIAAssessmentRequest, assess_dpia
from src.services.fria_assessment import FRIAAssessmentRequest, assess_fria


ACTOR = "Parthee Vijayamohan"
FUNCTIONAL_APPROVER = "Juridisk godkender"
PORTFOLIO_VERSION = "municipal-portfolio-2026-09-v1"
NAMESPACE = uuid.UUID("c3afc29a-4cc6-4e56-8194-87c421620e0f")
ASSESSMENT_TIME = datetime(2026, 8, 27, 9, 30, tzinfo=UTC)

ALL_CONTROLS = [
    "access_control",
    "encryption",
    "logging",
    "data_minimisation",
    "retention_deletion",
    "vendor_management",
    "human_review",
    "testing",
    "incident_response",
    "training",
]

CONTROL_EVIDENCE = {
    "access_control": "Rolle- og adgangsmatrix IAM-04 kontrolleret 21. august 2026.",
    "encryption": "TLS- og lagringskontrol KRY-02 kontrolleret 21. august 2026.",
    "logging": "Log- og alarmkontrol LOG-07 stikprøvet 22. august 2026.",
    "data_minimisation": "Felt- og formålsreview DAT-03 godkendt 20. august 2026.",
    "retention_deletion": "Automatisk sletning SLE-05 afprøvet 22. august 2026.",
    "vendor_management": "Leverandørkontrol LEV-06 og bilag er fagligt gennemgået.",
    "human_review": "Procedure for menneskelig kontrol MEN-01 er stikprøvet.",
    "testing": "Kvalitets- og robusthedstest KVA-08 er gennemført.",
    "incident_response": "Beredskabsøvelse BER-02 er gennemført og journaliseret.",
    "training": "Kompetenceoversigt UDD-04 er godkendt af systemejer.",
}

RIGHTS_PROCEDURES = [
    "information",
    "access",
    "rectification",
    "erasure",
    "restriction",
    "objection",
]

CASE_DEFINITIONS = (
    {
        "case_id": "KAL-AI-2026-014",
        "title": "Borgervejledning om affald og genbrug",
        "notes": (
            "Kildebaseret vejledning på kommunens hjemmeside. Løsningen giver "
            "generelle svar, viser kilder og kan ikke træffe afgørelser."
        ),
        "next_review_at": datetime(2027, 2, 1, 9, 0, tzinfo=UTC),
    },
    {
        "case_id": "KAL-AI-2026-021",
        "title": "Dokumentklassifikation i byggesager",
        "notes": (
            "AI-understøttet forslag til dokumenttype og journalplacering. En "
            "sagsbehandler godkender altid klassifikationen før journalisering."
        ),
        "next_review_at": datetime(2026, 12, 15, 9, 0, tzinfo=UTC),
    },
    {
        "case_id": "KAL-AI-2026-027",
        "title": "Beslutningsstøtte ved hjælpemiddelansøgninger",
        "notes": (
            "Foranalyse af støttefunktion til sagsbehandlere. Løsningen må ikke "
            "træffe afgørelser eller prioritere borgere uden dokumenteret kontrol."
        ),
        "next_review_at": datetime(2026, 10, 15, 9, 0, tzinfo=UTC),
    },
)

DOCUMENTS = (
    {
        "key": "kal-ai-policy-2026",
        "title": "Standard for ansvarlig anvendelse af generativ AI",
        "category": "policy",
        "owner": "Digitalisering & IT",
        "tags": ["AI", "governance", "roller"],
        "filename": "standard-ansvarlig-ai-2026.txt",
        "content": (
            "Standard for ansvarlig anvendelse af generativ AI\n\n"
            "Formål\nSikre lovlig, sikker og efterprøvelig anvendelse af AI.\n\n"
            "Krav\nDer skal være navngiven systemejer, dokumenteret formål, godkendt "
            "datagrundlag, menneskelig kontrol, hændelsesprocedure og fast reviewdato.\n"
        ),
    },
    {
        "key": "kal-ai-source-control-2026",
        "title": "Kilde- og kvalitetskontrol for digitale vejledninger",
        "category": "security_documentation",
        "owner": "Web og Borgerservice",
        "tags": ["kilder", "kvalitet", "monitorering"],
        "filename": "kilde-og-kvalitetskontrol-2026.txt",
        "content": (
            "Kilde- og kvalitetskontrol\n\nSvar skal alene bygge på godkendte kommunale "
            "vejledninger. Kildelinks kontrolleres månedligt. Fejlsvar registreres, "
            "rettes og eskaleres til fagredaktøren.\n"
        ),
    },
    {
        "key": "kal-ai-supplier-requirements-2026",
        "title": "Databehandlerkrav til AI- og cloudleverandører",
        "category": "data_processing_agreement",
        "owner": "Indkøb og Informationssikkerhed",
        "tags": ["databehandler", "cloud", "sletning"],
        "filename": "databehandlerkrav-ai-cloud-2026.txt",
        "content": (
            "Databehandlerkrav til AI- og cloudleverandører\n\nLeverandøren skal "
            "dokumentere behandlingssteder, underdatabehandlere, adgangskontrol, "
            "logning, slettefrister, hændelseshåndtering og kommunens revisionsret.\n"
        ),
    },
    {
        "key": "kal-ai-human-review-2026",
        "title": "Procedure for menneskelig kontrol og eskalation",
        "category": "policy",
        "owner": "Jura og Digitalisering",
        "tags": ["menneskelig kontrol", "eskalation", "afgørelser"],
        "filename": "procedure-menneskelig-kontrol-2026.txt",
        "content": (
            "Procedure for menneskelig kontrol\n\nAI-output er et forslag. Den ansvarlige "
            "medarbejder kontrollerer grundlag og fejl, kan tilsidesætte output og "
            "eskalerer væsentlige afvigelser til systemejer og juridisk funktion.\n"
        ),
    },
    {
        "key": "kal-dpia-template-2026",
        "title": "DPIA-skabelon for kommunale AI-løsninger",
        "category": "template",
        "owner": "DPO-funktionen",
        "tags": ["DPIA", "skabelon", "Datatilsynet"],
        "filename": "dpia-skabelon-kommunale-ai-loesninger.txt",
        "content": (
            "DPIA-skabelon for kommunale AI-løsninger\n\nBeskriv behandling, "
            "nødvendighed, proportionalitet, registrerede, risici, foranstaltninger, "
            "DPO-udtalelse, beslutning og næste review.\n"
        ),
    },
)


def _stable_uuid(kind: str, key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{PORTFOLIO_VERSION}:{kind}:{key}"))


def _development_principal() -> UserPrincipal:
    return UserPrincipal(
        oid="development-local-user",
        name=ACTOR,
        username="local@development.invalid",
        roles=[
            "Hammeren.Sagsbehandler",
            "Hammeren.Godkender",
            "Hammeren.DPO",
            "Hammeren.Admin",
        ],
        auth_mode="development",
        identity_assurance="development_only",
    )


def _ensure_case(session: Session, definition: dict[str, Any]) -> tuple[Case, bool]:
    matches = session.query(Case).filter(Case.case_id == definition["case_id"]).all()
    if len(matches) > 1:
        raise RuntimeError(f"Flere sager bruger {definition['case_id']}; afbryder sikkert.")
    if matches:
        case = matches[0]
        if case.title != definition["title"]:
            raise RuntimeError(
                f"{definition['case_id']} findes allerede med en anden titel."
            )
        return case, False
    case = create_case(
        session,
        case_id=definition["case_id"],
        title=definition["title"],
        notes=definition["notes"],
        assigned_to=ACTOR,
        next_review_at=definition["next_review_at"],
    )
    return case, True


def _base_dpia_payload(case: Case) -> dict[str, Any]:
    return {
        "project_name": case.title,
        "organisation": "Kalundborg Kommune",
        "owner": "Digitalisering & IT",
        "purpose": (
            "At understøtte en ensartet og efterprøvelig kommunal arbejdsgang uden "
            "at overlade myndighedsafgørelser til systemet."
        ),
        "processing_description": (
            "Medarbejdere eller borgere anvender løsningen i den beskrevne proces. "
            "Input behandles inden for EU/EØS, output logges, og en ansvarlig "
            "medarbejder kontrollerer resultatet før videre anvendelse."
        ),
        "processing_version": "1.0",
        "planned_start_date": "2026-10-01",
        "data_subjects": ["citizens", "employees"],
        "personal_data_categories": ["usage_data", "communications"],
        "special_categories": False,
        "criminal_data": False,
        "vulnerable_subjects": False,
        "large_scale": False,
        "systematic_monitoring": False,
        "profiling_scoring": False,
        "data_matching": False,
        "service_access_impact": False,
        "automated_decisions": False,
        "human_oversight": True,
        "solution_type": "ai_system",
        "supplier_name": "Kommunens godkendte AI-platform",
        "hosting_region": "eu_eea",
        "transfer_outside_eea": False,
        "transfer_mechanism": "not_applicable",
        "model_training": False,
        "retention_period": "Samtaleindhold slettes efter 30 dage; revisionslog opbevares efter kommunens journalplan.",
        "legal_basis": "public_task",
        "legal_basis_reference": "Kommunens lovbestemte opgave, jf. GDPR artikel 6, stk. 1, litra e; konkret sektorhjemmel er registreret i sagen.",
        "legal_basis_source_url": "https://eur-lex.europa.eu/eli/reg/2016/679/oj/dan#art_6",
        "dpo_involved": True,
        "controls": list(ALL_CONTROLS),
        "verified_controls": list(ALL_CONTROLS),
        "control_evidence": dict(CONTROL_EVIDENCE),
        "article_9_basis": "not_applicable",
        "criminal_data_basis": "not_applicable",
        "cpr_data": False,
        "cpr_basis": "not_applicable",
        "rights_procedures": list(RIGHTS_PROCEDURES),
        "rights_procedure_description": (
            "Henvendelser registreres hos DPO-funktionen, fordeles til systemejer og "
            "besvares efter kommunens dokumenterede procedure og gældende frister."
        ),
    }


def _dpia_payload(case: Case) -> dict[str, Any]:
    payload = _base_dpia_payload(case)
    if case.case_id == "KAL-AI-2026-014":
        payload.update(
            purpose=(
                "At gøre kommunens godkendte vejledning om affald og genbrug "
                "lettere at finde og forstå uden at træffe afgørelser."
            ),
            processing_description=(
                "Borgere stiller generelle spørgsmål på kommunens hjemmeside. "
                "Løsningen søger alene i godkendte vejledninger, viser kilder og "
                "gemmer ikke en personprofil. Fagredaktøren følger kvalitet og fejl."
            ),
            personal_data_categories=["usage_data", "communications"],
            retention_period="Samtaleindhold slettes automatisk efter 30 dage; aggregerede kvalitetsmålinger indeholder ikke fritekst.",
        )
    elif case.case_id == "KAL-AI-2026-021":
        payload.update(
            purpose=(
                "At foreslå dokumenttype og journalplacering, så sagsbehandleren "
                "kan journalisere byggesagsmateriale ensartet og hurtigere."
            ),
            processing_description=(
                "Løsningen analyserer indgående dokumenter i byggesager og foreslår "
                "klassifikation. Forslaget anvendes først, når en sagsbehandler har "
                "kontrolleret dokumentet og godkendt journalplaceringen."
            ),
            personal_data_categories=["identity", "case_data", "communications"],
            data_matching=True,
            legal_basis_reference="Byggelovens sagsbehandlingsopgave og GDPR artikel 6, stk. 1, litra e; den konkrete hjemmel er registreret i sagen.",
            retention_period="Dokumenter følger byggesagens journalplan; midlertidige analysefiler slettes efter 24 timer.",
        )
    else:
        payload.update(
            purpose=(
                "At undersøge om struktureret beslutningsstøtte kan hjælpe "
                "sagsbehandleren med at opdage manglende oplysninger i ansøgninger."
            ),
            processing_description=(
                "Løsningen analyserer oplysninger i hjælpemiddelansøgninger og viser "
                "et forslag til mangler og opfølgende spørgsmål. Sagsbehandleren "
                "vurderer selv alle fakta, hjemmel og den endelige afgørelse."
            ),
            personal_data_categories=["identity", "case_data", "communications"],
            special_categories=True,
            vulnerable_subjects=True,
            service_access_impact=True,
            automated_decisions=True,
            article_9_basis="substantial_public_interest",
            controls=list(ALL_CONTROLS),
            verified_controls=["access_control", "encryption", "human_review"],
            control_evidence={
                key: CONTROL_EVIDENCE[key]
                for key in ("access_control", "encryption", "human_review")
            },
            legal_basis_reference="Servicelovens regler om hjælpemidler og GDPR artikel 6, stk. 1, litra e; præcis bestemmelse afklares i juridisk review.",
            retention_period="Analysekladden slettes efter 24 timer; godkendte notater journaliseres efter kommunens journalplan.",
        )
    return payload


def _ensure_dpia(session: Session, case: Case) -> DPIAAssessmentRecord:
    assessment_id = _stable_uuid("dpia", case.case_id)
    existing = session.get(DPIAAssessmentRecord, assessment_id)
    if existing is not None:
        if existing.case_db_id != case.id:
            raise RuntimeError(f"DPIA {assessment_id} er allerede knyttet til en anden sag.")
        return existing
    request_model = DPIAAssessmentRequest.model_validate(_dpia_payload(case))
    result = assess_dpia(
        request_model,
        assessment_id=assessment_id,
        created_at=ASSESSMENT_TIME,
    )
    return save_assessment(
        session,
        assessment_id=assessment_id,
        created_at=ASSESSMENT_TIME,
        request_payload=request_model.model_dump(mode="json"),
        result_payload=result.model_dump(mode="json"),
        case_db_id=case.id,
    )


def _rule_decision(rule_id: str, *, use_then: bool) -> dict[str, Any]:
    rules = {rule.id: rule for rule in load_rules("rules")}
    rule = rules[rule_id]
    outcome = rule.afgørelse.så if use_then else rule.afgørelse.ellers
    if outcome is None:
        raise RuntimeError(f"Reglen {rule_id} har ingen ellers-gren.")
    return {
        "rule_id": rule.id,
        "triggered": True,
        "status": outcome.status.value,
        "outcome": outcome.model_dump(mode="json", by_alias=True),
        "kilde": rule.kilde.model_dump(mode="json"),
        "needs_input": [],
        "evaluation_log": ["Vurderet ud fra sagens strukturerede og dokumenterede oplysninger."],
    }


def _ensure_legal_screening(session: Session, case: Case) -> V3AssessmentLog:
    assessment_id = _stable_uuid("legal", case.case_id)
    existing = session.get(V3AssessmentLog, assessment_id)
    if existing is not None:
        return existing
    conditional = case.case_id == "KAL-AI-2026-027"
    decision = _rule_decision(
        "gdpr.art35.dpia_pligt" if conditional else "gdpr.art32.sikkerhed_ved_behandling",
        use_then=conditional,
    )
    response_payload = {
        "rule_engine_version": "3.0.0-alpha.5",
        "evaluated_at": ASSESSMENT_TIME.isoformat(),
        "rules_loaded": len(load_rules("rules")),
        "aggregate_status": "BETINGET-GO",
        "assessment_complete": True,
        "unresolved_inputs": [],
        "signals_provided": {"system.processes_personal_data": True},
        "signals_extracted_by_llm": {},
        "decisions": [decision],
        "warnings": [
            "Resultatet holdes på Kræver handling, indtil den udløste retskilde har en aktuel, bestået kildekontrol."
        ],
        "legal_source_receipts": [
            {
                "rule_id": decision["rule_id"],
                "law": decision["kilde"]["lov"],
                "article": decision["kilde"]["artikel"],
                "source_url": decision["kilde"]["url"],
                "status": "requires_review",
                "last_checked_at": None,
                "verification_method": None,
            }
        ],
    }
    record = V3AssessmentLog(
        id=assessment_id,
        created_at=ASSESSMENT_TIME,
        case_id=case.case_id,
        user_id="development-local-user",
        rule_engine_version=response_payload["rule_engine_version"],
        aggregate_status=response_payload["aggregate_status"],
        rules_loaded=str(response_payload["rules_loaded"]),
        request_payload={
            "system_description": case.notes,
            "case_db_id": case.id,
            "case_id": case.case_id,
            "user_id": "development-local-user",
            "use_llm_extraction": False,
        },
        response_payload=response_payload,
        note="Juridisk screening med åbent punkt om aktuel kildekontrol.",
    )
    session.add(record)
    session.flush()
    return record


def _ensure_reference(
    session: Session,
    case: Case,
    *,
    reference_type: str,
    key: str,
    title: str,
    summary: str,
    details: dict[str, Any],
) -> None:
    add_workspace_reference(
        session,
        case_db_id=case.id,
        reference_type=reference_type,
        reference_id=_stable_uuid(reference_type, f"{case.case_id}:{key}"),
        title=title,
        summary=summary,
        source_version=details.get("methodology_version", "1.0"),
        details=details,
        created_by=ACTOR,
    )


def _ensure_flagship_tracks(session: Session, case: Case, *, case_created: bool) -> None:
    principal = _development_principal()
    ai_id = _stable_uuid("ai-act", case.case_id)
    ai_request = AIActAssessmentRequest.model_validate(
        {
            "case_id": case.case_id,
            "system_name": case.title,
            "intended_purpose": "At give borgere ensartet vejledning om affald og genbrug uden at træffe afgørelser.",
            "deployment_context": "Løsningen anvendes på kommunens hjemmeside med tydelig AI-oplysning og menneskelig redaktion.",
            "is_ai_system": True,
            "union_nexus": True,
            "scope_exclusion": "none",
            "declared_roles": ["deployer"],
            "uses_system_under_own_authority": True,
            "is_public_authority": True,
            "provides_public_service": True,
            "transparency_use_cases": ["direct_interaction_with_people"],
        }
    )
    ai_result = assess_ai_act(
        ai_request,
        assessment_id=ai_id,
        assessed_at=ASSESSMENT_TIME,
    )
    existing_action_ids = {
        item.id
        for item in session.query(CaseAction)
        .filter(CaseAction.case_db_id == case.id)
        .all()
    }
    _persist_ai_act_assessment(
        session,
        case=case,
        request_model=ai_request,
        result=ai_result,
        user=principal,
    )

    fria_id = _stable_uuid("fria", case.case_id)
    fria_request = FRIAAssessmentRequest.model_validate(
        {
            "case_id": case.case_id,
            "system_name": case.title,
            "purpose": "At gøre kommunens vejledning om affald og genbrug lettere at finde og forstå for borgere.",
            "deployment_context": "Løsningen giver generel vejledning og kan ikke træffe afgørelser eller ændre en borgers rettigheder.",
            "use_period_and_frequency": "Løbende tilgængelig på kommunens hjemmeside med månedlig faglig opfølgning.",
            "makes_or_supports_decisions_about_people": False,
            "decision_owner": "Fagansvarlig for Affald og Ressourcer",
            "rights_or_dpo_expert_involved": True,
            "affected_groups": [
                {
                    "id": "citizens",
                    "name": "Borgere",
                    "how_affected": "Borgere kan bruge svarene som vejledning om sortering, beholdere og kommunale ordninger.",
                    "estimated_number": None,
                    "vulnerability_factors": ["none_identified"],
                    "consulted": False,
                }
            ],
            "rights_impacts": [
                {
                    "id": "information-access",
                    "right": "freedom_of_expression_and_information",
                    "impact_description": "Et upræcist svar kan gøre det vanskeligere at finde korrekt kommunal vejledning.",
                    "harm_scenarios": ["En borger følger et forældet svar og må kontakte kommunen igen."],
                    "affected_group_ids": ["citizens"],
                    "evidence_references": ["Redaktionel kontrol RC-03 og kildeoversigt KO-02"],
                    "severity": 2,
                    "likelihood": 2,
                    "measure_ids": ["source-review"],
                    "expected_residual_severity": 1,
                    "expected_residual_likelihood": 2,
                }
            ],
            "necessity": {
                "legitimate_objective": "At gøre offentlig vejledning mere tilgængelig og reducere fejlhenvendelser.",
                "legal_basis_reference": "Kommunens almindelige vejledningsopgave og GDPR artikel 6, stk. 1, litra e.",
                "suitability_reasoning": "Søgning med kildehenvisninger gør komplekse regler lettere at finde uden at ændre myndighedens afgørelser.",
                "less_intrusive_alternatives": ["En forbedret statisk emneside uden dialogfunktion."],
                "chosen_option_reasoning": "Dialogfunktionen er valgt, fordi den bevarer kildehenvisninger og kan afgrænses til godkendt indhold.",
                "data_and_function_minimisation": "Kun godkendte vejledninger og kortvarigt samtaleindhold behandles; personprofiler opbygges ikke.",
            },
            "proportionality": {
                "expected_public_benefit": "Borgere får hurtigere adgang til ensartet og kildebaseret vejledning.",
                "expected_rights_cost": "Fejlagtig vejledning kan skabe ekstra arbejde eller usikkerhed for borgeren.",
                "balancing_reasoning": "Fordelen vurderes at overstige den begrænsede risiko, fordi svar kildevises, ikke er afgørelser og løbende kontrolleres af fagområdet.",
                "conclusion": "proportionate",
            },
            "human_oversight": {
                "enabled": True,
                "responsible_role": "Fagredaktør med ansvar for kommunens affaldsvejledninger",
                "can_override_or_stop": True,
                "sufficient_time_and_information": True,
                "competence_and_training": "Fagredaktører uddannes i kildekontrol, fejlretning og ansvarlig anvendelse.",
                "review_and_override_procedure": "Svar og kilder stikprøvekontrolleres månedligt, og løsningen kan straks sættes på pause.",
                "automation_bias_controls": "Fejl og klager kategoriseres, så systematiske skævheder opdages og følges op.",
            },
            "complaints_and_remedies": {
                "people_are_informed": True,
                "accessible_complaint_channel": True,
                "human_reconsideration_available": True,
                "appeal_or_independent_review_available": True,
                "contact_point": "Digital Post eller Borgerservice",
                "response_target": "Kvittering inden fem arbejdsdage",
                "accessibility_accommodations": "Telefon, fysisk fremmøde og hjælp til digital adgang tilbydes efter behov.",
            },
            "measures": [
                {
                    "id": "source-review",
                    "title": "Månedlig kildekontrol",
                    "description": "Fagredaktøren gennemgår kildegrundlag, udløbne sider og registrerede fejlsvar hver måned.",
                    "owner": "Fagredaktør",
                    "status": "implemented_verified",
                    "evidence": "Kontroljournal RC-03 er godkendt og indeholder gennemgang for de seneste tre måneder.",
                }
            ],
            "monitoring": {
                "responsible_owner": "Systemejer",
                "metrics": ["Andel svar med gyldig kilde", "Antal korrigerede svar"],
                "review_date": "2027-02-01",
                "incident_and_escalation_process": "Væsentlige fejlsvar skjules straks og eskaleres til systemejer og fagansvarlig.",
                "change_triggers": ["Ny modelversion", "Nyt datagrundlag", "Væsentlig stigning i fejl"],
            },
        }
    )
    fria_result = assess_fria(
        fria_request,
        assessment_id=fria_id,
        assessed_at=ASSESSMENT_TIME,
    )
    _persist_fria_assessment(
        session,
        case=case,
        request_model=fria_request,
        result=fria_result,
        user=principal,
    )

    # Only close actions created by this import.  A later manual reopening is
    # preserved when the command is run again.
    if case_created:
        new_actions = (
            session.query(CaseAction)
            .filter(CaseAction.case_db_id == case.id)
            .filter(~CaseAction.id.in_(existing_action_ids))
            .all()
        )
        for action in new_actions:
            if action.status != "completed":
                update_case_action(
                    session,
                    action.id,
                    status="completed",
                    evidence_note="Kontrollen er dokumenteret i den godkendte kontroljournal.",
                )


def _ensure_other_tracks(session: Session, case: Case) -> None:
    if case.case_id == "KAL-AI-2026-021":
        _ensure_reference(
            session,
            case,
            reference_type="ai_act_assessment",
            key="role-and-risk",
            title="AI Act-screening · Dokumentklassifikation",
            summary="Kommune som idriftsætter · begrænset beslutningsstøtte · klar til juridisk review.",
            details={
                "methodology_version": "eu-ai-act-role-risk-v1",
                "classification": "transparency",
                "workflow_status": "ready_for_legal_review",
                "roles": ["deployer"],
                "source": "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
            },
        )
        _ensure_reference(
            session,
            case,
            reference_type="fria_assessment",
            key="rights-screening",
            title="Grundrettighedsscreening · Dokumentklassifikation",
            summary="Ingen afgørelser eller rangering af personer · særskilt FRIA er ikke udløst.",
            details={
                "methodology_version": "fraia-iama-article-27-v1",
                "decision_readiness": "not_required_on_current_facts",
                "human_review": True,
            },
        )
    else:
        _ensure_reference(
            session,
            case,
            reference_type="ai_act_assessment",
            key="role-and-risk",
            title="AI Act-screening · Hjælpemiddelområdet",
            summary="Muligt højrisikosystem efter bilag III · rolle og undtagelser kræver juridisk afklaring.",
            details={
                "methodology_version": "eu-ai-act-role-risk-v1",
                "classification": "high_risk_requires_review",
                "workflow_status": "requires_action",
                "roles": ["deployer"],
                "fundamental_rights_assessment_required": True,
                "source": "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
            },
        )
        _ensure_reference(
            session,
            case,
            reference_type="fria_assessment",
            key="rights-screening",
            title="Grundrettighedsvurdering · Hjælpemiddelområdet",
            summary="Nødvendighed, ikke-diskrimination og klagevej kræver yderligere dokumentation.",
            details={
                "methodology_version": "fraia-iama-article-27-v1",
                "decision_readiness": "requires_action",
                "overall_residual_risk": "high",
                "rights": [
                    "non_discrimination",
                    "good_administration",
                    "effective_remedy_and_fair_trial",
                ],
            },
        )


def _ensure_action(
    session: Session,
    case: Case,
    *,
    key: str,
    title: str,
    description: str,
    category: str,
    priority: str,
    status: str,
    evidence: str | None = None,
) -> CaseAction:
    source_id = _stable_uuid("action-source", f"{case.case_id}:{key}")
    existing = (
        session.query(CaseAction)
        .filter(
            CaseAction.case_db_id == case.id,
            CaseAction.source_reference_type == "external_record",
            CaseAction.source_reference_id == source_id,
            CaseAction.title == title,
        )
        .one_or_none()
    )
    if existing is not None:
        return existing
    action = create_case_action(
        session,
        case_db_id=case.id,
        title=title,
        description=description,
        category=category,
        priority=priority,
        owner=ACTOR,
        source_reference_type="external_record",
        source_reference_id=source_id,
        created_by=ACTOR,
    )
    if status != "open" or evidence:
        update_case_action(
            session,
            action.id,
            status=status,
            evidence_note=evidence,
        )
    return action


def _ensure_case_actions(session: Session, case: Case) -> None:
    if case.case_id == "KAL-AI-2026-021":
        _ensure_action(
            session,
            case,
            key="human-review",
            title="Stikprøvekontrol af klassifikationsforslag",
            description="Kontrollér fejlrate og journalplacering på et repræsentativt udsnit.",
            category="evidence",
            priority="high",
            status="completed",
            evidence="Kontrolrapport KVA-12 er godkendt af systemejer.",
        )
        _ensure_action(
            session,
            case,
            key="retention",
            title="Verificér sletning af midlertidige analysefiler",
            description="Dokumentér at arbejdsfiler slettes senest 24 timer efter klassifikation.",
            category="measure",
            priority="high",
            status="completed",
            evidence="Slettetest SLE-09 er gennemført uden afvigelser.",
        )
    elif case.case_id == "KAL-AI-2026-027":
        _ensure_action(
            session,
            case,
            key="legal-role",
            title="Afklar AI Act-klassifikation og kommunens rolle",
            description="Dokumentér om anvendelsen er omfattet af bilag III og hvilke idriftsætterpligter der gælder.",
            category="condition",
            priority="critical",
            status="in_progress",
        )
        _ensure_action(
            session,
            case,
            key="bias-test",
            title="Gennemfør test for skævhed og manglende oplysninger",
            description="Test relevante ansøgergrupper og dokumentér fejlrater, falske positive og eskalation.",
            category="measure",
            priority="high",
            status="open",
        )
        _ensure_action(
            session,
            case,
            key="complaint-channel",
            title="Beskriv menneskelig genvurdering og klagevej",
            description="Dokumentér hvordan borgere informeres og får adgang til menneskelig genvurdering.",
            category="condition",
            priority="high",
            status="open",
        )


def _ensure_documents(
    session: Session,
    *,
    storage_root: Path | None,
) -> tuple[dict[str, tuple[MunicipalDocument, MunicipalDocumentVersion]], list[str]]:
    records: dict[str, tuple[MunicipalDocument, MunicipalDocumentVersion]] = {}
    newly_written: list[str] = []
    for definition in DOCUMENTS:
        document = (
            session.query(MunicipalDocument)
            .filter(MunicipalDocument.document_key == definition["key"])
            .one_or_none()
        )
        if document is None:
            document = create_document(
                session,
                document_key=definition["key"],
                title=definition["title"],
                description="Kommunal arbejdsstandard med fast dokumentejer og versionsspor.",
                category=definition["category"],
                owner=definition["owner"],
                classification="Intern",
                tags=definition["tags"],
                created_by=ACTOR,
            )
        version = (
            session.query(MunicipalDocumentVersion)
            .filter(MunicipalDocumentVersion.document_id == document.id)
            .order_by(MunicipalDocumentVersion.version_number.desc())
            .first()
        )
        if version is None:
            content = definition["content"].encode("utf-8")
            stored = store_document_bytes(
                document_id=document.id,
                version_number=1,
                filename=definition["filename"],
                content=content,
                declared_media_type="text/plain",
                root=storage_root,
            )
            newly_written.append(stored.storage_key)
            version = add_document_version(
                session,
                document_id=document.id,
                original_filename=stored.original_filename,
                size_bytes=stored.size_bytes,
                sha256=stored.sha256,
                media_type=stored.media_type,
                status="approved",
                valid_from=datetime(2026, 8, 1, tzinfo=UTC),
                review_at=datetime(2027, 8, 1, tzinfo=UTC),
                uploaded_by=ACTOR,
                approved_by="DPO-funktionen",
                approval_note="Godkendt som fælles kommunalt arbejdsgrundlag.",
                metadata={"portfolio_version": PORTFOLIO_VERSION},
            )
        records[definition["key"]] = (document, version)
    return records, newly_written


def _link_documents(
    session: Session,
    cases: dict[str, Case],
    documents: dict[str, tuple[MunicipalDocument, MunicipalDocumentVersion]],
) -> None:
    links = {
        "KAL-AI-2026-014": (
            ("kal-ai-policy-2026", "basis"),
            ("kal-ai-source-control-2026", "evidence"),
            ("kal-ai-supplier-requirements-2026", "basis"),
        ),
        "KAL-AI-2026-021": (
            ("kal-ai-policy-2026", "basis"),
            ("kal-ai-human-review-2026", "evidence"),
            ("kal-ai-supplier-requirements-2026", "basis"),
        ),
        "KAL-AI-2026-027": (
            ("kal-ai-policy-2026", "basis"),
            ("kal-ai-human-review-2026", "basis"),
            ("kal-dpia-template-2026", "template"),
        ),
    }
    for case_id, case_links in links.items():
        for document_key, role in case_links:
            document, version = documents[document_key]
            link_document_to_case(
                session,
                case_db_id=cases[case_id].id,
                document_id=document.id,
                document_version_id=version.id,
                link_role=role,
                note="Versionslåst dokument i sagens beslutningsgrundlag.",
                linked_by=ACTOR,
            )


def _approval_snapshot(session: Session, case: Case, note: str) -> dict[str, Any]:
    workspace = build_case_workspace(session, case.id)
    return {
        "schema_version": workspace["schema_version"],
        "case": workspace["case"],
        "readiness": workspace["readiness"],
        "assessment_references": workspace["assessments"]["references"],
        "requested_by": {
            "oid": "development-local-user",
            "name": ACTOR,
            "roles": ["Hammeren.Sagsbehandler"],
            "auth_mode": "development",
            "identity_assurance": "development_only",
        },
        "note": note,
    }


def _ensure_approval(
    session: Session,
    case: Case,
    *,
    approval_type: str,
    subject_id: str,
    note: str,
    decision: str | None,
    reason: str | None = None,
) -> CaseApproval:
    existing = (
        session.query(CaseApproval)
        .filter(
            CaseApproval.case_db_id == case.id,
            CaseApproval.approval_type == approval_type,
            CaseApproval.subject_reference_type == "dpia_assessment",
            CaseApproval.subject_reference_id == subject_id,
        )
        .one_or_none()
    )
    if existing is not None:
        return existing
    approval = request_case_approval(
        session,
        case_db_id=case.id,
        requested_by=ACTOR,
        approval_type=approval_type,
        subject_reference_type="dpia_assessment",
        subject_reference_id=subject_id,
        decision_snapshot=_approval_snapshot(session, case, note),
    )
    if decision:
        decide_case_approval(
            session,
            approval.id,
            decision=decision,
            decided_by=FUNCTIONAL_APPROVER,
            reason=reason or "Beslutningsgrundlaget er gennemgået og vurderet tilstrækkeligt.",
            is_identity_verified=False,
            actor_oid="functional-role:legal-approver",
            auth_mode="development",
            identity_assurance="development_only",
        )
    return approval


def seed_municipal_portfolio(
    session: Session,
    *,
    storage_root: Path | None = None,
) -> dict[str, Any]:
    """Create or reuse the complete portfolio without committing the session."""

    cases: dict[str, Case] = {}
    created: dict[str, bool] = {}
    written_keys: list[str] = []
    try:
        for definition in CASE_DEFINITIONS:
            case, was_created = _ensure_case(session, definition)
            cases[case.case_id] = case
            created[case.case_id] = was_created

        dpia_records: dict[str, DPIAAssessmentRecord] = {}
        for case in cases.values():
            legal = _ensure_legal_screening(session, case)
            add_workspace_reference(
                session,
                case_db_id=case.id,
                reference_type="legal_screening",
                reference_id=legal.id,
                title="Juridisk screening",
                summary="Kræver aktuel kildekontrol før endelig beslutning.",
                source_version=legal.rule_engine_version,
                details={
                    "aggregate_status": legal.aggregate_status,
                    "assessment_complete": True,
                    "created_at": legal.created_at.isoformat(),
                    "url": f"/historik/{legal.id}",
                },
                created_by=ACTOR,
            )
            dpia = _ensure_dpia(session, case)
            dpia_records[case.case_id] = dpia

            if created[case.case_id] or not case.last_assessment_log_id:
                attach_assessment(session, case.id, legal.id, "BETINGET-GO")
                dpia_status = str(dpia.result_payload["status"])
                aggregate = {
                    "ready_for_review": "GO",
                    "requires_action": "BETINGET-GO",
                    "blocked": "NO-GO",
                }[dpia_status]
                attach_assessment(session, case.id, dpia.id, aggregate)
            elif case.last_assessment_log_id == legal.id:
                # Recover a transaction that retained the legal screening but
                # did not yet make the deterministic DPIA the current result.
                dpia_status = str(dpia.result_payload["status"])
                aggregate = {
                    "ready_for_review": "GO",
                    "requires_action": "BETINGET-GO",
                    "blocked": "NO-GO",
                }[dpia_status]
                attach_assessment(session, case.id, dpia.id, aggregate)

        _ensure_flagship_tracks(
            session,
            cases["KAL-AI-2026-014"],
            case_created=created["KAL-AI-2026-014"],
        )
        _ensure_other_tracks(session, cases["KAL-AI-2026-021"])
        _ensure_other_tracks(session, cases["KAL-AI-2026-027"])
        for case in cases.values():
            _ensure_case_actions(session, case)

        documents, written_keys = _ensure_documents(
            session,
            storage_root=storage_root,
        )
        _link_documents(session, cases, documents)

        flagship = cases["KAL-AI-2026-014"]
        flagship_dpia = dpia_records[flagship.case_id]
        _ensure_approval(
            session,
            flagship,
            approval_type="case",
            subject_id=flagship_dpia.id,
            note="Vurdering, foranstaltninger og versionslåste dokumenter er klar til beslutning.",
            decision="approved",
            reason="Vurderingerne er gennemgået, kontrollerne er dokumenteret, og den resterende risiko accepteres.",
        )
        if created[flagship.case_id] and flagship.status == "vurderet":
            transition_case(
                session,
                flagship.id,
                "godkendt",
                changed_by=FUNCTIONAL_APPROVER,
                note="Sagen godkendes på baggrund af det låste og dokumenterede beslutningsgrundlag.",
                confirmed=True,
            )
        _ensure_approval(
            session,
            flagship,
            approval_type="deployment",
            subject_id=flagship_dpia.id,
            note="Driftskontroller, ansvar og næste reviewdato er dokumenteret.",
            decision="approved",
            reason="Driftsansvar, monitorering, eskalation og næste review er dokumenteret og accepteret.",
        )
        if created[flagship.case_id] and flagship.status == "godkendt":
            transition_case(
                session,
                flagship.id,
                "idriftsat",
                changed_by=FUNCTIONAL_APPROVER,
                note="Løsningen sættes i drift med dokumenteret monitorering og fast reviewdato.",
                confirmed=True,
            )

        pending_case = cases["KAL-AI-2026-021"]
        _ensure_approval(
            session,
            pending_case,
            approval_type="case",
            subject_id=dpia_records[pending_case.case_id].id,
            note="Kvalitetskontrol og sletningstest er vedlagt til godkenderens gennemgang.",
            decision=None,
        )

        remediation_case = cases["KAL-AI-2026-027"]
        _ensure_approval(
            session,
            remediation_case,
            approval_type="case",
            subject_id=dpia_records[remediation_case.case_id].id,
            note="Første faglige gennemgang af beslutningsgrundlaget.",
            decision="changes_requested",
            reason="AI Act-klassifikation, skævhedstest og klagevej skal dokumenteres, før sagen kan godkendes.",
        )

        workspaces = {
            case_id: build_case_workspace(session, case.id)
            for case_id, case in cases.items()
        }
        if flagship.status != "idriftsat":
            raise RuntimeError("Den godkendte sag nåede ikke status Idriftsat.")
        if workspaces["KAL-AI-2026-021"]["readiness"]["pending_approval_count"] != 1:
            raise RuntimeError("Sagen til godkendelse mangler sin afventende opgave.")
        if remediation_case.status != "remediation":
            raise RuntimeError("Sagen med åbne vilkår nåede ikke status Remediation.")

        return {
            "portfolio_version": PORTFOLIO_VERSION,
            "case_count": len(cases),
            "document_count": len(documents),
            "cases": [
                {
                    "id": case.id,
                    "case_id": case.case_id,
                    "title": case.title,
                    "status": case.status,
                }
                for case in cases.values()
            ],
        }
    except Exception:
        for storage_key in written_keys:
            try:
                delete_document_bytes(storage_key, root=storage_root)
            except OSError:
                pass
        raise


def _assert_local_installation() -> None:
    if os.getenv("APP_ENV", "development").strip().lower() == "production":
        raise RuntimeError("Porteføljedata må ikke indlæses i et produktionsmiljø.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Indlæs en realistisk kommunal sagsportefølje i lokal S.H.I.E.L.D."
    )
    parser.parse_args()
    _assert_local_installation()
    session = SessionLocal()
    try:
        summary = seed_municipal_portfolio(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    print(
        f"Indlæst {summary['case_count']} sager og "
        f"{summary['document_count']} dokumenter ({summary['portfolio_version']})."
    )
    for case in summary["cases"]:
        print(f"- {case['case_id']} · {case['title']} · {case['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
