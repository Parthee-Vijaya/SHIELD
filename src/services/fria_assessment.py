"""Deterministic fundamental-rights impact assessment inspired by FRAIA/IAMA.

The Dutch FRAIA/IAMA method is used as a structured assessment method, not as
Danish law.  The service also covers the minimum elements in Article 27 of the
EU AI Act.  It records human reasoning, calculates risk consistently and is
fail-closed when a legal basis, necessity, proportionality, oversight or remedy
has not been demonstrated.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.services.assessment_common import (
    AssessmentMeta,
    AssessmentSource,
    CaseLinkedAssessmentRequest,
    assessment_identity,
)


METHODOLOGY_VERSION = "fraia-iama-article-27-v1"
LEGAL_NOTICE = (
    "Vurderingen er beslutningsstøtte baseret på de indtastede oplysninger. FRAIA/IAMA "
    "er en nederlandsk metode og ikke i sig selv dansk ret. Resultatet er hverken juridisk "
    "rådgivning, en godkendelse eller den endelige EU AI Act artikel 27-skabelon. En "
    "kvalificeret fagperson og den ansvarlige myndighed skal træffe og dokumentere beslutningen."
)

FundamentalRight = Literal[
    "human_dignity",
    "private_life_and_data_protection",
    "non_discrimination",
    "rights_of_the_child",
    "rights_of_persons_with_disabilities",
    "freedom_of_expression_and_information",
    "good_administration",
    "effective_remedy_and_fair_trial",
    "workers_rights",
    "social_security_and_assistance",
    "healthcare",
    "property",
    "other",
]
VulnerabilityFactor = Literal[
    "children_or_young_people",
    "disability",
    "economic_or_social_disadvantage",
    "dependency_on_public_service",
    "limited_language_or_digital_access",
    "employees_or_job_applicants",
    "migration_or_minority_status",
    "health_condition",
    "none_identified",
]
MeasureStatus = Literal[
    "planned",
    "in_progress",
    "implemented_unverified",
    "implemented_verified",
]
RiskBand = Literal["low", "medium", "high", "very_high"]


class StrictAssessmentPart(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AffectedGroupInput(StrictAssessmentPart):
    id: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9_-]{1,79}$")
    name: str = Field(min_length=2, max_length=255)
    how_affected: str = Field(min_length=20, max_length=5_000)
    estimated_number: int | None = Field(default=None, ge=0)
    vulnerability_factors: list[VulnerabilityFactor] = Field(
        default_factory=list, max_length=8
    )
    consulted: bool
    consultation_details: str = Field(default="", max_length=5_000)

    @field_validator("vulnerability_factors")
    @classmethod
    def vulnerability_factors_must_be_unique(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("sårbarhedsfaktorer må ikke gentages")
        if "none_identified" in values and len(values) > 1:
            raise ValueError(
                "none_identified kan ikke kombineres med andre sårbarhedsfaktorer"
            )
        return values

    @model_validator(mode="after")
    def validate_consultation(self) -> "AffectedGroupInput":
        if self.consulted and len(self.consultation_details) < 20:
            raise ValueError(
                "consultation_details skal beskrive den gennemførte inddragelse"
            )
        return self


class NecessityAssessmentInput(StrictAssessmentPart):
    legitimate_objective: str = Field(min_length=20, max_length=5_000)
    legal_basis_reference: str = Field(default="", max_length=2_000)
    suitability_reasoning: str = Field(min_length=20, max_length=5_000)
    less_intrusive_alternatives: list[str] = Field(default_factory=list, max_length=20)
    chosen_option_reasoning: str = Field(min_length=20, max_length=5_000)
    data_and_function_minimisation: str = Field(min_length=20, max_length=5_000)

    @field_validator("less_intrusive_alternatives")
    @classmethod
    def alternatives_must_be_substantive_and_unique(
        cls, values: list[str]
    ) -> list[str]:
        normalised = [value.strip().casefold() for value in values]
        if len(normalised) != len(set(normalised)):
            raise ValueError("mindre indgribende alternativer må ikke gentages")
        if any(len(value.strip()) < 10 for value in values):
            raise ValueError("hvert alternativ skal beskrives med mindst 10 tegn")
        return values


class ProportionalityAssessmentInput(StrictAssessmentPart):
    expected_public_benefit: str = Field(min_length=20, max_length=5_000)
    expected_rights_cost: str = Field(min_length=20, max_length=5_000)
    balancing_reasoning: str = Field(min_length=40, max_length=10_000)
    conclusion: Literal[
        "proportionate",
        "proportionate_with_conditions",
        "not_proportionate",
        "not_assessed",
    ]


class HumanOversightInput(StrictAssessmentPart):
    enabled: bool
    responsible_role: str = Field(default="", max_length=255)
    can_override_or_stop: bool
    sufficient_time_and_information: bool
    competence_and_training: str = Field(default="", max_length=5_000)
    review_and_override_procedure: str = Field(default="", max_length=5_000)
    automation_bias_controls: str = Field(default="", max_length=5_000)

    @model_validator(mode="after")
    def validate_enabled_oversight(self) -> "HumanOversightInput":
        if self.enabled:
            required = (
                self.responsible_role,
                self.competence_and_training,
                self.review_and_override_procedure,
                self.automation_bias_controls,
            )
            if any(len(value) < 20 for value in required):
                raise ValueError(
                    "aktivt menneskeligt tilsyn kræver en fyldestgørende rolle-, uddannelses-, review- og biasbeskrivelse"
                )
        return self


class ComplaintAndRemedyInput(StrictAssessmentPart):
    people_are_informed: bool
    accessible_complaint_channel: bool
    human_reconsideration_available: bool
    appeal_or_independent_review_available: bool
    contact_point: str = Field(default="", max_length=500)
    response_target: str = Field(default="", max_length=500)
    accessibility_accommodations: str = Field(default="", max_length=5_000)

    @model_validator(mode="after")
    def validate_available_channel(self) -> "ComplaintAndRemedyInput":
        if self.accessible_complaint_channel:
            if len(self.contact_point) < 5 or len(self.response_target) < 5:
                raise ValueError(
                    "en tilgængelig klagekanal kræver kontaktpunkt og svarmål"
                )
            if len(self.accessibility_accommodations) < 20:
                raise ValueError(
                    "beskriv hvordan klagekanalen er tilgængelig for berørte grupper"
                )
        return self


class MonitoringPlanInput(StrictAssessmentPart):
    responsible_owner: str = Field(min_length=2, max_length=255)
    metrics: list[str] = Field(min_length=1, max_length=20)
    review_date: date
    incident_and_escalation_process: str = Field(min_length=20, max_length=5_000)
    change_triggers: list[str] = Field(min_length=1, max_length=20)

    @field_validator("metrics", "change_triggers")
    @classmethod
    def list_items_must_be_substantive_and_unique(cls, values: list[str]) -> list[str]:
        normalised = [value.strip().casefold() for value in values]
        if len(normalised) != len(set(normalised)):
            raise ValueError("værdier må ikke gentages")
        if any(len(value.strip()) < 5 for value in values):
            raise ValueError("hvert punkt skal beskrives med mindst 5 tegn")
        return values


class MitigationMeasureInput(StrictAssessmentPart):
    id: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9_-]{1,79}$")
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=20, max_length=5_000)
    owner: str = Field(min_length=2, max_length=255)
    status: MeasureStatus
    evidence: str = Field(default="", max_length=5_000)
    due_date: date | None = None

    @model_validator(mode="after")
    def validate_evidence_and_due_date(self) -> "MitigationMeasureInput":
        if self.status == "implemented_verified" and len(self.evidence) < 20:
            raise ValueError(
                "en verificeret foranstaltning kræver dokumenteret evidens"
            )
        if self.status in {"planned", "in_progress"} and self.due_date is None:
            raise ValueError(
                "en planlagt eller igangværende foranstaltning kræver en frist"
            )
        return self


class FundamentalRightImpactInput(StrictAssessmentPart):
    id: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9_-]{1,79}$")
    right: FundamentalRight
    other_right_name: str = Field(default="", max_length=255)
    impact_description: str = Field(min_length=20, max_length=5_000)
    harm_scenarios: list[str] = Field(min_length=1, max_length=20)
    affected_group_ids: list[str] = Field(min_length=1, max_length=30)
    evidence_references: list[str] = Field(default_factory=list, max_length=30)
    severity: int = Field(ge=1, le=4)
    likelihood: int = Field(ge=1, le=4)
    measure_ids: list[str] = Field(default_factory=list, max_length=30)
    expected_residual_severity: int = Field(ge=1, le=4)
    expected_residual_likelihood: int = Field(ge=1, le=4)

    @field_validator(
        "harm_scenarios", "affected_group_ids", "evidence_references", "measure_ids"
    )
    @classmethod
    def list_values_must_be_unique(cls, values: list[str]) -> list[str]:
        normalised = [value.strip().casefold() for value in values]
        if len(normalised) != len(set(normalised)):
            raise ValueError("værdier må ikke gentages")
        return values

    @model_validator(mode="after")
    def validate_right_and_residual_claim(self) -> "FundamentalRightImpactInput":
        if self.right == "other" and len(self.other_right_name) < 3:
            raise ValueError("other_right_name er påkrævet for en anden grundrettighed")
        if self.right != "other" and self.other_right_name:
            raise ValueError("other_right_name må kun bruges sammen med right=other")
        if self.expected_residual_severity > self.severity:
            raise ValueError(
                "forventet resterende alvor må ikke overstige den iboende alvor"
            )
        if self.expected_residual_likelihood > self.likelihood:
            raise ValueError(
                "forventet resterende sandsynlighed må ikke overstige den iboende sandsynlighed"
            )
        reduced = (
            self.expected_residual_severity < self.severity
            or self.expected_residual_likelihood < self.likelihood
        )
        if reduced and not self.measure_ids:
            raise ValueError(
                "en forventet risikoreduktion kræver mindst én foranstaltning"
            )
        return self


class FRIAAssessmentRequest(CaseLinkedAssessmentRequest):
    purpose: str = Field(min_length=20, max_length=10_000)
    deployment_context: str = Field(min_length=20, max_length=10_000)
    use_period_and_frequency: str = Field(min_length=20, max_length=5_000)
    makes_or_supports_decisions_about_people: bool
    decision_owner: str = Field(min_length=2, max_length=255)
    rights_or_dpo_expert_involved: bool
    affected_groups: list[AffectedGroupInput] = Field(min_length=1, max_length=30)
    rights_impacts: list[FundamentalRightImpactInput] = Field(
        min_length=1, max_length=50
    )
    necessity: NecessityAssessmentInput
    proportionality: ProportionalityAssessmentInput
    human_oversight: HumanOversightInput
    complaints_and_remedies: ComplaintAndRemedyInput
    measures: list[MitigationMeasureInput] = Field(default_factory=list, max_length=50)
    monitoring: MonitoringPlanInput

    @model_validator(mode="after")
    def validate_references(self) -> "FRIAAssessmentRequest":
        group_ids = [group.id for group in self.affected_groups]
        impact_ids = [impact.id for impact in self.rights_impacts]
        measure_ids = [measure.id for measure in self.measures]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError("affected_groups skal have unikke id'er")
        if len(impact_ids) != len(set(impact_ids)):
            raise ValueError("rights_impacts skal have unikke id'er")
        if len(measure_ids) != len(set(measure_ids)):
            raise ValueError("measures skal have unikke id'er")
        known_groups = set(group_ids)
        known_measures = set(measure_ids)
        for impact in self.rights_impacts:
            unknown_groups = set(impact.affected_group_ids) - known_groups
            if unknown_groups:
                raise ValueError(
                    f"ukendte affected_group_ids i {impact.id}: {sorted(unknown_groups)}"
                )
            unknown_measures = set(impact.measure_ids) - known_measures
            if unknown_measures:
                raise ValueError(
                    f"ukendte measure_ids i {impact.id}: {sorted(unknown_measures)}"
                )
        return self


class RightRiskFinding(BaseModel):
    impact_id: str
    right: FundamentalRight
    right_label: str
    charter_reference: str
    impact_description: str
    affected_group_ids: list[str]
    harm_scenarios: list[str]
    evidence_references: list[str]
    inherent_score: int = Field(ge=1, le=16)
    inherent_risk: RiskBand
    residual_score: int = Field(ge=1, le=16)
    residual_risk: RiskBand
    claimed_residual_score: int = Field(ge=1, le=16)
    effective_measure_ids: list[str]
    unverified_measure_ids: list[str]
    calculation_basis: str


class FRIAAssessmentResponse(BaseModel):
    meta: AssessmentMeta
    decision_readiness: Literal[
        "blocked", "requires_action", "ready_for_human_decision"
    ]
    decision_readiness_label: str
    completeness: int = Field(ge=0, le=100)
    overall_inherent_risk: RiskBand
    overall_residual_risk: RiskBand
    affected_groups: list[AffectedGroupInput]
    rights_findings: list[RightRiskFinding]
    necessity_demonstrated: bool
    proportionality_conclusion: Literal[
        "proportionate",
        "proportionate_with_conditions",
        "not_proportionate",
        "not_assessed",
    ]
    human_oversight_ready: bool
    complaints_and_remedies_ready: bool
    measures: list[MitigationMeasureInput]
    monitoring: MonitoringPlanInput
    blockers: list[str]
    action_items: list[str]
    requires_human_approval: Literal[True] = True
    sources: list[AssessmentSource]


RIGHT_METADATA: dict[FundamentalRight, tuple[str, str]] = {
    "human_dignity": ("Menneskelig værdighed", "EU Charter Article 1"),
    "private_life_and_data_protection": (
        "Privatliv og databeskyttelse",
        "EU Charter Articles 7–8",
    ),
    "non_discrimination": ("Ikke-forskelsbehandling", "EU Charter Article 21"),
    "rights_of_the_child": ("Barnets rettigheder", "EU Charter Article 24"),
    "rights_of_persons_with_disabilities": (
        "Rettigheder for personer med handicap",
        "EU Charter Article 26",
    ),
    "freedom_of_expression_and_information": (
        "Ytrings- og informationsfrihed",
        "EU Charter Article 11",
    ),
    "good_administration": (
        "God forvaltning",
        "EU Charter Article 41 / national administrative law",
    ),
    "effective_remedy_and_fair_trial": (
        "Effektive retsmidler og retfærdig rettergang",
        "EU Charter Article 47",
    ),
    "workers_rights": ("Arbejdstagerrettigheder", "EU Charter Articles 27–31"),
    "social_security_and_assistance": (
        "Social sikring og bistand",
        "EU Charter Article 34",
    ),
    "healthcare": ("Sundhedsbeskyttelse", "EU Charter Article 35"),
    "property": ("Ejendomsret", "EU Charter Article 17"),
    "other": ("Anden angivet grundrettighed", "Requires legal mapping"),
}

SOURCES = [
    AssessmentSource(
        id="nl-fraia",
        title="Fundamental Rights and Algorithms Impact Assessment (FRAIA)",
        provision="Steps 1–4 and annex",
        url="https://www.government.nl/documents/2021/07/31/impact-assessment-fundamental-rights-and-algorithms",
        authority="national_government_methodology",
    ),
    AssessmentSource(
        id="nl-iama-2026",
        title="Toelichtingsdocument Impact Assessment Mensenrechten en Algoritmes",
        provision="2026 explanatory methodology",
        url="https://www.rijksoverheid.nl/documenten/2026/02/16/toelichtingsdocument-impact-assessment-mensenrechten-en-algoritmes",
        authority="national_government_methodology",
    ),
    AssessmentSource(
        id="eu-ai-act-article-27",
        title="Regulation (EU) 2024/1689 (Artificial Intelligence Act)",
        provision="Article 27",
        url="https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
        authority="eu_legislation",
    ),
    AssessmentSource(
        id="eu-charter",
        title="Charter of Fundamental Rights of the European Union",
        provision="Titles I–VII",
        url="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:12012P/TXT",
        authority="eu_legislation",
    ),
]

RISK_ORDER: dict[RiskBand, int] = {"low": 1, "medium": 2, "high": 3, "very_high": 4}


def risk_band(score: int) -> RiskBand:
    """Map a 1–16 likelihood×severity score to a stable four-band matrix."""

    if score <= 3:
        return "low"
    if score <= 7:
        return "medium"
    if score <= 11:
        return "high"
    return "very_high"


def _greatest_risk(bands: list[RiskBand]) -> RiskBand:
    return max(bands, key=RISK_ORDER.__getitem__)


def _right_findings(request: FRIAAssessmentRequest) -> list[RightRiskFinding]:
    measures = {measure.id: measure for measure in request.measures}
    findings: list[RightRiskFinding] = []
    for impact in request.rights_impacts:
        linked = [measures[measure_id] for measure_id in impact.measure_ids]
        effective = [
            measure.id for measure in linked if measure.status == "implemented_verified"
        ]
        unverified = [
            measure.id for measure in linked if measure.status != "implemented_verified"
        ]
        all_linked_verified = bool(linked) and not unverified
        inherent_score = impact.severity * impact.likelihood
        claimed_residual_score = (
            impact.expected_residual_severity * impact.expected_residual_likelihood
        )
        residual_score = (
            claimed_residual_score if all_linked_verified else inherent_score
        )
        right_label, charter_reference = RIGHT_METADATA[impact.right]
        if impact.right == "other":
            right_label = impact.other_right_name
        findings.append(
            RightRiskFinding(
                impact_id=impact.id,
                right=impact.right,
                right_label=right_label,
                charter_reference=charter_reference,
                impact_description=impact.impact_description,
                affected_group_ids=impact.affected_group_ids,
                harm_scenarios=impact.harm_scenarios,
                evidence_references=impact.evidence_references,
                inherent_score=inherent_score,
                inherent_risk=risk_band(inherent_score),
                residual_score=residual_score,
                residual_risk=risk_band(residual_score),
                claimed_residual_score=claimed_residual_score,
                effective_measure_ids=effective,
                unverified_measure_ids=unverified,
                calculation_basis=(
                    "Den forventede resterende risiko anvendes, fordi alle tilknyttede foranstaltninger er implementeret og verificeret."
                    if all_linked_verified
                    else "Iboende risiko fastholdes som resterende risiko, indtil alle tilknyttede foranstaltninger er implementeret og verificeret."
                ),
            )
        )
    return findings


def _completeness_checks(
    request: FRIAAssessmentRequest,
    findings: list[RightRiskFinding],
    *,
    assessed_at: datetime,
) -> list[bool]:
    vulnerable_groups_consulted = all(
        group.consulted
        for group in request.affected_groups
        if group.vulnerability_factors
        and group.vulnerability_factors != ["none_identified"]
    )
    oversight_complete = all(
        [
            request.human_oversight.enabled,
            request.human_oversight.can_override_or_stop,
            request.human_oversight.sufficient_time_and_information,
        ]
    )
    remedy_complete = all(
        [
            request.complaints_and_remedies.people_are_informed,
            request.complaints_and_remedies.accessible_complaint_channel,
            request.complaints_and_remedies.human_reconsideration_available,
            request.complaints_and_remedies.appeal_or_independent_review_available,
        ]
    )
    return [
        len(request.necessity.legal_basis_reference) >= 5,
        bool(request.necessity.less_intrusive_alternatives),
        request.proportionality.conclusion
        in {"proportionate", "proportionate_with_conditions"},
        oversight_complete,
        remedy_complete if request.makes_or_supports_decisions_about_people else True,
        all(
            finding.effective_measure_ids
            for finding in findings
            if finding.inherent_risk in {"high", "very_high"}
        ),
        all(impact.evidence_references for impact in request.rights_impacts),
        vulnerable_groups_consulted,
        request.rights_or_dpo_expert_involved,
        bool(
            request.monitoring.metrics
            and request.monitoring.change_triggers
            and request.monitoring.review_date > assessed_at.date()
        ),
    ]


def assess_fria(
    request: FRIAAssessmentRequest,
    *,
    assessment_id: str | None = None,
    assessed_at: datetime | None = None,
) -> FRIAAssessmentResponse:
    """Evaluate rights impacts and conservatively determine decision readiness."""

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
    findings = _right_findings(request)
    blockers: list[str] = []
    actions: list[str] = []

    if len(request.necessity.legal_basis_reference) < 5:
        blockers.append(
            "Dokumentér et tilstrækkeligt præcist retsgrundlag for anvendelsen og de understøttede beslutninger."
        )
    if not request.necessity.less_intrusive_alternatives:
        blockers.append(
            "Undersøg og dokumentér mindst ét mindre indgribende alternativ."
        )
    if request.proportionality.conclusion == "not_assessed":
        blockers.append(
            "Nødvendigheds- og proportionalitetsafvejningen er ikke afsluttet."
        )
    elif request.proportionality.conclusion == "not_proportionate":
        blockers.append("Den ansvarlige har vurderet indgrebet som uproportionalt.")
    elif request.proportionality.conclusion == "proportionate_with_conditions":
        actions.append(
            "Gør proportionalitetsvurderingens betingelser til kontroller med ejer, frist og evidens."
        )

    high_inherent = any(
        finding.inherent_risk in {"high", "very_high"} for finding in findings
    )
    if high_inherent and not request.human_oversight.enabled:
        blockers.append(
            "Høje eller meget høje grundrettighedsrisici kræver dokumenteret menneskeligt tilsyn."
        )
    if high_inherent and not request.human_oversight.can_override_or_stop:
        blockers.append(
            "Den tilsynsførende skal kunne tilsidesætte output eller stoppe brugen."
        )
    if high_inherent and not request.human_oversight.sufficient_time_and_information:
        blockers.append(
            "Den tilsynsførende mangler dokumenteret tid eller information til et reelt review."
        )

    remedies = request.complaints_and_remedies
    if request.makes_or_supports_decisions_about_people:
        if not remedies.people_are_informed:
            blockers.append(
                "Berørte personer skal informeres om systemets rolle i beslutningen."
            )
        if not remedies.accessible_complaint_channel:
            blockers.append("Etablér en tilgængelig klagekanal.")
        if not remedies.human_reconsideration_available:
            blockers.append(
                "Gør menneskelig genvurdering af den konkrete beslutning tilgængelig."
            )
        if not remedies.appeal_or_independent_review_available:
            blockers.append("Afklar adgang til klage, appel eller uafhængigt review.")

    for finding in findings:
        if finding.residual_risk == "very_high":
            blockers.append(
                f"{finding.right_label}: resterende risiko er meget høj og blokerer en positiv beslutning."
            )
        elif finding.residual_risk == "high":
            actions.append(
                f"{finding.right_label}: reducér eller accepter eksplicit den høje resterende risiko på korrekt beslutningsniveau."
            )
        if finding.unverified_measure_ids:
            actions.append(
                f"{finding.right_label}: verificér foranstaltningerne {', '.join(finding.unverified_measure_ids)} med evidens."
            )
        if not finding.effective_measure_ids and finding.inherent_risk in {
            "high",
            "very_high",
        }:
            actions.append(
                f"{finding.right_label}: knyt mindst én implementeret og verificeret foranstaltning til risikoen."
            )

    for impact in request.rights_impacts:
        if not impact.evidence_references:
            actions.append(
                f"{RIGHT_METADATA[impact.right][0]}: tilføj evidens for risikobeskrivelsen og scoringen."
            )

    for group in request.affected_groups:
        is_vulnerable = bool(
            group.vulnerability_factors
            and group.vulnerability_factors != ["none_identified"]
        )
        if is_vulnerable and not group.consulted:
            actions.append(
                f"Inddrag eller begrund manglende inddragelse af den sårbare gruppe '{group.name}'."
            )

    if not request.rights_or_dpo_expert_involved:
        actions.append(
            "Inddrag DPO og/eller en grundrettighedsfaglig specialist i det dokumenterede review."
        )

    if request.monitoring.review_date <= assessed_at.date():
        actions.append(
            "Fastlæg en fremtidig dato for næste dokumenterede grundrettighedsreview."
        )
    for measure in request.measures:
        if (
            measure.status in {"planned", "in_progress"}
            and measure.due_date is not None
            and measure.due_date <= assessed_at.date()
        ):
            actions.append(
                f"Foranstaltningen '{measure.title}' har en overskredet frist og skal omplanlægges eller lukkes."
            )

    checks = _completeness_checks(request, findings, assessed_at=assessed_at)
    completeness = round(100 * sum(checks) / len(checks))
    overall_inherent = _greatest_risk([finding.inherent_risk for finding in findings])
    overall_residual = _greatest_risk([finding.residual_risk for finding in findings])

    blockers = list(dict.fromkeys(blockers))
    actions = list(dict.fromkeys(actions))
    if blockers:
        readiness: Literal["blocked", "requires_action", "ready_for_human_decision"] = (
            "blocked"
        )
        readiness_label = "Blokeret – mangler skal lukkes før beslutning"
    elif actions or completeness < 100 or overall_residual in {"medium", "high"}:
        readiness = "requires_action"
        readiness_label = "Kræver handling og menneskeligt review"
    else:
        readiness = "ready_for_human_decision"
        readiness_label = "Klar til dokumenteret menneskelig beslutning"

    return FRIAAssessmentResponse(
        meta=meta,
        decision_readiness=readiness,
        decision_readiness_label=readiness_label,
        completeness=completeness,
        overall_inherent_risk=overall_inherent,
        overall_residual_risk=overall_residual,
        affected_groups=request.affected_groups,
        rights_findings=findings,
        necessity_demonstrated=bool(
            len(request.necessity.legal_basis_reference) >= 5
            and request.necessity.less_intrusive_alternatives
        ),
        proportionality_conclusion=request.proportionality.conclusion,
        human_oversight_ready=all(
            [
                request.human_oversight.enabled,
                request.human_oversight.can_override_or_stop,
                request.human_oversight.sufficient_time_and_information,
            ]
        ),
        complaints_and_remedies_ready=(
            all(
                [
                    remedies.people_are_informed,
                    remedies.accessible_complaint_channel,
                    remedies.human_reconsideration_available,
                    remedies.appeal_or_independent_review_available,
                ]
            )
            if request.makes_or_supports_decisions_about_people
            else True
        ),
        measures=request.measures,
        monitoring=request.monitoring,
        blockers=blockers,
        action_items=actions,
        sources=SOURCES,
    )


# Readable alias for domain callers that do not use the FRAIA acronym.
assess_fundamental_rights = assess_fria
