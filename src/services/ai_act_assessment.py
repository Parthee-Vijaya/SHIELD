"""Explainable, deterministic preliminary screening under the EU AI Act.

The service maps stated facts to operator roles, the Regulation's risk tiers and
role-specific follow-up obligations.  It does not call an LLM, infer missing
facts or issue a legally binding classification.  Its output is designed to be
reviewed by a qualified human and compared with the Commission's current
Compliance Checker before a deployment decision.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from src.services.assessment_common import (
    AssessmentMeta,
    AssessmentSource,
    CaseLinkedAssessmentRequest,
    assessment_identity,
)


METHODOLOGY_VERSION = "eu-ai-act-2024-1689-preliminary-v1"
LEGAL_NOTICE = (
    "Resultatet er en foreløbig, deterministisk screening baseret på de indtastede "
    "oplysninger. Det er ikke juridisk rådgivning eller en myndighedsafgørelse. "
    "Klassifikation, undtagelser, ikrafttrædelsesdatoer og dansk særlovgivning skal "
    "kontrolleres af en kvalificeret fagperson mod den aktuelle EU-kilde."
)

OperatorRole = Literal[
    "provider",
    "deployer",
    "authorised_representative",
    "importer",
    "distributor",
    "product_manufacturer",
]
ScopeExclusion = Literal[
    "none",
    "military_defence_or_national_security",
    "sole_scientific_research_and_development",
    "pre_market_research_testing_or_development",
    "personal_non_professional_use",
]
Article5Practice = Literal[
    "manipulation_causing_significant_harm",
    "vulnerability_exploitation_causing_significant_harm",
    "social_scoring_with_detrimental_treatment",
    "criminal_risk_prediction_solely_from_profiling",
    "untargeted_facial_image_scraping",
    "emotion_inference_in_workplace_or_education",
    "biometric_sensitive_trait_categorisation",
    "real_time_remote_biometric_identification_for_law_enforcement",
]
AnnexIIIUseCase = Literal[
    "biometrics",
    "critical_infrastructure",
    "education_or_vocational_training",
    "employment_or_worker_management",
    "essential_public_services_or_benefits",
    "creditworthiness",
    "life_or_health_insurance",
    "emergency_dispatch_or_triage",
    "law_enforcement",
    "migration_asylum_or_border_control",
    "administration_of_justice",
    "democratic_processes",
]
Article63Condition = Literal[
    "none",
    "narrow_procedural_task",
    "improves_completed_human_activity",
    "detects_patterns_without_replacing_human_review",
    "preparatory_task",
]
TransparencyUseCase = Literal[
    "direct_interaction_with_people",
    "synthetic_audio_image_video_or_text",
    "emotion_recognition_or_biometric_categorisation",
    "deepfake_content",
    "ai_generated_public_interest_text",
]
RiskClassification = Literal[
    "prohibited",
    "high_risk",
    "transparency",
    "minimal_risk",
    "not_applicable",
    "undetermined",
]


class AIActAssessmentRequest(CaseLinkedAssessmentRequest):
    intended_purpose: str = Field(min_length=20, max_length=10_000)
    deployment_context: str = Field(min_length=20, max_length=10_000)

    # Scope facts, Regulation (EU) 2024/1689 Articles 2 and 3.
    is_ai_system: bool
    union_nexus: bool
    scope_exclusion: ScopeExclusion = "none"

    # Role declarations and independently checkable role facts, Articles 3/25.
    declared_roles: list[OperatorRole] = Field(default_factory=list, max_length=6)
    develops_or_has_developed_system: bool = False
    places_or_puts_into_service_under_own_name: bool = False
    uses_system_under_own_authority: bool = False
    has_written_mandate_for_non_eu_provider: bool = False
    imports_non_eu_system_to_union_market: bool = False
    makes_system_available_in_supply_chain: bool = False
    product_manufacturer_places_embedded_ai_under_own_name: bool = False
    substantial_modification: bool = False
    changes_intended_purpose_to_high_risk: bool = False
    is_public_authority: bool = False
    provides_public_service: bool = False

    # Article 5. The UI must ask the complete legal tests, not keywords alone.
    article_5_practices: list[Article5Practice] = Field(
        default_factory=list, max_length=8
    )
    article_5_exception_claimed: bool = False
    article_5_exception_basis: str = Field(default="", max_length=5_000)

    # Article 6 and Annexes I/III.
    annex_i_safety_component_or_product: bool = False
    annex_i_requires_third_party_conformity: bool = False
    annex_iii_use_cases: list[AnnexIIIUseCase] = Field(
        default_factory=list, max_length=12
    )
    profiles_natural_persons: bool = False
    significant_risk_to_health_safety_or_fundamental_rights: bool = False
    materially_influences_decision_outcome: bool = False
    article_6_3_condition: Article63Condition = "none"

    # Article 50 can apply in addition to another risk tier.
    transparency_use_cases: list[TransparencyUseCase] = Field(
        default_factory=list, max_length=5
    )

    @field_validator(
        "declared_roles",
        "article_5_practices",
        "annex_iii_use_cases",
        "transparency_use_cases",
    )
    @classmethod
    def values_must_be_unique(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("værdier må ikke gentages")
        return values

    @model_validator(mode="after")
    def validate_conditional_facts(self) -> "AIActAssessmentRequest":
        role_facts = (
            self.develops_or_has_developed_system
            or self.places_or_puts_into_service_under_own_name
            or self.uses_system_under_own_authority
            or self.has_written_mandate_for_non_eu_provider
            or self.imports_non_eu_system_to_union_market
            or self.makes_system_available_in_supply_chain
            or self.product_manufacturer_places_embedded_ai_under_own_name
            or self.substantial_modification
            or self.changes_intended_purpose_to_high_risk
        )
        if (
            self.is_ai_system
            and self.union_nexus
            and not self.declared_roles
            and not role_facts
        ):
            raise ValueError(
                "mindst én operatørrolle eller et rolle-faktum skal angives"
            )
        if self.article_5_exception_claimed:
            if not self.article_5_practices:
                raise ValueError(
                    "en artikel 5-undtagelse kræver en angivet mulig praksis"
                )
            exception_eligible = {
                "emotion_inference_in_workplace_or_education",
                "biometric_sensitive_trait_categorisation",
                "real_time_remote_biometric_identification_for_law_enforcement",
            }
            if not set(self.article_5_practices).issubset(exception_eligible):
                raise ValueError(
                    "den valgte artikel 5-praksis har ingen undtagelse i denne screening"
                )
            if len(self.article_5_exception_basis) < 20:
                raise ValueError(
                    "grundlaget for en påberåbt artikel 5-undtagelse skal beskrives"
                )
        elif self.article_5_exception_basis:
            raise ValueError(
                "article_5_exception_basis kræver article_5_exception_claimed=true"
            )
        if bool(self.annex_i_safety_component_or_product) != bool(
            self.annex_i_requires_third_party_conformity
        ):
            raise ValueError(
                "artikel 6, stk. 1, kræver at begge Annex I-betingelser afklares ens"
            )
        if self.article_6_3_condition != "none" and not self.annex_iii_use_cases:
            raise ValueError(
                "artikel 6, stk. 3, kan kun vurderes for et Annex III-anvendelsestilfælde"
            )
        if (
            self.scope_exclusion == "personal_non_professional_use"
            and self.is_public_authority
        ):
            raise ValueError(
                "en offentlig myndighed kan ikke angive rent personlig ikke-erhvervsmæssig brug"
            )
        if self.scope_exclusion == "personal_non_professional_use" and (
            set(self.declared_roles) - {"deployer"}
            or self.develops_or_has_developed_system
            or self.places_or_puts_into_service_under_own_name
            or self.has_written_mandate_for_non_eu_provider
            or self.imports_non_eu_system_to_union_market
            or self.makes_system_available_in_supply_chain
            or self.product_manufacturer_places_embedded_ai_under_own_name
        ):
            raise ValueError(
                "undtagelsen for personlig brug vedrører kun deployer-forpligtelser"
            )
        return self


class OperatorRoleFinding(BaseModel):
    role: OperatorRole
    label: str
    basis: str
    source_provision: str


class AIActRuleFinding(BaseModel):
    id: str
    label: str
    matched: bool
    effect: Literal[
        "scope_exclusion",
        "prohibited",
        "high_risk",
        "high_risk_exception",
        "transparency",
        "minimal_risk",
    ]
    explanation: str
    source_provision: str


class AIActObligation(BaseModel):
    id: str
    role: OperatorRole | Literal["all_operators"]
    title: str
    description: str
    source_provision: str
    priority: Literal["blocking", "required_if_confirmed", "recommended"]


class AIActAssessmentResponse(BaseModel):
    meta: AssessmentMeta
    scope_status: Literal["in_scope", "not_in_scope", "requires_review"]
    classification: RiskClassification
    classification_label: str
    workflow_status: Literal["blocked", "requires_action", "ready_for_legal_review"]
    confidence: Literal["preliminary", "requires_legal_review"]
    roles: list[OperatorRoleFinding]
    findings: list[AIActRuleFinding]
    obligations: list[AIActObligation]
    fundamental_rights_assessment_required: bool
    blockers: list[str]
    follow_up_actions: list[str]
    sources: list[AssessmentSource]


ROLE_LABELS: dict[OperatorRole, str] = {
    "provider": "Udbyder",
    "deployer": "Idriftsætter/anvender",
    "authorised_representative": "Bemyndiget repræsentant",
    "importer": "Importør",
    "distributor": "Distributør",
    "product_manufacturer": "Produktfabrikant",
}

ARTICLE_5_LABELS: dict[Article5Practice, str] = {
    "manipulation_causing_significant_harm": "Manipulation eller vildledning med væsentlig skade",
    "vulnerability_exploitation_causing_significant_harm": "Udnyttelse af sårbarhed med væsentlig skade",
    "social_scoring_with_detrimental_treatment": "Social scoring med skadelig behandling",
    "criminal_risk_prediction_solely_from_profiling": "Kriminalitetsrisiko alene fra profilering",
    "untargeted_facial_image_scraping": "Ikke-målrettet scraping til ansigtsdatabase",
    "emotion_inference_in_workplace_or_education": "Følelsesgenkendelse på arbejde eller uddannelse",
    "biometric_sensitive_trait_categorisation": "Biometrisk kategorisering af følsomme egenskaber",
    "real_time_remote_biometric_identification_for_law_enforcement": (
        "Biometrisk fjernidentifikation i realtid til retshåndhævelse"
    ),
}

ANNEX_III_LABELS: dict[AnnexIIIUseCase, str] = {
    "biometrics": "Biometri",
    "critical_infrastructure": "Kritisk infrastruktur",
    "education_or_vocational_training": "Uddannelse og erhvervsuddannelse",
    "employment_or_worker_management": "Beskæftigelse og medarbejderledelse",
    "essential_public_services_or_benefits": "Væsentlige offentlige ydelser og tjenester",
    "creditworthiness": "Kreditværdighed",
    "life_or_health_insurance": "Livs- eller sundhedsforsikring",
    "emergency_dispatch_or_triage": "Alarmprioritering eller akut triage",
    "law_enforcement": "Retshåndhævelse",
    "migration_asylum_or_border_control": "Migration, asyl eller grænsekontrol",
    "administration_of_justice": "Retspleje",
    "democratic_processes": "Demokratiske processer",
}

TRANSPARENCY_LABELS: dict[TransparencyUseCase, str] = {
    "direct_interaction_with_people": "Direkte interaktion med personer",
    "synthetic_audio_image_video_or_text": "Syntetisk lyd-, billed-, video- eller tekstindhold",
    "emotion_recognition_or_biometric_categorisation": "Følelsesgenkendelse eller biometrisk kategorisering",
    "deepfake_content": "Deepfake-indhold",
    "ai_generated_public_interest_text": "AI-genereret tekst om forhold af offentlig interesse",
}

SOURCES = [
    AssessmentSource(
        id="eu-ai-act",
        title="Regulation (EU) 2024/1689 (Artificial Intelligence Act)",
        provision="Articles 2–50 and Annexes I/III",
        url="https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
        authority="eu_legislation",
    ),
    AssessmentSource(
        id="ec-compliance-checker",
        title="EU AI Act Compliance Checker",
        provision="Official beta decision-support tool and disclaimer",
        url="https://ai-act-service-desk.ec.europa.eu/en/eu-ai-act-compliance-checker",
        authority="eu_commission",
    ),
]


def _role_findings(
    request: AIActAssessmentRequest, high_risk: bool
) -> list[OperatorRoleFinding]:
    bases: dict[OperatorRole, list[str]] = {role: [] for role in ROLE_LABELS}
    for role in request.declared_roles:
        bases[role].append(
            "Rollen er angivet af brugeren og skal verificeres mod de faktiske aftaler."
        )
    if (
        request.develops_or_has_developed_system
        and request.places_or_puts_into_service_under_own_name
    ):
        bases["provider"].append(
            "Systemet udvikles eller bestilles og bringes i brug under eget navn."
        )
    if request.uses_system_under_own_authority:
        bases["deployer"].append(
            "Systemet anvendes under organisationens egen myndighed og kontrol."
        )
    if request.has_written_mandate_for_non_eu_provider:
        bases["authorised_representative"].append(
            "Der er angivet et skriftligt mandat fra en ikke-EU-udbyder."
        )
    if request.imports_non_eu_system_to_union_market:
        bases["importer"].append(
            "Et system med ikke-EU-udbyders navn bringes ind på EU-markedet."
        )
    if request.makes_system_available_in_supply_chain:
        bases["distributor"].append(
            "Systemet gøres tilgængeligt videre i forsyningskæden."
        )
    if request.product_manufacturer_places_embedded_ai_under_own_name:
        bases["product_manufacturer"].append(
            "Et produkt med indlejret AI bringes i omsætning under eget navn."
        )
        if high_risk:
            bases["provider"].append(
                "Produktfabrikanten behandles som udbyder for dette højrisikosystem."
            )
    if high_risk and (
        request.substantial_modification
        or request.changes_intended_purpose_to_high_risk
    ):
        bases["provider"].append(
            "Artikel 25 kan flytte udbyderansvaret efter væsentlig ændring eller nyt formål."
        )

    findings: list[OperatorRoleFinding] = []
    for role in ROLE_LABELS:
        if bases[role]:
            provision = "Article 25" if role == "product_manufacturer" else "Article 3"
            if role == "provider" and any(
                "Artikel 25" in basis for basis in bases[role]
            ):
                provision = "Articles 3(3) and 25"
            findings.append(
                OperatorRoleFinding(
                    role=role,
                    label=ROLE_LABELS[role],
                    basis=" ".join(dict.fromkeys(bases[role])),
                    source_provision=provision,
                )
            )
    return findings


def _is_article_6_3_exception(request: AIActAssessmentRequest) -> bool:
    return bool(
        request.annex_iii_use_cases
        and request.article_6_3_condition != "none"
        and not request.significant_risk_to_health_safety_or_fundamental_rights
        and not request.materially_influences_decision_outcome
        and not request.profiles_natural_persons
    )


def _obligation(
    id: str,
    role: OperatorRole | Literal["all_operators"],
    title: str,
    description: str,
    provision: str,
    priority: Literal[
        "blocking", "required_if_confirmed", "recommended"
    ] = "required_if_confirmed",
) -> AIActObligation:
    return AIActObligation(
        id=id,
        role=role,
        title=title,
        description=description,
        source_provision=provision,
        priority=priority,
    )


def _role_obligations(
    request: AIActAssessmentRequest,
    roles: set[OperatorRole],
    *,
    classification: RiskClassification,
    article_6_3_exception: bool,
) -> list[AIActObligation]:
    obligations: list[AIActObligation] = []
    if roles & {"provider", "deployer"} and classification != "not_applicable":
        obligations.append(
            _obligation(
                "ai-literacy",
                "all_operators",
                "AI-færdigheder",
                "Sørg for passende AI-kompetencer hos medarbejdere og andre, der anvender systemet.",
                "Article 4",
            )
        )

    if classification in {"prohibited", "undetermined"} and request.article_5_practices:
        obligations.append(
            _obligation(
                "stop-prohibited-practice",
                "all_operators",
                "Stop markedsføring, idriftsættelse og brug",
                "Den beskrevne praksis må ikke fortsætte, før en juridisk vurdering har afkræftet match eller dokumenteret en snæver undtagelse.",
                "Article 5",
                "blocking",
            )
        )

    if classification == "high_risk":
        if "provider" in roles:
            obligations.extend(
                [
                    _obligation(
                        "provider-risk-management",
                        "provider",
                        "Risikostyringssystem",
                        "Etabler en løbende, dokumenteret risikostyringsproces.",
                        "Article 9",
                    ),
                    _obligation(
                        "provider-data-governance",
                        "provider",
                        "Data- og datakvalitetsstyring",
                        "Dokumentér relevante krav til trænings-, validerings- og testdata.",
                        "Article 10",
                    ),
                    _obligation(
                        "provider-documentation",
                        "provider",
                        "Teknisk dokumentation og logning",
                        "Udarbejd teknisk dokumentation og muliggør automatisk logning og sporbarhed.",
                        "Articles 11–12 and Annex IV",
                    ),
                    _obligation(
                        "provider-transparency-oversight",
                        "provider",
                        "Brugsinformation og menneskeligt tilsyn",
                        "Lever klare instruktioner og design systemet til effektivt menneskeligt tilsyn.",
                        "Articles 13–14",
                    ),
                    _obligation(
                        "provider-quality-security",
                        "provider",
                        "Nøjagtighed, robusthed, cybersikkerhed og kvalitet",
                        "Dokumentér kravene og vedligehold et kvalitetsstyringssystem.",
                        "Articles 15–17",
                    ),
                    _obligation(
                        "provider-conformity-registration",
                        "provider",
                        "Overensstemmelsesvurdering og registrering",
                        "Afklar relevant procedure, erklæring, CE-mærkning og registrering før markedsføring eller idriftsættelse.",
                        "Articles 43 and 47–49",
                    ),
                    _obligation(
                        "provider-post-market",
                        "provider",
                        "Eftermarkedsovervågning og hændelser",
                        "Overvåg systemet, håndtér korrigerende handlinger og rapportér alvorlige hændelser.",
                        "Articles 20, 72 and 73",
                    ),
                ]
            )
        if "deployer" in roles:
            obligations.extend(
                [
                    _obligation(
                        "deployer-instructions-oversight",
                        "deployer",
                        "Brug efter instruktion og reelt menneskeligt tilsyn",
                        "Tildel tilsyn til personer med kompetence, uddannelse, myndighed og støtte.",
                        "Article 26(1)–(2)",
                    ),
                    _obligation(
                        "deployer-input-monitoring",
                        "deployer",
                        "Inputkvalitet, overvågning og hændelser",
                        "Kontrollér egne input, overvåg drift og suspendér/rapportér ved risiko eller alvorlig hændelse.",
                        "Article 26(4)–(5)",
                    ),
                    _obligation(
                        "deployer-logs",
                        "deployer",
                        "Opbevar systemlogs",
                        "Opbevar tilgængelige automatisk genererede logs i den relevante periode, som udgangspunkt mindst seks måneder.",
                        "Article 26(6)",
                    ),
                    _obligation(
                        "deployer-affected-persons",
                        "deployer",
                        "Informer berørte personer",
                        "Informer personer, når Annex III-systemet træffer eller understøtter beslutninger om dem.",
                        "Article 26(11)",
                    ),
                ]
            )
            if request.is_public_authority:
                obligations.append(
                    _obligation(
                        "deployer-register-use",
                        "deployer",
                        "Registrér myndighedens brug",
                        "Kontrollér systemets registrering og registrér myndighedens brug i den relevante database.",
                        "Articles 26(8) and 49(3)",
                    )
                )
        if "authorised_representative" in roles:
            obligations.append(
                _obligation(
                    "representative-mandate",
                    "authorised_representative",
                    "Udfør og dokumentér mandatet",
                    "Kontrollér dokumentation, opbevar pligtige kopier og samarbejd med myndigheder.",
                    "Article 22",
                )
            )
        if "importer" in roles:
            obligations.append(
                _obligation(
                    "importer-checks",
                    "importer",
                    "Importørkontrol",
                    "Kontrollér overensstemmelsesvurdering, dokumentation, CE-mærke, erklæring, instruktion og repræsentant før markedsføring.",
                    "Article 23",
                )
            )
        if "distributor" in roles:
            obligations.append(
                _obligation(
                    "distributor-checks",
                    "distributor",
                    "Distributørkontrol",
                    "Kontrollér CE-mærke, erklæring og instruktioner, og stop distribution ved manglende overensstemmelse.",
                    "Article 24",
                )
            )

    if article_6_3_exception and "provider" in roles:
        obligations.append(
            _obligation(
                "document-non-high-risk",
                "provider",
                "Dokumentér og registrér undtagelsesvurderingen",
                "Udbyderen skal dokumentere artikel 6, stk. 3-vurderingen og registrere systemet før markedsføring eller idriftsættelse.",
                "Articles 6(4) and 49(2)",
            )
        )

    if request.transparency_use_cases:
        if (
            "provider" in roles
            and "direct_interaction_with_people" in request.transparency_use_cases
        ):
            obligations.append(
                _obligation(
                    "provider-disclose-ai-interaction",
                    "provider",
                    "Oplys om AI-interaktion",
                    "Design systemet, så personer oplyses om AI-interaktionen, medmindre den er åbenlys.",
                    "Article 50(1)",
                )
            )
        if (
            "provider" in roles
            and "synthetic_audio_image_video_or_text" in request.transparency_use_cases
        ):
            obligations.append(
                _obligation(
                    "provider-machine-readable-output",
                    "provider",
                    "Mærk syntetisk output",
                    "Sørg for maskinlæsbar mærkning og detektion af kunstigt genereret eller manipuleret output.",
                    "Article 50(2)",
                )
            )
        if (
            "deployer" in roles
            and "emotion_recognition_or_biometric_categorisation"
            in request.transparency_use_cases
        ):
            obligations.append(
                _obligation(
                    "deployer-biometric-disclosure",
                    "deployer",
                    "Informer om følelses- eller biometrisk behandling",
                    "Informer de udsatte personer og overhold relevant databeskyttelsesret.",
                    "Article 50(3)",
                )
            )
        if "deployer" in roles and set(request.transparency_use_cases) & {
            "deepfake_content",
            "ai_generated_public_interest_text",
        }:
            obligations.append(
                _obligation(
                    "deployer-content-disclosure",
                    "deployer",
                    "Oplys om manipuleret eller AI-genereret indhold",
                    "Oplys på en klar og synlig måde, at indholdet er kunstigt genereret eller manipuleret, med de relevante undtagelser.",
                    "Article 50(4)",
                )
            )
    return obligations


def assess_ai_act(
    request: AIActAssessmentRequest,
    *,
    assessment_id: str | None = None,
    assessed_at: datetime | None = None,
) -> AIActAssessmentResponse:
    """Classify stated facts and return an auditable preliminary action set."""

    assessment_id, assessed_at = assessment_identity(
        assessment_id=assessment_id,
        assessed_at=assessed_at,
    )
    meta = AssessmentMeta(
        assessment_id=assessment_id,
        case_id=request.case_id,
        system_name=request.system_name,
        assessed_at=assessed_at,
        methodology_version=METHODOLOGY_VERSION,
        legal_notice=LEGAL_NOTICE,
    )

    findings: list[AIActRuleFinding] = []
    blockers: list[str] = []
    follow_up: list[str] = []

    excluded = (
        not request.is_ai_system
        or not request.union_nexus
        or request.scope_exclusion != "none"
    )
    findings.append(
        AIActRuleFinding(
            id="scope",
            label="Anvendelsesområde",
            matched=excluded,
            effect="scope_exclusion",
            explanation=(
                "De indtastede fakta peger på, at screeningen falder uden for dette AI Act-spor. "
                "Andre regler kan fortsat gælde."
                if excluded
                else "Systemet er oplyst som et AI-system med EU-tilknytning uden valgt omfangsundtagelse."
            ),
            source_provision="Articles 2–3",
        )
    )
    if excluded:
        excluded_role_findings = _role_findings(request, high_risk=False)
        return AIActAssessmentResponse(
            meta=meta,
            scope_status="not_in_scope",
            classification="not_applicable",
            classification_label="Ikke omfattet af denne screening",
            workflow_status="ready_for_legal_review",
            confidence="preliminary",
            roles=excluded_role_findings,
            findings=findings,
            obligations=[],
            fundamental_rights_assessment_required=False,
            blockers=[],
            follow_up_actions=[
                "Verificér om andre EU-regler, GDPR eller dansk ret fortsat finder anvendelse."
            ],
            sources=SOURCES,
        )

    possible_prohibited = bool(request.article_5_practices)
    for practice in request.article_5_practices:
        findings.append(
            AIActRuleFinding(
                id=f"article-5-{practice}",
                label=ARTICLE_5_LABELS[practice],
                matched=True,
                effect="prohibited",
                explanation="Brugeren har bekræftet alle elementer i den viste artikel 5-praksis.",
                source_provision="Article 5",
            )
        )

    annex_i_high_risk = (
        request.annex_i_safety_component_or_product
        and request.annex_i_requires_third_party_conformity
    )
    article_6_3_exception = _is_article_6_3_exception(request)
    annex_iii_high_risk = (
        bool(request.annex_iii_use_cases) and not article_6_3_exception
    )
    for use_case in request.annex_iii_use_cases:
        findings.append(
            AIActRuleFinding(
                id=f"annex-iii-{use_case}",
                label=ANNEX_III_LABELS[use_case],
                matched=True,
                effect="high_risk_exception" if article_6_3_exception else "high_risk",
                explanation=(
                    "Anvendelsen er oplyst som Annex III, men alle angivne betingelser for en mulig "
                    "artikel 6, stk. 3-undtagelse er opfyldt. Udbyderen skal dokumentere vurderingen."
                    if article_6_3_exception
                    else "Anvendelsen matcher det angivne område i Annex III, og en fuld artikel 6, stk. 3-undtagelse er ikke dokumenteret."
                ),
                source_provision="Article 6(2)–(4) and Annex III",
            )
        )
    findings.append(
        AIActRuleFinding(
            id="annex-i-product-safety",
            label="Sikkerhedskomponent eller produkt under Annex I",
            matched=annex_i_high_risk,
            effect="high_risk",
            explanation=(
                "Begge artikel 6, stk. 1-betingelser er bekræftet."
                if annex_i_high_risk
                else "De to kumulative artikel 6, stk. 1-betingelser er ikke opfyldt."
            ),
            source_provision="Article 6(1) and Annex I",
        )
    )
    for transparency_use_case in request.transparency_use_cases:
        findings.append(
            AIActRuleFinding(
                id=f"article-50-{transparency_use_case}",
                label=TRANSPARENCY_LABELS[transparency_use_case],
                matched=True,
                effect="transparency",
                explanation="Den angivne funktion kan udløse en rolleafhængig oplysnings- eller mærkningspligt.",
                source_provision="Article 50",
            )
        )

    if possible_prohibited and request.article_5_exception_claimed:
        classification: RiskClassification = "undetermined"
        label = "Mulig forbudt praksis – undtagelse kræver juridisk kontrol"
        blockers.append(
            "En påberåbt artikel 5-undtagelse skal verificeres før brug eller idriftsættelse."
        )
    elif possible_prohibited:
        classification = "prohibited"
        label = "Forbudt praksis"
        blockers.append(
            "Mindst én artikel 5-praksis er bekræftet; stop beslutningsflowet og foretag juridisk kontrol."
        )
    elif annex_i_high_risk or annex_iii_high_risk:
        classification = "high_risk"
        label = "Højrisiko-AI-system"
    elif request.transparency_use_cases:
        classification = "transparency"
        label = "AI-system med transparensforpligtelser"
    else:
        classification = "minimal_risk"
        label = "Ingen særlig risikokategori fundet"
        findings.append(
            AIActRuleFinding(
                id="minimal-risk",
                label="Ingen artikel 5-, højrisiko- eller artikel 50-indikator",
                matched=True,
                effect="minimal_risk",
                explanation="Kun de indtastede fakta er screenet; ændret formål eller brug kan ændre resultatet.",
                source_provision="Risk-based structure of Regulation (EU) 2024/1689",
            )
        )

    high_risk_for_roles = classification == "high_risk"
    role_findings = _role_findings(request, high_risk=high_risk_for_roles)
    role_set = {finding.role for finding in role_findings}
    if not role_set:
        blockers.append("Operatørrollen er ikke tilstrækkeligt afklaret.")

    fria_eligible_use_cases = set(request.annex_iii_use_cases) - {
        "critical_infrastructure"
    }
    fria_required = bool(
        classification == "high_risk"
        and fria_eligible_use_cases
        and "deployer" in role_set
        and (
            request.is_public_authority
            or request.provides_public_service
            or bool(
                set(request.annex_iii_use_cases)
                & {"creditworthiness", "life_or_health_insurance"}
            )
        )
    )
    obligations = _role_obligations(
        request,
        role_set,
        classification=classification,
        article_6_3_exception=article_6_3_exception,
    )
    if fria_required:
        obligations.append(
            _obligation(
                "fundamental-rights-impact-assessment",
                "deployer",
                "Gennemfør grundrettighedsvurdering før ibrugtagning",
                "Beskriv proces, brugstid, berørte grupper, skader, menneskeligt tilsyn, governance og klagemekanismer, og følg den aktuelle notifikationsprocedure.",
                "Article 27",
                "blocking",
            )
        )
        blockers.append(
            "Artikel 27-grundrettighedsvurdering skal gennemføres før ibrugtagning."
        )

    if classification == "high_risk":
        follow_up.append(
            "Bekræft den præcise Annex III-underkategori og eventuelle nationale særregler."
        )
    if article_6_3_exception:
        follow_up.append(
            "Lad udbyderen dokumentere artikel 6, stk. 3-vurderingen og registreringen efter artikel 49, stk. 2."
        )
    if request.transparency_use_cases:
        follow_up.append(
            "Fastlæg hvem der teknisk og organisatorisk opfylder hver artikel 50-forpligtelse."
        )
    follow_up.append(
        "Sammenhold resultatet med EU-Kommissionens aktuelle Compliance Checker og en juridisk vurdering."
    )

    workflow_status: Literal["blocked", "requires_action", "ready_for_legal_review"]
    if blockers:
        workflow_status = "blocked"
    elif classification == "high_risk":
        workflow_status = "requires_action"
    else:
        workflow_status = "ready_for_legal_review"

    return AIActAssessmentResponse(
        meta=meta,
        scope_status=(
            "requires_review" if classification == "undetermined" else "in_scope"
        ),
        classification=classification,
        classification_label=label,
        workflow_status=workflow_status,
        confidence=(
            "requires_legal_review"
            if classification in {"prohibited", "high_risk", "undetermined"}
            else "preliminary"
        ),
        roles=role_findings,
        findings=findings,
        obligations=obligations,
        fundamental_rights_assessment_required=fria_required,
        blockers=list(dict.fromkeys(blockers)),
        follow_up_actions=list(dict.fromkeys(follow_up)),
        sources=SOURCES,
    )
