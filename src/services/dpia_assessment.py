"""Deterministic, fail-closed DPIA assessment service.

This service intentionally does not call an LLM.  Every conclusion can be
reproduced from the persisted questionnaire, and uncertainty is surfaced as
missing information or a blocker instead of being filled with invented facts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.services.legal_basis_verifier import LegalBasisVerificationResponse
from src.services.dpia_template_registry import TemplateAlignment, assess_edpb_alignment


TEMPLATE_VERSION = "datatilsynet-ai-2024-05-22-sha256-6cbb2fca5434"

DataSubject = Literal[
    "employees", "citizens", "children", "customers", "suppliers", "applicants", "other"
]
DataCategory = Literal[
    "identity", "employment", "financial", "case_data", "usage_data", "location",
    "communications", "images_audio", "other",
]
Control = Literal[
    "access_control", "encryption", "logging", "data_minimisation",
    "retention_deletion", "vendor_management", "human_review", "testing",
    "incident_response", "training",
]
Article9Basis = Literal[
    "not_applicable", "explicit_consent", "employment_social_security", "vital_interests",
    "nonprofit_members", "manifestly_public", "legal_claims", "substantial_public_interest",
    "health_social_care", "public_health", "research_statistics", "not_assessed",
]
CriminalDataBasis = Literal[
    "not_applicable", "public_authority_necessary", "explicit_consent",
    "legitimate_interest_clearly_outweighs", "legal_claims", "not_assessed",
]
CPRBasis = Literal[
    "not_applicable", "statutory_authority", "explicit_consent", "article_9_basis",
    "public_authority_disclosure", "not_assessed",
]
RightsProcedure = Literal[
    "information", "access", "rectification", "erasure", "restriction", "portability",
    "objection", "automated_decision_review",
]


class DPIAAssessmentRequest(BaseModel):
    """Strict questionnaire contract used by the new DPIA flow."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        protected_namespaces=(),
    )

    project_name: str = Field(min_length=2, max_length=500)
    organisation: str = Field(min_length=2, max_length=500)
    owner: str = Field(min_length=2, max_length=500)
    department: str = Field(default="", max_length=500)
    purpose: str = Field(min_length=20, max_length=10_000)
    processing_description: str = Field(min_length=40, max_length=20_000)
    processing_version: str = Field(default="", max_length=500)
    planned_start_date: str = Field(default="", max_length=100)
    planned_end_date: str = Field(default="", max_length=500)
    planned_start_note: str = Field(default="", max_length=2_000)
    planned_end_condition: str = Field(default="", max_length=2_000)
    secondary_uses: str = Field(default="", max_length=5_000)
    data_subjects: list[DataSubject] = Field(min_length=1, max_length=7)
    personal_data_categories: list[DataCategory] = Field(min_length=1, max_length=9)
    special_categories: bool
    criminal_data: bool
    vulnerable_subjects: bool
    large_scale: bool | None
    systematic_monitoring: bool
    profiling_scoring: bool = False
    data_matching: bool = False
    service_access_impact: bool = False
    automated_decisions: bool
    human_oversight: bool | None
    solution_type: Literal["ai_system", "saas", "internal_system", "integration", "other"]
    supplier_name: str = Field(default="", max_length=500)
    hosting_region: Literal["denmark", "eu_eea", "third_country", "unknown"]
    transfer_outside_eea: bool | None
    transfer_mechanism: Literal[
        "not_applicable", "adequacy_decision", "scc", "bcr", "derogation", "not_assessed"
    ]
    model_training: bool | None = Field(
        description="Brug af organisationens input/output til modeltræning: ja, nej eller ikke afklaret (null)."
    )
    retention_period: str = Field(default="", max_length=2_000)
    legal_basis: Literal[
        "public_task", "legal_obligation", "contract", "consent",
        "legitimate_interests", "not_assessed",
    ]
    legal_basis_reference: str = Field(default="", max_length=2_000)
    legal_basis_source_url: str = Field(default="", max_length=2_000)
    dpo_involved: bool | None
    controls: list[Control] = Field(default_factory=list, max_length=10)
    verified_controls: list[Control] = Field(default_factory=list, max_length=10)
    control_evidence: dict[Control, str] = Field(default_factory=dict)
    article_9_basis: Article9Basis = "not_applicable"
    criminal_data_basis: CriminalDataBasis = "not_applicable"
    criminal_data_legal_reference: str = Field(default="", max_length=2_000)
    cpr_data: bool = False
    cpr_basis: CPRBasis = "not_applicable"
    cpr_legal_reference: str = Field(default="", max_length=2_000)
    rights_procedures: list[RightsProcedure] = Field(default_factory=list, max_length=8)
    rights_procedure_description: str = Field(default="", max_length=5_000)
    alternatives_considered: str = Field(default="", max_length=10_000)
    benefits_and_proportionality: str = Field(default="", max_length=10_000)
    dpo_advice: str = Field(default="", max_length=10_000)
    data_subject_consultation: str = Field(default="", max_length=10_000)
    publication_plan: str = Field(default="", max_length=5_000)

    @field_validator(
        "data_subjects", "personal_data_categories", "controls",
        "verified_controls", "rights_procedures",
    )
    @classmethod
    def values_must_be_unique(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("værdier må ikke gentages")
        return values

    @model_validator(mode="after")
    def validate_conditional_core_data(self) -> "DPIAAssessmentRequest":
        if self.solution_type in {"ai_system", "saas", "integration"} and len(self.supplier_name) < 2:
            raise ValueError("supplier_name er påkrævet for den valgte løsningstype")
        if self.transfer_outside_eea is None and self.transfer_mechanism != "not_assessed":
            raise ValueError("transfer_mechanism skal være not_assessed, når overførsel ikke er afklaret")
        if self.transfer_outside_eea is True and self.transfer_mechanism == "not_applicable":
            raise ValueError("transfer_mechanism kan ikke være not_applicable ved tredjelandsoverførsel")
        if self.transfer_outside_eea is False and self.transfer_mechanism != "not_applicable":
            raise ValueError("transfer_mechanism skal være not_applicable uden tredjelandsoverførsel")
        if self.hosting_region == "third_country" and self.transfer_outside_eea is not True:
            raise ValueError("third_country-hosting kræver transfer_outside_eea=true")
        if "children" in self.data_subjects and not self.vulnerable_subjects:
            raise ValueError("børn og unge skal markeres som sårbare registrerede")
        if self.special_categories and self.article_9_basis == "not_applicable":
            raise ValueError("article_9_basis skal angives ved særlige kategorier")
        if not self.special_categories and self.article_9_basis != "not_applicable":
            raise ValueError("article_9_basis skal være not_applicable uden særlige kategorier")
        if self.criminal_data and self.criminal_data_basis == "not_applicable":
            raise ValueError("criminal_data_basis skal angives ved oplysninger om strafbare forhold")
        if not self.criminal_data and self.criminal_data_basis != "not_applicable":
            raise ValueError("criminal_data_basis skal være not_applicable uden strafbare forhold")
        if self.cpr_data and self.cpr_basis == "not_applicable":
            raise ValueError("cpr_basis skal angives ved behandling af CPR-numre")
        if not self.cpr_data and self.cpr_basis != "not_applicable":
            raise ValueError("cpr_basis skal være not_applicable uden CPR-behandling")
        planned = set(self.controls)
        verified = set(self.verified_controls)
        if not verified.issubset(planned):
            raise ValueError("verified_controls skal være et subset af controls")
        evidence_keys = set(self.control_evidence)
        if evidence_keys != verified:
            raise ValueError("control_evidence skal indeholde præcis én post for hver verified control")
        if any(len(value.strip()) < 10 for value in self.control_evidence.values()):
            raise ValueError("evidens for en verificeret kontrol skal være mindst 10 tegn")
        if self.rights_procedures and len(self.rights_procedure_description.strip()) < 20:
            raise ValueError("rights_procedure_description skal beskrive procedurerne med mindst 20 tegn")
        return self


class DPIASection(BaseModel):
    id: str
    title: str
    text: str
    source: Literal["provided_input", "deterministic_rule", "missing_information", "ai_assisted"]
    source_ids: list[str] = Field(default_factory=list)
    review_status: Literal["requires_review", "missing_information", "not_applicable"]


class DPIARisk(BaseModel):
    id: str
    area: str
    scenario: str
    likelihood: int = Field(ge=1, le=4)
    impact: int = Field(ge=1, le=4)
    inherent_risk: Literal["low", "medium", "high", "very_high"]
    measures: str
    residual_likelihood: int = Field(ge=1, le=4)
    residual_impact: int = Field(ge=1, le=4)
    residual_risk: Literal["low", "medium", "high", "very_high"]
    owner: str
    implementation_status: Literal["requires_verification"] = "requires_verification"
    due_date: None = None
    source_ids: list[str] = Field(default_factory=list)
    rationale: str = ""
    consequences: str = ""


class DPIAScreeningCriterion(BaseModel):
    id: Literal[
        "evaluation_scoring", "automated_decisions", "systematic_monitoring",
        "sensitive_data", "large_scale", "data_matching", "vulnerable_subjects",
        "innovative_technology", "rights_or_service_access",
    ]
    label: str
    matched: bool | None
    explanation: str


class DPIARecommendation(BaseModel):
    """An optional proposal, never evidence of implementation or approval."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,79}$")
    title: str = Field(min_length=1, max_length=300)
    proposal: str = Field(min_length=1, max_length=2000)
    rationale: str = Field(min_length=1, max_length=2000)
    prerequisites: str = Field(min_length=1, max_length=2000)
    verification: str = Field(min_length=1, max_length=2000)
    source_ids: list[str] = Field(min_length=1, max_length=100)


class DPIAAssessmentResponse(BaseModel):
    id: str
    project_name: str = ""
    organisation: str = ""
    department: str = ""
    processing_version: str = ""
    version: int = Field(default=1, ge=1)
    case_db_id: str | None = None
    parent_assessment_id: str | None = None
    summary_source_ids: list[str] = Field(default_factory=list)
    ai_generation: dict[str, Any] | None = None
    editorial_revision: dict[str, Any] | None = None
    additional_risks: list[dict[str, Any]] = Field(default_factory=list)
    recommendations: list[DPIARecommendation] = Field(default_factory=list, max_length=8)
    reading_guide: dict[str, Any] | None = None
    open_questions: list[str] = Field(default_factory=list)
    created_at: datetime
    status: Literal["blocked", "requires_action", "ready_for_review"]
    status_label: str
    risk_level: Literal["low", "medium", "high", "very_high"]
    completeness: int = Field(ge=0, le=100)
    dpia_required: bool
    screening_criteria: list[DPIAScreeningCriterion] = Field(default_factory=list)
    screening_conclusion: str = "Ældre vurdering uden særskilt kriteriespor."
    executive_summary: str
    scope: str
    sections: list[DPIASection]
    risks: list[DPIARisk]
    missing_information: list[str]
    blockers: list[str]
    next_steps: list[str]
    legal_verification: LegalBasisVerificationResponse | None = None
    template_version: str = TEMPLATE_VERSION
    template_alignment: TemplateAlignment | None = None


class DPIAAssessmentListResponse(BaseModel):
    count: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
    items: list[DPIAAssessmentResponse]


SUBJECT_LABELS = {
    "employees": "medarbejdere", "citizens": "borgere", "children": "børn og unge",
    "customers": "kunder eller brugere", "suppliers": "leverandører og samarbejdspartnere",
    "applicants": "ansøgere", "other": "andre registrerede",
}
DATA_LABELS = {
    "identity": "identitets- og kontaktoplysninger", "employment": "ansættelsesoplysninger",
    "financial": "økonomiske oplysninger", "case_data": "sags- og ydelsesoplysninger",
    "usage_data": "brugs-, log- og telemetridata", "location": "lokationsoplysninger",
    "communications": "kommunikation og dokumentindhold", "images_audio": "billeder, lyd eller video",
    "other": "andre personoplysninger",
}
SOLUTION_LABELS = {
    "ai_system": "AI-system eller model", "saas": "cloud/SaaS-løsning",
    "internal_system": "internt udviklet system", "integration": "integration eller tilføjelse",
    "other": "anden løsning",
}
HOSTING_LABELS = {
    "denmark": "Danmark", "eu_eea": "EU/EØS", "third_country": "et tredjeland",
    "unknown": "et endnu ikke afklaret område",
}
TRANSFER_MECHANISM_LABELS = {
    "not_applicable": "Ikke relevant",
    "adequacy_decision": "Tilstrækkelighedsafgørelse",
    "scc": "EU-standardkontraktbestemmelser (SCC)",
    "bcr": "Bindende virksomhedsregler (BCR)",
    "derogation": "Undtagelse efter GDPR artikel 49",
    "not_assessed": "Ikke afklaret endnu",
}
LEGAL_BASIS_LABELS = {
    "public_task": "GDPR artikel 6, stk. 1, litra e (opgave i samfundets interesse/offentlig myndighed)",
    "legal_obligation": "GDPR artikel 6, stk. 1, litra c (retlig forpligtelse)",
    "contract": "GDPR artikel 6, stk. 1, litra b (kontrakt)",
    "consent": "GDPR artikel 6, stk. 1, litra a (samtykke)",
    "legitimate_interests": "GDPR artikel 6, stk. 1, litra f (legitime interesser)",
    "not_assessed": "ikke afklaret",
}
CONTROL_LABELS = {
    "access_control": "rollebaseret adgang og mindst mulige rettigheder",
    "encryption": "kryptering under transport og lagring",
    "logging": "logning, overvågning og sporbarhed",
    "data_minimisation": "dataminimering og formålsbegrænsning",
    "retention_deletion": "automatisk sletning og dokumenterede frister",
    "vendor_management": "databehandleraftale og leverandørkontrol",
    "human_review": "reel menneskelig kontrol og klagevej",
    "testing": "løbende test af kvalitet, bias og sikkerhed",
    "incident_response": "beredskab for brud og hændelser",
    "training": "instruktion og uddannelse af brugere",
}
ARTICLE_9_LABELS = {
    "not_applicable": "ikke relevant", "explicit_consent": "udtrykkeligt samtykke",
    "employment_social_security": "arbejds-, sundheds- eller socialretlige forpligtelser",
    "vital_interests": "vitale interesser", "nonprofit_members": "relevant nonprofitaktivitet",
    "manifestly_public": "oplysninger åbenbart offentliggjort af den registrerede",
    "legal_claims": "retskrav", "substantial_public_interest": "væsentlige samfundsinteresser",
    "health_social_care": "sundheds- eller socialomsorg", "public_health": "folkesundhed",
    "research_statistics": "arkiv-, forsknings- eller statistikformål", "not_assessed": "ikke afklaret",
}
CRIMINAL_BASIS_LABELS = {
    "not_applicable": "ikke relevant", "public_authority_necessary": "nødvendig myndighedsbehandling",
    "explicit_consent": "udtrykkeligt samtykke",
    "legitimate_interest_clearly_outweighs": "klart overstigende berettiget interesse",
    "legal_claims": "retskrav", "not_assessed": "ikke afklaret",
}
CPR_BASIS_LABELS = {
    "not_applicable": "ikke relevant", "statutory_authority": "lovhjemmel",
    "explicit_consent": "udtrykkeligt samtykke", "article_9_basis": "grundlag efter GDPR artikel 9",
    "public_authority_disclosure": "myndighedsvideregivelse", "not_assessed": "ikke afklaret",
}


SECTION_TITLES = {
    "1.1": "Formålet med AI-løsningen",
    "1.2": "Baggrunden for at gennemføre konsekvensanalysen",
    "1.3": "Baggrunden for at udvikle eller bruge en AI-løsning",
    "1.4": "Datastrømme", "1.5": "Formålsbeskrivelse",
    "1.6": "Kategorier af registrerede", "1.7": "Deling af data",
    "1.8": "Konteksten for brugen af AI-løsningen", "1.9": "Teknisk understøttelse",
    "2.1": "Princippet om lovlighed", "2.2": "Undtagelse for særlige kategorier",
    "2.3": "Oplysninger om strafbare forhold", "2.4": "Personnummer (CPR)",
    "2.5": "Princippet om rimelighed", "2.6": "Princippet om gennemsigtighed",
    "2.7": "Princippet om formålsbegrænsning", "2.8": "Proportionalitetsprincippet",
    "2.9": "Princippet om rigtighed", "2.10": "Princippet om opbevaringsbegrænsning",
    "2.11": "Udvikling og test – lovlighed", "2.12": "Udvikling og test – rimelighed",
    "2.13": "Udvikling og test – gennemsigtighed", "2.14": "Udvikling og test – proportionalitet",
    "2.15": "Udvikling og test – rigtighed", "2.16": "Drift – rimelighed",
    "2.17": "Drift – gennemsigtighed", "2.18": "Drift – proportionalitet",
    "2.19": "Drift – rigtighed", "2.20": "Integritet, fortrolighed og behandlingssikkerhed",
    "2.21": "Brud på persondatasikkerheden", "2.22": "Oplysningspligt",
    "2.23": "Indsigtsret", "2.24": "Retten til berigtigelse", "2.25": "Retten til sletning",
    "2.26": "Retten til dataportabilitet", "2.27": "Ret til at gøre indsigelse",
    "2.28": "Automatiske individuelle afgørelser", "2.29": "Databehandlere",
    "2.30": "Tredjelandsoverførsler",
}


@dataclass(frozen=True)
class RiskDefinition:
    id: str
    area: str
    scenario: str
    controls: tuple[str, ...]
    base_likelihood: int = 2
    base_impact: int = 2


RISK_DEFINITIONS = (
    RiskDefinition("3.1", "Ansvarlighed", "Risici for de registrerede identificeres eller håndteres ikke fuldstændigt.", ("logging", "incident_response"), 2, 3),
    RiskDefinition("3.2", "Ansvarlighed", "Uklar rolle- og ansvarsfordeling efterlader risici uden en ansvarlig ejer.", ("training", "logging"), 2, 3),
    RiskDefinition("3.3", "Formålsbegrænsning og lovlighed", "Formålet udvides, eller data anvendes uden et dokumenteret behandlingsgrundlag.", ("data_minimisation", "logging"), 2, 3),
    RiskDefinition("3.4", "Rimelighed", "Uegnede eller skæve data medfører urimelige eller diskriminerende udfald.", ("testing", "human_review"), 2, 3),
    RiskDefinition("3.5", "Gennemsigtighed", "Output kan ikke forklares tilstrækkeligt over for de registrerede.", ("human_review", "training"), 2, 3),
    RiskDefinition("3.6", "Dataminimering", "Der indsamles flere eller andre personoplysninger end nødvendigt.", ("data_minimisation", "retention_deletion")),
    RiskDefinition("3.7", "Sikkerhed", "Tredjepartskomponenter eller leverandøradgang medfører uautoriseret adgang eller læk.", ("vendor_management", "access_control", "encryption"), 2, 3),
    RiskDefinition("3.8", "Rettigheder", "Løsningen gør det vanskeligt at efterkomme de registreredes rettigheder.", ("logging", "human_review"), 2, 3),
    RiskDefinition("4.1", "Rimelighed", "Ikke-repræsentative træningsdata skaber urimelige udfald.", ("testing", "human_review"), 2, 3),
    RiskDefinition("4.2", "Rimelighed", "Features eller proxyvariable skaber direkte eller indirekte diskrimination.", ("testing", "human_review"), 2, 4),
    RiskDefinition("4.3", "Rimelighed", "Uklare mærkningsprocedurer giver fejlbehæftede træningsdata.", ("testing", "training")),
    RiskDefinition("4.4", "Rimelighed", "Utilstrækkelige træningsdata fører til overfitting.", ("testing",), 2, 3),
    RiskDefinition("4.5", "Gennemsigtighed", "Privatlivsinformationen beskriver ikke formål og AI-brug klart.", ("training", "human_review"), 2, 3),
    RiskDefinition("4.6", "Dataminimering", "Udvikling eller test anvender overskydende eller utilstrækkeligt anonymiserede data.", ("data_minimisation", "retention_deletion"), 2, 3),
    RiskDefinition("4.7", "Sikkerhed", "Træningsdata eller kildekode tilgås eller manipuleres uautoriseret.", ("access_control", "encryption", "logging"), 2, 3),
    RiskDefinition("4.8", "Sikkerhed", "Sårbarheder i forsyningskæden kompromitterer løsningen eller data.", ("vendor_management", "testing", "incident_response"), 2, 3),
    RiskDefinition("5.1", "Rimelighed", "Modellen overtilpasser sig enkelte features og generaliserer dårligt.", ("testing",)),
    RiskDefinition("5.2", "Rimelighed", "Test opdager ikke diskriminerende output.", ("testing", "human_review"), 2, 4),
    RiskDefinition("5.3", "Gennemsigtighed", "Komplekse modeller giver uforklarlige beslutninger eller anbefalinger.", ("testing", "human_review"), 2, 3),
    RiskDefinition("5.4", "Rigtighed", "Ufuldstændige eller forkerte data giver fejlagtigt output.", ("testing", "human_review"), 2, 3),
    RiskDefinition("5.5", "Sikkerhed", "Mangelfuld sikkerheds- og penetrationstest efterlader sårbarheder uopdaget.", ("testing", "incident_response"), 2, 3),
    RiskDefinition("5.6", "Dataminimering", "Test anvender irrelevante eller overflødige personoplysninger.", ("data_minimisation", "retention_deletion")),
    RiskDefinition("5.7", "Menneskeligt review", "Medarbejdere kan ikke fortolke eller bestride output på en meningsfuld måde.", ("human_review", "training"), 2, 4),
    RiskDefinition("6.1", "Rimelighed", "Modeldrift opdages ikke under den løbende anvendelse.", ("testing", "logging"), 2, 3),
    RiskDefinition("6.2", "Rimelighed og sikkerhed", "Manglende træning eller ondsindede brugere fører til misbrug.", ("access_control", "training", "logging"), 2, 3),
    RiskDefinition("6.3", "Sikkerhed", "Model inversion eller membership inference afslører personoplysninger.", ("access_control", "encryption", "testing"), 2, 4),
    RiskDefinition("6.4", "Sikkerhed", "Manipulerede input fremprovokerer skadeligt eller fejlagtigt output.", ("testing", "logging", "incident_response"), 2, 3),
    RiskDefinition("6.5", "Sikkerhed", "Nedbrud eller datatab gør behandlingsaktiviteten utilgængelig.", ("incident_response", "vendor_management"), 2, 3),
    RiskDefinition("6.6", "Sikkerhed", "Denial-of-service forhindrer adgang til løsningen.", ("incident_response", "logging"), 2, 3),
    RiskDefinition("6.7", "Sikkerhed", "Genereret output anvendes ukritisk og skaber sikkerheds- eller persondatahændelser.", ("human_review", "training", "testing"), 2, 3),
    RiskDefinition("6.8", "Dataminimering", "Forældede eller irrelevante data medfører modeldrift.", ("testing", "retention_deletion"), 2, 3),
    RiskDefinition("6.9", "Rettigheder", "Organisationen kan ikke håndtere indsigelser mod løsningens output.", ("human_review", "logging"), 2, 3),
    RiskDefinition("6.10", "Menneskeligt review", "Automation bias eller manglende forklarlighed udhuler det menneskelige review.", ("human_review", "training", "testing"), 2, 4),
)


RISK_MATRIX = {
    (1, 1): "low", (2, 1): "low", (3, 1): "medium", (4, 1): "high",
    (1, 2): "low", (2, 2): "medium", (3, 2): "high", (4, 2): "high",
    (1, 3): "medium", (2, 3): "high", (3, 3): "high", (4, 3): "very_high",
    (1, 4): "high", (2, 4): "very_high", (3, 4): "very_high", (4, 4): "very_high",
}
RISK_RANK = {"low": 1, "medium": 2, "high": 3, "very_high": 4}
RISK_LEVEL_TEXT = {
    "low": "lavt", "medium": "middel", "high": "højt", "very_high": "meget højt",
}


def risk_matrix(likelihood: int, impact: int) -> str:
    """Return the exact four-by-four classification used by the template."""
    if (likelihood, impact) not in RISK_MATRIX:
        raise ValueError("likelihood og impact skal være heltal fra 1 til 4")
    return RISK_MATRIX[(likelihood, impact)]


def _labels(values: list[str], mapping: dict[str, str]) -> str:
    return ", ".join(mapping[value] for value in values)


def _risk_scores(definition: RiskDefinition, request: DPIAAssessmentRequest) -> tuple[int, int]:
    likelihood, impact = definition.base_likelihood, definition.base_impact
    risk_id = definition.id
    # Not training on the organisation's own data does not establish that the
    # supplier model has no bias, development-data or overfitting risks.
    # Unknown training remains an explicit gap rather than a low-risk answer.
    sensitive = request.special_categories or request.criminal_data
    if sensitive and risk_id in {"3.3", "3.6", "3.7", "3.8", "4.6", "4.7", "5.6", "6.3", "6.9"}:
        impact += 1
    if request.vulnerable_subjects and definition.area in {"Rimelighed", "Rettigheder", "Menneskeligt review"}:
        impact += 1
    if request.large_scale is not False and risk_id in {"3.6", "3.7", "4.6", "4.7", "5.6", "6.3", "6.5"}:
        likelihood += 1
    if request.systematic_monitoring and risk_id in {"3.5", "3.6", "3.8", "6.1", "6.9"}:
        likelihood += 1
    if request.automated_decisions and risk_id in {"3.4", "3.5", "3.8", "5.2", "5.3", "5.7", "6.9", "6.10"}:
        likelihood += 1
        impact += 1
    if request.model_training is True and risk_id.startswith(("4.", "5.")):
        likelihood += 1
    if (request.transfer_outside_eea is not False or request.hosting_region == "third_country") and risk_id in {"3.7", "4.8", "6.3", "6.5"}:
        likelihood += 1
    if request.solution_type in {"saas", "integration"} and risk_id in {"3.7", "4.8", "6.5"}:
        likelihood += 1
    if request.human_oversight is not True and risk_id in {"5.7", "6.7", "6.9", "6.10"}:
        likelihood += 1
    return min(4, likelihood), min(4, impact)


def _build_risks(request: DPIAAssessmentRequest) -> list[DPIARisk]:
    selected = set(request.controls)
    verified = set(request.verified_controls)
    risks: list[DPIARisk] = []
    for definition in RISK_DEFINITIONS:
        likelihood, impact = _risk_scores(definition, request)
        # A checkbox is only a plan/claim.  It cannot reduce actual residual
        # risk until implementation evidence has been supplied and validated.
        effective = verified.intersection(definition.controls)
        residual_likelihood = max(1, likelihood - (1 if effective else 0))
        impact_controls = {"encryption", "human_review", "incident_response"}
        residual_impact = max(1, impact - (1 if effective.intersection(impact_controls) else 0))
        verified_text = [
            f"{CONTROL_LABELS[item]} ({request.control_evidence[item]})"
            for item in definition.controls if item in verified
        ]
        selected_text = [
            CONTROL_LABELS[item]
            for item in definition.controls if item in selected and item not in verified
        ]
        missing_text = [CONTROL_LABELS[item] for item in definition.controls if item not in selected]
        measure_parts = []
        if definition.id in {"4.1", "4.2", "4.3", "4.4", "4.6"} and request.model_training is not True:
            measure_parts.append(
                (
                    "Det er ikke afklaret, om organisationens input eller output anvendes til modeltræning"
                    if request.model_training is None else
                    "Det er oplyst, at organisationens input og output ikke anvendes til modeltræning"
                )
                + "; dette dokumenterer ikke leverandørmodellens udviklingsgrundlag eller fjerner dens udviklingsrisici. Relevans og leverandørens kontroller skal verificeres"
            )
        if verified_text:
            measure_parts.append("Verificeret med evidens: " + ", ".join(verified_text))
        if selected_text:
            measure_parts.append("Oplyst/planlagt, men ikke verificeret: " + ", ".join(selected_text))
        if missing_text:
            measure_parts.append("Skal vurderes/implementeres: " + ", ".join(missing_text))
        provisional = []
        if request.large_scale is None and definition.id in {"3.6", "3.7", "4.6", "4.7", "5.6", "6.3", "6.5"}:
            provisional.append("behandlingens omfang er ikke afklaret; foreløbigt anvendes samme forsigtige score som ved stort omfang")
        if request.transfer_outside_eea is None and definition.id in {"3.7", "4.8", "6.3", "6.5"}:
            provisional.append("eventuel overførsel uden for EU/EØS er ikke afklaret; foreløbigt anvendes samme forsigtige score som ved overførsel")
        if request.human_oversight is None and definition.id in {"5.7", "6.7", "6.9", "6.10"}:
            provisional.append("menneskelig kontrol er ikke dokumenteret; foreløbigt anvendes samme forsigtige score som uden dokumenteret kontrol")
        risks.append(DPIARisk(
            id=definition.id,
            area=definition.area,
            scenario=definition.scenario,
            likelihood=likelihood,
            impact=impact,
            inherent_risk=risk_matrix(likelihood, impact),
            measures=". ".join(measure_parts) + ".",
            residual_likelihood=residual_likelihood,
            residual_impact=residual_impact,
            residual_risk=risk_matrix(residual_likelihood, residual_impact),
            owner=request.owner,
            rationale=("Til afklaring / foreløbig screening: " + "; ".join(provisional) + ". Dette er en forsigtig beregningsforudsætning, ikke en konstatering af de faktiske forhold.") if provisional else "",
        ))
    return risks


def _section(
    section_id: str,
    text: str,
    *,
    source: Literal["provided_input", "deterministic_rule", "missing_information"] = "provided_input",
    status: Literal["requires_review", "missing_information", "not_applicable"] = "requires_review",
) -> DPIASection:
    return DPIASection(id=section_id, title=SECTION_TITLES[section_id], text=text, source=source, review_status=status)


def _missing_section(section_id: str, text: str) -> DPIASection:
    return _section(section_id, "Mangler oplysninger: " + text, source="missing_information", status="missing_information")


def _build_sections(request: DPIAAssessmentRequest, dpia_required: bool) -> list[DPIASection]:
    subjects = _labels(request.data_subjects, SUBJECT_LABELS)
    categories = _labels(request.personal_data_categories, DATA_LABELS)
    controls = _labels(request.controls, CONTROL_LABELS) if request.controls else "ingen dokumenterede foranstaltninger"
    verified = set(request.verified_controls)
    verified_text = (
        _labels(request.verified_controls, CONTROL_LABELS)
        if request.verified_controls else "ingen kontroller med verificeret evidens"
    )
    rights = set(request.rights_procedures)
    rights_description = request.rights_procedure_description

    def right_section(section_id: str, procedure: str, missing_text: str) -> DPIASection:
        if procedure in rights:
            return _section(section_id, f"Dokumenteret procedure: {rights_description}")
        return _missing_section(section_id, missing_text)
    supplier = f" Leverandøren er angivet som {request.supplier_name}." if request.supplier_name else ""
    transfer = (
        "Det er ikke afklaret, om personoplysninger overføres uden for EU/EØS. Dataflow, fjernadgang og eventuelt overførselsgrundlag skal dokumenteres."
        if request.transfer_outside_eea is None else
        "Der er oplyst overførsel uden for EU/EØS. Oplyst overførselsgrundlag: "
        f"{TRANSFER_MECHANISM_LABELS[request.transfer_mechanism]}."
        if request.transfer_outside_eea else "Der er ikke oplyst overførsel uden for EU/EØS."
    )
    automated = (
        "Løsningen anvendes til automatiserede beslutninger. "
        + ("Menneskelig kontrol er ikke afklaret og skal dokumenteres." if request.human_oversight is None else "Der er oplyst menneskelig kontrol." if request.human_oversight else "Der er ikke oplyst menneskelig kontrol.")
        if request.automated_decisions else "Der er ikke oplyst automatiserede individuelle beslutninger."
    )
    if request.human_oversight is None and not request.automated_decisions:
        automated += " Menneskelig kontrol af AI-output er ikke afklaret og skal dokumenteres."
    screening_note = (
        "Foreløbig screening: behandlingens omfang er ikke afklaret. Det uafklarede kriterium medregnes forsigtigt; dette er ikke dokumentation for faktisk stort omfang. "
        if request.large_scale is None else ""
    )
    timing = " ".join(
        f"{label}: {value}."
        for label, value in (
            ("Behandlingens version", request.processing_version),
            ("Forventet startdato", request.planned_start_date),
            ("Bemærkning til opstart", request.planned_start_note),
            ("Forventet slutdato", request.planned_end_date),
            ("Ophørsvilkår", request.planned_end_condition),
        )
        if value
    )
    department = f" Fagområde: {request.department}." if request.department else ""
    sections = [
        _section("1.1", request.purpose),
        _section("1.2", screening_note + f"Konsekvensanalysen gennemføres før eller som led i anvendelsen af {request.project_name}. Den deterministiske screening vurderer, at en DPIA {'er påkrævet' if dpia_required else 'ikke er entydigt påkrævet ud fra de oplyste kriterier'}; konklusionen skal godkendes af DPO/juridisk funktion.", source="deterministic_rule"),
        _section("1.3", f"{request.organisation} ønsker at anvende en løsning af typen {SOLUTION_LABELS[request.solution_type]} til det beskrevne formål.{supplier}"),
        _section("1.4", f"Oplyst behandling: {request.processing_description} Data hostes i {HOSTING_LABELS[request.hosting_region]}. {transfer} {timing}".strip()),
        _section("1.5", f"Det specifikke formål er: {request.purpose} Videreanvendelse til uforenelige formål er ikke omfattet."),
        _section("1.6", f"Registrerede: {subjects}. Oplysningskategorier: {categories}. Særlige kategorier: {'ja' if request.special_categories else 'nej'}. Strafbare forhold: {'ja' if request.criminal_data else 'nej'}."),
        _section("1.7", f"Hosting er oplyst til {HOSTING_LABELS[request.hosting_region]}.{supplier} {transfer}"),
        _section("1.8", f"Behandlingen udføres af {request.organisation} med {request.owner} som oplyst ejer.{department} {automated}"),
        _section("1.9", f"Planlagte/oplyste foranstaltninger: {controls}. Kontroller med fremlagt evidens: {verified_text}. Kun sidstnævnte indgår risikoreducerende."),
        _section(
            "2.1",
            (
                f"Oplyst behandlingsgrundlag: {LEGAL_BASIS_LABELS[request.legal_basis]}. "
                + (
                    f"Konkret oplyst hjemmel/reference: {request.legal_basis_reference}. "
                    if request.legal_basis_reference
                    else "Der er ikke angivet en konkret sektorlov eller bestemmelse. "
                )
                + (
                    f"Officiel kildereference: {request.legal_basis_source_url}. "
                    if request.legal_basis_source_url
                    else "Der er ikke angivet et officielt kildelink. "
                )
                + "Sammenhængen mellem hjemlen, hvert formål og nødvendigheden skal verificeres."
            )
            if request.legal_basis != "not_assessed"
            else "Mangler oplysninger: behandlingsgrundlaget efter GDPR artikel 6 er ikke afklaret.",
            source="provided_input" if request.legal_basis != "not_assessed" else "missing_information",
            status="requires_review" if request.legal_basis != "not_assessed" else "missing_information",
        ),
        (_missing_section("2.2", "undtagelsesgrundlaget efter GDPR artikel 9, stk. 2, er ikke afklaret.") if request.article_9_basis == "not_assessed" else _section("2.2", f"Oplyst undtagelsesgrundlag efter artikel 9, stk. 2: {ARTICLE_9_LABELS[request.article_9_basis]}. Det konkrete retsgrundlag skal fagligt verificeres.")) if request.special_categories else _section("2.2", "Der er oplyst, at løsningen ikke behandler særlige kategorier af personoplysninger.", source="deterministic_rule", status="not_applicable"),
        (_missing_section("2.3", "hjemmel efter databeskyttelseslovens § 8 er ikke afklaret eller mangler konkret lovreference.") if request.criminal_data_basis == "not_assessed" or not request.criminal_data_legal_reference else _section("2.3", f"Oplyst § 8-grundlag: {CRIMINAL_BASIS_LABELS[request.criminal_data_basis]}. Konkret reference: {request.criminal_data_legal_reference}.")) if request.criminal_data else _section("2.3", "Der er oplyst, at løsningen ikke behandler oplysninger om strafbare forhold.", source="deterministic_rule", status="not_applicable"),
        (_missing_section("2.4", "grundlag for CPR-behandling er ikke afklaret eller mangler konkret lovreference.") if request.cpr_basis == "not_assessed" or not request.cpr_legal_reference else _section("2.4", f"CPR-numre behandles med oplyst grundlag: {CPR_BASIS_LABELS[request.cpr_basis]}. Konkret reference: {request.cpr_legal_reference}.")) if request.cpr_data else _section("2.4", "Der er oplyst, at CPR-numre ikke behandles.", source="deterministic_rule", status="not_applicable"),
        _section("2.5", f"Rimelighed skal vurderes for {subjects}, herunder eventuelle skæve eller uventede virkninger. Oplysningen om sårbare registrerede er {'ja' if request.vulnerable_subjects else 'nej'}."),
        right_section("2.6", "information", "indhold, tidspunkt og kanal for information til de registrerede samt forklaring af AI-brugen skal beskrives."),
        _section("2.7", f"Det dokumenterede formål er afgrænset til: {request.purpose} Ændringer kræver en ny kompatibilitets- og hjemmelsvurdering."),
        _section("2.8", f"De valgte kategorier er {categories}. Nødvendigheden af hver kategori og hvert datafelt skal dokumenteres; oplyst dataminimeringskontrol: {'ja' if 'data_minimisation' in request.controls else 'nej'}."),
        _section("2.9", f"Test- og datakvalitetskontrollen er verificeret med evidens: {request.control_evidence['testing']}.") if "testing" in verified else _missing_section("2.9", "datakvalitetskrav, validering, fejlrettelse og ansvar for urigtige input/output skal dokumenteres med evidens."),
        _section("2.10", f"Oplyst opbevarings-/slettefrist: {request.retention_period.rstrip('.')}. Fristen og faktisk sletning skal verificeres.") if request.retention_period else _missing_section("2.10", "opbevarings- og slettefrister er ikke angivet."),
        (
            _missing_section("2.11", "det er ikke afklaret, om organisationens input eller output anvendes til modeltræning. Leverandørens vilkår, underdatabehandlere og konkrete indstillinger skal dokumenteres.")
            if request.model_training is None else
            _section("2.11", "Modeltræning indgår. Der skal dokumenteres hjemmel og datakilde særskilt for udviklings- og testdata.")
            if request.model_training else
            _section("2.11", "Det er oplyst, at organisationens input og output ikke anvendes til modeltræning. Den konkrete aftale og opsætning skal verificeres. Leverandørmodellens udviklingsgrundlag og risici skal fortsat vurderes.")
        ),
        _section("2.12", "Udviklings- og testforløbet skal omfatte dokumenteret fairness- og bias-test for de relevante registrerede grupper.", source="deterministic_rule"),
        right_section("2.13", "information", "information om udviklingsdata, modelbegrænsninger og forklarlighed skal dokumenteres."),
        _section("2.14", f"Dataminimering under udvikling/test er oplyst som {'en valgt kontrol' if 'data_minimisation' in request.controls else 'ikke dokumenteret'}. Anvendte datasæt og felter skal gennemgås.", source="deterministic_rule"),
        _section("2.15", f"Testkontrollen er verificeret med evidens: {request.control_evidence['testing']}. Acceptkriterierne skal fortsat fagligt gennemgås.") if "testing" in verified else _missing_section("2.15", "acceptkriterier, testdatasæt, fejlrater og procedure for rettelse skal dokumenteres med evidens."),
        _section("2.16", "Driftskontroller skal løbende opdage urimelige udfald og sikre eskalation til den ansvarlige ejer.", source="deterministic_rule"),
        right_section("2.17", "information", "den operationelle information til brugere og registrerede samt forklaring af konkrete output skal dokumenteres."),
        _section("2.18", "Adgang, funktioner og datamængder i drift skal begrænses til det nødvendige for det beskrevne formål.", source="deterministic_rule"),
        _section("2.19", f"Løbende test/monitorering er verificeret med evidens: {request.control_evidence['testing']}.") if "testing" in verified else _missing_section("2.19", "monitorering af datakvalitet, modeldrift, fejl og korrektion i drift skal dokumenteres med evidens."),
        _section("2.20", f"Planlagte sikkerhedsforanstaltninger: {controls}. Verificeret med evidens: {verified_text}. Ikke-verificerede kontroller reducerer ikke restrisiko."),
        _section("2.21", f"Beredskab for brud og hændelser er verificeret med evidens: {request.control_evidence['incident_response']}.") if "incident_response" in verified else _missing_section("2.21", "beredskab, eskalation og anmeldelse ved brud på persondatasikkerheden skal dokumenteres med evidens."),
        right_section("2.22", "information", "privatlivsmeddelelse efter artikel 12-14, herunder AI-brug, datakilder, modtagere og rettigheder, skal vedlægges."),
        right_section("2.23", "access", "procedure for indsigt i input, output, logning og eventuelle relevante modeloplysninger skal dokumenteres."),
        right_section("2.24", "rectification", "procedure for rettelse af både grunddata og afledte resultater skal dokumenteres."),
        right_section("2.25", "erasure", "procedure og frister for sletning i alle systemlag skal dokumenteres."),
        (
            _missing_section("2.26", "behandlingsgrundlaget er ikke afklaret. Relevansen af dataportabilitet skal derfor afklares fagligt.")
            if request.legal_basis == "not_assessed"
            else right_section("2.26", "portability", "dataportabilitetsproceduren skal dokumenteres.")
            if request.legal_basis in {"contract", "consent"}
            else _section("2.26", "Dataportabilitet vurderes ikke relevant for det oplyste behandlingsgrundlag.", source="deterministic_rule", status="not_applicable")
        ),
        (
            _missing_section("2.27", "behandlingsgrundlaget er ikke afklaret. Relevansen af indsigelsesretten skal derfor afklares fagligt.")
            if request.legal_basis == "not_assessed"
            else right_section("2.27", "objection", "kanal, ansvar og teknisk proces for indsigelser skal dokumenteres.")
            if request.legal_basis in {"public_task", "legitimate_interests"}
            else _section("2.27", "Indsigelsesretten efter artikel 21 vurderes ikke direkte relevant for det oplyste behandlingsgrundlag; øvrige rettigheder består.", source="deterministic_rule", status="not_applicable")
        ),
        right_section("2.28", "automated_decision_review", "artikel 22-grundlag, menneskelig indgriben og mulighed for at bestride resultatet skal dokumenteres.") if request.automated_decisions else _section("2.28", automated, source="deterministic_rule", status="not_applicable"),
        _section("2.29", f"{request.supplier_name} er oplyst som leverandør. Databehandlerrolle, instruks, underdatabehandlere, auditret og sletning skal dokumenteres.") if request.supplier_name else _section("2.29", "Der er ikke oplyst en ekstern leverandør. Det skal verificeres, om andre databehandlere indgår.", source="deterministic_rule"),
        _section("2.30", f"{transfer} Overførselsgrundlag, supplerende foranstaltninger og transfer impact assessment skal dokumenteres." if request.transfer_outside_eea is True else transfer, source="missing_information" if request.transfer_outside_eea is None else "provided_input", status="missing_information" if request.transfer_outside_eea is None else "requires_review" if request.transfer_outside_eea else "not_applicable"),
    ]
    if len(sections) != 39 or [item.id for item in sections] != list(SECTION_TITLES):
        raise RuntimeError("DPIA-sektionsmapping er inkonsistent")
    return sections


def _screen_dpia_required(
    request: DPIAAssessmentRequest,
) -> tuple[bool, list[DPIAScreeningCriterion]]:
    """Screen transparently against the nine WP29/EDPB high-risk criteria.

    Two matches are a rule of thumb rather than an automatic legal verdict.
    The individual matches are therefore returned with the assessment so a
    reviewer can see, challenge and document the exact basis for the screen.
    """

    criteria = [
        DPIAScreeningCriterion(
            id="evaluation_scoring",
            label="Evaluering eller scoring",
            matched=request.profiling_scoring,
            explanation=(
                "Løsningen profilerer, scorer eller forudsiger forhold om personer."
                if request.profiling_scoring else
                "Der er ikke oplyst profilering, scoring eller personrettet forudsigelse."
            ),
        ),
        DPIAScreeningCriterion(
            id="automated_decisions",
            label="Automatiske beslutninger med væsentlig virkning",
            matched=request.automated_decisions,
            explanation=(
                "Løsningen træffer eller understøtter beslutninger om personer."
                if request.automated_decisions else
                "Der er ikke oplyst automatiske beslutninger om personer."
            ),
        ),
        DPIAScreeningCriterion(
            id="systematic_monitoring",
            label="Systematisk monitorering",
            matched=request.systematic_monitoring,
            explanation=(
                "Behandlingen indebærer systematisk overvågning eller sporing."
                if request.systematic_monitoring else
                "Der er ikke oplyst systematisk overvågning eller sporing."
            ),
        ),
        DPIAScreeningCriterion(
            id="sensitive_data",
            label="Følsomme eller meget personlige oplysninger",
            matched=request.special_categories or request.criminal_data or request.cpr_data,
            explanation=(
                "Der behandles artikel 9-oplysninger, strafoplysninger eller CPR-numre."
                if request.special_categories or request.criminal_data or request.cpr_data else
                "Der er ikke oplyst artikel 9-oplysninger, strafoplysninger eller CPR-numre."
            ),
        ),
        DPIAScreeningCriterion(
            id="large_scale",
            label="Behandling i stort omfang",
            matched=request.large_scale,
            explanation=(
                "Ikke afklaret. Kriteriet medregnes forsigtigt i den foreløbige screening; dette dokumenterer ikke, at behandlingen faktisk sker i stort omfang."
                if request.large_scale is None else
                "Behandlingen er oplyst at ske i stort omfang."
                if request.large_scale else
                "Behandlingen er ikke oplyst at ske i stort omfang."
            ),
        ),
        DPIAScreeningCriterion(
            id="data_matching",
            label="Sammenstilling af datasæt",
            matched=request.data_matching,
            explanation=(
                "Oplysninger sammenstilles på tværs af registre eller datakilder."
                if request.data_matching else
                "Der er ikke oplyst sammenstilling på tværs af registre eller datakilder."
            ),
        ),
        DPIAScreeningCriterion(
            id="vulnerable_subjects",
            label="Sårbare registrerede",
            matched=request.vulnerable_subjects,
            explanation=(
                "Behandlingen omfatter børn eller andre sårbare personer."
                if request.vulnerable_subjects else
                "Behandlingen er ikke oplyst at omfatte sårbare personer."
            ),
        ),
        DPIAScreeningCriterion(
            id="innovative_technology",
            label="Innovativ teknologi eller organisationsform",
            matched=request.solution_type == "ai_system" or request.model_training is True,
            explanation=(
                "Løsningen er oplyst som et AI-system eller anvender data til modeltræning."
                if request.solution_type == "ai_system" or request.model_training is True else
                "Der er ikke oplyst et selvstændigt AI-system; brug af data til modeltræning er ikke afklaret."
                if request.model_training is None else
                "Der er ikke oplyst et selvstændigt AI-system eller modeltræning."
            ),
        ),
        DPIAScreeningCriterion(
            id="rights_or_service_access",
            label="Adgang til rettighed, ydelse eller kontrakt",
            matched=request.service_access_impact,
            explanation=(
                "Behandlingen kan påvirke personers adgang til en ydelse, rettighed, mulighed eller kontrakt."
                if request.service_access_impact else
                "Behandlingen er ikke oplyst at påvirke adgang til en ydelse, rettighed, mulighed eller kontrakt."
            ),
        ),
    ]
    return sum(item.matched is not False for item in criteria) >= 2, criteria


def _quality_findings(request: DPIAAssessmentRequest, dpia_required: bool) -> tuple[list[str], list[str]]:
    missing: list[str] = []
    blockers: list[str] = []
    if request.legal_basis == "not_assessed":
        finding = "Behandlingsgrundlag efter GDPR artikel 6 er ikke afklaret."
        missing.append(finding); blockers.append(finding)
    if (
        request.legal_basis in {"public_task", "legal_obligation"}
        and len(request.legal_basis_reference.strip()) < 5
    ):
        finding = (
            "Den konkrete nationale eller EU-retlige sektorhjemmel bag det "
            "valgte behandlingsgrundlag er ikke dokumenteret."
        )
        missing.append(finding); blockers.append(finding)
    if request.hosting_region == "unknown":
        finding = "Hostinglokation og dataopbevaringslande er ikke afklaret."
        missing.append(finding); blockers.append(finding)
    if request.large_scale is None:
        finding = "Behandlingens omfang er ikke afklaret; dokumentér antal registrerede, datamængde, varighed og geografisk udbredelse."
        missing.append(finding); blockers.append(finding)
    if request.transfer_outside_eea is None:
        finding = "Eventuel overførsel uden for EU/EØS er ikke afklaret; dataflow, fjernadgang og overførselsgrundlag skal dokumenteres."
        missing.append(finding); blockers.append(finding)
    if request.transfer_outside_eea is True and request.transfer_mechanism == "not_assessed":
        finding = "Overførselsgrundlag for tredjelandsoverførsel er ikke afklaret."
        missing.append(finding); blockers.append(finding)
    if request.special_categories and request.article_9_basis == "not_assessed":
        finding = "Undtagelsesgrundlag efter GDPR artikel 9, stk. 2, er ikke afklaret."
        missing.append(finding); blockers.append(finding)
    if request.criminal_data and (
        request.criminal_data_basis == "not_assessed"
        or not request.criminal_data_legal_reference
    ):
        finding = "Hjemmel og konkret lovreference efter databeskyttelseslovens § 8 er ikke dokumenteret."
        missing.append(finding); blockers.append(finding)
    if request.cpr_data and (
        request.cpr_basis == "not_assessed" or not request.cpr_legal_reference
    ):
        finding = "Grundlag og konkret lovreference for behandling af CPR-numre er ikke dokumenteret."
        missing.append(finding); blockers.append(finding)
    if not request.retention_period:
        finding = "Opbevarings- og slettefrister er ikke dokumenteret."
        missing.append(finding); blockers.append(finding)
    if request.human_oversight is None:
        finding = "Menneskelig kontrol af AI-output er ikke afklaret; ansvar, kontroltrin og mulighed for indgriben skal dokumenteres."
        missing.append(finding); blockers.append(finding)
    if request.automated_decisions and request.human_oversight is False:
        finding = "Automatiserede beslutninger er oplyst uden reel menneskelig kontrol."
        missing.append(finding); blockers.append(finding)
    if request.dpo_involved is None:
        finding = "DPO/databeskyttelsesrådgiverens inddragelse er ikke dokumenteret og skal afklares."
        missing.append(finding); blockers.append(finding)
    if dpia_required and request.dpo_involved is False:
        finding = "DPO/databeskyttelsesrådgiver er ikke inddraget, selv om screeningen udløser DPIA."
        missing.append(finding); blockers.append(finding)
    if not request.controls:
        finding = "Der er ikke oplyst nogen tekniske eller organisatoriske foranstaltninger."
        missing.append(finding); blockers.append(finding)
    unverified = [item for item in request.controls if item not in request.verified_controls]
    if unverified:
        missing.append(
            "Følgende oplyste kontroller mangler implementeringsevidens og reducerer ikke restrisiko: "
            + _labels(unverified, CONTROL_LABELS)
            + "."
        )
    if request.model_training is None:
        finding = "Brug af organisationens input eller output til modeltræning er ikke afklaret."
        missing.append(finding); blockers.append(finding)
    elif request.model_training:
        missing.append("Kilde, repræsentativitet og behandlingsgrundlag for trænings- og testdata skal dokumenteres.")
    required_rights = {"information", "access", "rectification", "erasure", "restriction"}
    if request.legal_basis in {"contract", "consent"}:
        required_rights.add("portability")
    if request.legal_basis in {"public_task", "legitimate_interests"}:
        required_rights.add("objection")
    if request.automated_decisions:
        required_rights.add("automated_decision_review")
    missing_rights = sorted(required_rights.difference(request.rights_procedures))
    if missing_rights:
        missing.append("Rettighedsprocedurer mangler for: " + ", ".join(missing_rights) + ".")
    if "testing" not in request.verified_controls:
        missing.append("Datakvalitet, testkriterier og løbende monitorering mangler verificeret evidens.")
    if "incident_response" not in request.verified_controls:
        missing.append("Beredskab for persondatasikkerhedsbrud mangler verificeret evidens.")
    return missing, blockers


def _completeness(
    request: DPIAAssessmentRequest,
    sections: list[DPIASection],
    missing: list[str],
    blockers: list[str],
) -> int:
    checks = [
        bool(request.project_name), bool(request.organisation), bool(request.owner), bool(request.purpose),
        bool(request.processing_description), bool(request.data_subjects), bool(request.personal_data_categories),
        request.hosting_region != "unknown", request.legal_basis != "not_assessed",
        request.legal_basis not in {"public_task", "legal_obligation"}
        or bool(request.legal_basis_reference),
        bool(request.retention_period), bool(request.controls), bool(request.verified_controls),
        request.transfer_outside_eea is False or (request.transfer_outside_eea is True and request.transfer_mechanism not in {"not_assessed", "not_applicable"}),
        request.human_oversight is not None and (not request.automated_decisions or request.human_oversight),
        not request.special_categories or request.article_9_basis not in {"not_applicable", "not_assessed"},
        not request.criminal_data or (
            request.criminal_data_basis not in {"not_applicable", "not_assessed"}
            and bool(request.criminal_data_legal_reference)
        ),
        not request.cpr_data or (
            request.cpr_basis not in {"not_applicable", "not_assessed"}
            and bool(request.cpr_legal_reference)
        ),
        not request.solution_type in {"ai_system", "saas", "integration"} or bool(request.supplier_name),
        request.large_scale is not None and (not request.large_scale or "logging" in request.verified_controls),
        not request.systematic_monitoring or "data_minimisation" in request.verified_controls,
        not request.vulnerable_subjects or "human_review" in request.verified_controls,
        request.model_training is not None and (
            request.model_training is False or "testing" in request.verified_controls
        ),
        request.dpo_involved is True,
    ]
    field_score = 100 * sum(checks) / len(checks)
    resolved_sections = sum(section.review_status != "missing_information" for section in sections)
    section_score = 100 * resolved_sections / len(sections)
    score = round((field_score + section_score) / 2)
    if missing:
        score = min(score, 95)
    if blockers:
        score = min(score, 70)
    return score


def assess_dpia(
    request: DPIAAssessmentRequest,
    *,
    assessment_id: str,
    created_at: datetime,
) -> DPIAAssessmentResponse:
    """Generate one reproducible DPIA draft without external services."""

    dpia_required, screening_criteria = _screen_dpia_required(request)
    missing, blockers = _quality_findings(request, dpia_required)
    risks = _build_risks(request)
    sections = _build_sections(request, dpia_required)
    for section in sections:
        if section.review_status == "missing_information":
            finding = f"Afsnit {section.id} ({section.title}) mangler oplysninger."
            if finding not in missing:
                missing.append(finding)
    risk_level = max((risk.residual_risk for risk in risks), key=RISK_RANK.__getitem__)
    if blockers:
        status: Literal["blocked", "requires_action", "ready_for_review"] = "blocked"
        status_label = "Blokeret – mangler kritiske oplysninger"
    elif missing:
        status = "requires_action"
        status_label = "Kræver supplerende dokumentation og tiltag"
    elif risk_level in {"high", "very_high"}:
        status = "requires_action"
        status_label = "Kræver risikoreducerende tiltag"
    else:
        status = "ready_for_review"
        status_label = "Klar til faglig gennemgang"
    matched_criteria = [item.label.lower() for item in screening_criteria if item.matched]
    criteria_text = ", ".join(matched_criteria) if matched_criteria else "ingen af de ni registrerede højrisikokriterier"
    matched_count = len(matched_criteria)
    screening_conclusion = (
        f"{matched_count} af 9 europæiske højrisikokriterier matcher. "
        + (
            "Tommelfingerreglen om mindst to kriterier er opfyldt; en DPIA skal gennemføres, medmindre en fagligt dokumenteret undtagelse kan begrundes."
            if dpia_required else
            "Tommelfingerreglen om mindst to kriterier er ikke opfyldt. Ét kriterium eller andre konkrete forhold kan dog stadig gøre en DPIA nødvendig."
        )
    )
    if request.large_scale is None:
        screening_conclusion = (
            f"Foreløbig screening: {matched_count} af 9 højrisikokriterier er oplyst, og behandlingens omfang er ikke afklaret. "
            "Det uafklarede kriterium medregnes forsigtigt, uden at der dermed konstateres stort omfang. "
            + ("En DPIA behandles som nødvendig, indtil screeningens grundlag er afklaret fagligt." if dpia_required else "DPIA-behovet skal afklares fagligt; det foreløbige grundlag når ikke to kriterier.")
        )
    executive_summary = (
        f"{request.organisation} vurderer brugen af {request.project_name} til formålet: {request.purpose} "
        f"Screeningen identificerer {criteria_text}. DPIA er derfor "
        f"{'påkrævet' if dpia_required else 'ikke entydigt påkrævet ud fra de indtastede oplysninger'}. "
        f"Højeste beregnede resterende risikoniveau er {RISK_LEVEL_TEXT[risk_level]}. Resultatet er et deterministisk udkast, "
        "ikke en juridisk godkendelse; alle oplyste kontroller og konklusioner skal verificeres."
    )
    if request.large_scale is None:
        executive_summary = (
            f"{request.organisation} vurderer brugen af {request.project_name} til formålet: {request.purpose} "
            f"{screening_conclusion} Højeste foreløbigt beregnede resterende risikoniveau er {RISK_LEVEL_TEXT[risk_level]}. "
            "Resultatet er et deterministisk udkast, ikke en juridisk godkendelse; uafklarede oplysninger og kontroller skal verificeres."
        )
    scope = (
        f"Analysen omfatter {request.organisation}s behandling i {request.project_name}: "
        f"{request.processing_description} Registrerede er {_labels(request.data_subjects, SUBJECT_LABELS)}, "
        f"og datakategorierne er {_labels(request.personal_data_categories, DATA_LABELS)}. "
        f"Hosting er oplyst til {HOSTING_LABELS[request.hosting_region]}. Analysen omfatter ikke andre "
        "behandlingsaktiviteter eller formål, som ikke er beskrevet i spørgeskemaet."
    )
    next_steps = []
    if blockers:
        next_steps.append("Afklar alle blokerende forhold før løsningen sættes i drift eller vurderingen godkendes.")
    next_steps.extend([
        "Dokumentér evidens for de oplyste kontroller og tildel ansvarlig samt frist for hver risiko.",
        "Lad DPO/juridisk funktion og informationssikkerhed gennemgå lovlighed, risici og resterende risiko.",
        "Inddrag relevante registrerede eller deres repræsentanter, eller dokumentér hvorfor det fravælges.",
        "Eksportér udkastet til skabelonen og færdiggør alle felter markeret som manglende oplysninger.",
    ])
    response = DPIAAssessmentResponse(
        id=assessment_id,
        project_name=request.project_name,
        organisation=request.organisation,
        department=request.department,
        processing_version=request.processing_version,
        created_at=created_at,
        status=status,
        status_label=status_label,
        risk_level=risk_level,
        completeness=_completeness(request, sections, missing, blockers),
        dpia_required=dpia_required,
        screening_criteria=screening_criteria,
        screening_conclusion=screening_conclusion,
        executive_summary=executive_summary,
        scope=scope,
        sections=sections,
        risks=risks,
        missing_information=missing,
        blockers=blockers,
        next_steps=next_steps,
    )
    return response.model_copy(
        update={"template_alignment": assess_edpb_alignment(request, response)}
    )


def attach_legal_verification(
    result: DPIAAssessmentResponse,
    verification: LegalBasisVerificationResponse,
) -> DPIAAssessmentResponse:
    """Attach an immutable live-source receipt and close the review gate.

    The deterministic risk calculation stays independent of the network.  This
    adapter only decides whether the resulting draft may be presented as ready
    for professional review and adds the source receipt to the persisted
    snapshot.
    """

    result.legal_verification = verification
    receipt_summary = ", ".join(
        f"{receipt.provision}: {receipt.match_status}"
        for receipt in verification.receipts
    ) or "ingen kilder valgt"
    section = next((item for item in result.sections if item.id == "2.1"), None)
    if section is not None:
        section.text += (
            f" Online kildetjek udført {verification.checked_at.isoformat()}: "
            f"{receipt_summary}. Kildetjekket bekræfter ikke juridisk relevans."
        )

    if verification.status != "verified_sources":
        finding = (
            "Online kontrol af officielle lovkilder er ikke bestået: "
            + verification.conclusion
        )
        if finding not in result.missing_information:
            result.missing_information.append(finding)
        if finding not in result.blockers:
            result.blockers.append(finding)
        result.status = "blocked"
        result.status_label = "Blokeret – hjemmel eller lovkilder skal afklares"
        result.completeness = min(result.completeness, 70)
        next_step = "Gennemfør et nyt officielt kildetjek og få hjemlen vurderet af juridisk funktion."
        if next_step not in result.next_steps:
            result.next_steps.insert(0, next_step)
    return result
