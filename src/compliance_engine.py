"""
Compliance Control Engine med Regelmotor, Evidenskatalog og Beslutningslogik
"""

from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
import json
from functools import lru_cache

class ComplianceDecision(Enum):
    """Compliance beslutningstyper"""
    GO = "go"                    # Alle krav opfyldt
    CONDITIONAL_GO = "betinget-go"  # Kræver yderligere betingelser
    NO_GO = "no-go"              # Ulovlig eller uden hjemmel

class RuleCategory(Enum):
    """Regelkategorier"""
    AI_ACT = "ai_act"
    GDPR = "gdpr"
    FORVALTNINGSRET = "forvaltningsret"
    SIKKERHED = "sikkerhed"

@dataclass
class ComplianceRule:
    """Compliance regel struktur"""
    rule_id: str
    category: RuleCategory
    description: str
    conditions: Dict[str, Any]
    outcomes: Dict[str, Any]
    severity: str  # "hard_stop", "soft_requirement"
    required_evidence: List[str]
    weight: float = 1.0

@dataclass
class EvidenceArtifact:
    """Evidens artefakt struktur"""
    artifact_id: str
    name: str
    category: str  # "juridisk", "ai_act", "sikkerhed", "forvaltning"
    description: str
    template_url: Optional[str] = None
    required_for: List[str] = field(default_factory=list)
    status: str = "pending"  # "pending", "submitted", "approved"

@dataclass
class ComplianceAssessment:
    """Samlet compliance vurdering"""
    decision: ComplianceDecision
    risk_score: int  # 0-100
    hard_stops: List[str]
    conditions: List[str]
    required_artifacts: List[EvidenceArtifact]
    required_tests: List[str]
    applied_rules: List[ComplianceRule]
    timestamp: datetime = field(default_factory=datetime.now)

class ComplianceRuleEngine:
    """Deterministisk regelmotor for compliance kontrol"""

    def __init__(self):
        self.rules = self._load_rules_cached()
        self.evidence_catalog = self._load_evidence_catalog_cached()

    @staticmethod
    @lru_cache(maxsize=1)
    def _load_rules_cached() -> List[ComplianceRule]:
        """Cached version of rule loading"""
        return ComplianceRuleEngine._load_rules_internal()

    @staticmethod
    def _load_rules_internal() -> List[ComplianceRule]:
        """Indlæs compliance regler"""
        return [
            # AI Act - Forbudte praksisser
            ComplianceRule(
                rule_id="AI_ACT_001",
                category=RuleCategory.AI_ACT,
                description="Forbud mod subliminal teknikker",
                conditions={
                    "uses_subliminal": True,
                    "beyond_consciousness": True
                },
                outcomes={
                    "decision": "no-go",
                    "message": "System anvender forbudte subliminal teknikker (AI Act Art. 5)"
                },
                severity="hard_stop",
                required_evidence=["ai_act_conformity_assessment"],
                weight=10.0
            ),
            ComplianceRule(
                rule_id="AI_ACT_002",
                category=RuleCategory.AI_ACT,
                description="Forbud mod social scoring",
                conditions={
                    "social_scoring": True,
                    "by_public_authority": True
                },
                outcomes={
                    "decision": "no-go",
                    "message": "Social scoring af offentlig myndighed er forbudt (AI Act Art. 5)"
                },
                severity="hard_stop",
                required_evidence=["ai_act_conformity_assessment"],
                weight=10.0
            ),

            # AI Act - Højrisiko domæner
            ComplianceRule(
                rule_id="AI_ACT_003",
                category=RuleCategory.AI_ACT,
                description="Højrisiko system - kritisk infrastruktur",
                conditions={
                    "domain": "critical_infrastructure",
                    "risk_level": "high"
                },
                outcomes={
                    "decision": "conditional-go",
                    "message": "Højrisiko system kræver omfattende dokumentation og test"
                },
                severity="soft_requirement",
                required_evidence=[
                    "technical_documentation",
                    "risk_assessment",
                    "conformity_assessment",
                    "quality_management_system"
                ],
                weight=5.0
            ),
            ComplianceRule(
                rule_id="AI_ACT_004",
                category=RuleCategory.AI_ACT,
                description="Højrisiko system - ansættelse/HR",
                conditions={
                    "domain": "employment",
                    "automated_decisions": True
                },
                outcomes={
                    "decision": "conditional-go",
                    "message": "HR AI-system kræver bias testing og human oversight"
                },
                severity="soft_requirement",
                required_evidence=[
                    "bias_audit_report",
                    "human_oversight_plan",
                    "transparency_notice",
                    "impact_assessment"
                ],
                weight=5.0
            ),

            # GDPR regler
            ComplianceRule(
                rule_id="GDPR_001",
                category=RuleCategory.GDPR,
                description="Artikel 6 - Lovligt grundlag",
                conditions={
                    "processes_personal_data": True,
                    "lawful_basis": None
                },
                outcomes={
                    "decision": "no-go",
                    "message": "Mangler lovligt grundlag for behandling af personoplysninger (GDPR Art. 6)"
                },
                severity="hard_stop",
                required_evidence=["lawful_basis_assessment"],
                weight=8.0
            ),
            ComplianceRule(
                rule_id="GDPR_002",
                category=RuleCategory.GDPR,
                description="Artikel 9 - Særlige kategorier",
                conditions={
                    "special_categories": True,
                    "explicit_consent": False
                },
                outcomes={
                    "decision": "no-go",
                    "message": "Behandling af særlige kategorier uden eksplicit samtykke (GDPR Art. 9)"
                },
                severity="hard_stop",
                required_evidence=["consent_mechanism", "dpia"],
                weight=8.0
            ),
            ComplianceRule(
                rule_id="GDPR_003",
                category=RuleCategory.GDPR,
                description="Artikel 22 - Automatiserede beslutninger",
                conditions={
                    "automated_decision_making": True,
                    "legal_effects": True,
                    "human_intervention": False
                },
                outcomes={
                    "decision": "conditional-go",
                    "message": "Automatiserede beslutninger kræver menneskelig intervention mulighed"
                },
                severity="soft_requirement",
                required_evidence=[
                    "adm_safeguards",
                    "human_review_process",
                    "appeal_mechanism"
                ],
                weight=6.0
            ),
            ComplianceRule(
                rule_id="GDPR_004",
                category=RuleCategory.GDPR,
                description="Tredjelandsoverførsler",
                conditions={
                    "third_country_transfer": True,
                    "adequacy_decision": False,
                    "appropriate_safeguards": False
                },
                outcomes={
                    "decision": "no-go",
                    "message": "Ulovlig tredjelandsoverførsel uden passende garantier (GDPR Kap. V)"
                },
                severity="hard_stop",
                required_evidence=["transfer_impact_assessment", "scc_or_bcr"],
                weight=7.0
            ),

            # Forvaltningsret regler
            ComplianceRule(
                rule_id="FORV_001",
                category=RuleCategory.FORVALTNINGSRET,
                description="Krav om lovhjemmel",
                conditions={
                    "public_authority": True,
                    "legal_basis_public": False
                },
                outcomes={
                    "decision": "no-go",
                    "message": "Mangler lovhjemmel for offentlig myndighedsudøvelse"
                },
                severity="hard_stop",
                required_evidence=["legal_basis_memo"],
                weight=9.0
            ),
            ComplianceRule(
                rule_id="FORV_002",
                category=RuleCategory.FORVALTNINGSRET,
                description="Partshøring",
                conditions={
                    "affects_individual_rights": True,
                    "hearing_process": False
                },
                outcomes={
                    "decision": "conditional-go",
                    "message": "Kræver implementering af partshøringsproces"
                },
                severity="soft_requirement",
                required_evidence=["hearing_procedure", "notification_template"],
                weight=4.0
            ),

            # Sikkerhedsregler
            ComplianceRule(
                rule_id="SEC_001",
                category=RuleCategory.SIKKERHED,
                description="Artikel 32 - Passende sikkerhed",
                conditions={
                    "processes_personal_data": True,
                    "security_measures": False
                },
                outcomes={
                    "decision": "conditional-go",
                    "message": "Kræver implementering af passende sikkerhedsforanstaltninger"
                },
                severity="soft_requirement",
                required_evidence=[
                    "security_risk_assessment",
                    "technical_measures_doc",
                    "incident_response_plan"
                ],
                weight=5.0
            )
        ]

    def _load_rules(self) -> List[ComplianceRule]:
        """Legacy method for compatibility - delegates to cached version"""
        return self._load_rules_cached()

    @staticmethod
    @lru_cache(maxsize=1)
    def _load_evidence_catalog_cached() -> Dict[str, EvidenceArtifact]:
        """Cached version of evidence catalog loading"""
        return ComplianceRuleEngine._load_evidence_catalog_internal()

    @staticmethod
    def _load_evidence_catalog_internal() -> Dict[str, EvidenceArtifact]:
        """Indlæs evidens og artefakt katalog"""
        catalog = {
            # Juridiske artefakter
            "dpia": EvidenceArtifact(
                artifact_id="dpia",
                name="Data Protection Impact Assessment (DPIA)",
                category="juridisk",
                description="Konsekvensanalyse for databeskyttelse jf. GDPR Art. 35",
                template_url="https://datatilsynet.dk/dpia-template",
                required_for=["high_risk_processing", "special_categories"]
            ),
            "ropa": EvidenceArtifact(
                artifact_id="ropa",
                name="Record of Processing Activities (ROPA)",
                category="juridisk",
                description="Fortegnelse over behandlingsaktiviteter jf. GDPR Art. 30",
                required_for=["all_processing"]
            ),
            "databehandleraftale": EvidenceArtifact(
                artifact_id="databehandleraftale",
                name="Databehandleraftale",
                category="juridisk",
                description="Aftale med databehandlere jf. GDPR Art. 28",
                required_for=["processor_involvement"]
            ),
            "transfer_impact_assessment": EvidenceArtifact(
                artifact_id="transfer_impact_assessment",
                name="Transfer Impact Assessment (TIA)",
                category="juridisk",
                description="Vurdering af tredjelandsoverførsler post-Schrems II",
                required_for=["third_country_transfers"]
            ),

            # AI Act artefakter
            "technical_documentation": EvidenceArtifact(
                artifact_id="technical_documentation",
                name="Teknisk dokumentation",
                category="ai_act",
                description="Omfattende teknisk dokumentation jf. AI Act Art. 11",
                required_for=["high_risk_ai"]
            ),
            "conformity_assessment": EvidenceArtifact(
                artifact_id="conformity_assessment",
                name="Conformity Assessment",
                category="ai_act",
                description="Overensstemmelsesvurdering jf. AI Act Art. 43",
                required_for=["high_risk_ai"]
            ),
            "model_card": EvidenceArtifact(
                artifact_id="model_card",
                name="Model Card",
                category="ai_act",
                description="Dokumentation af AI-model karakteristika og performance",
                required_for=["ai_systems"]
            ),
            "data_card": EvidenceArtifact(
                artifact_id="data_card",
                name="Data Card",
                category="ai_act",
                description="Dokumentation af træningsdata og datakvalitet",
                required_for=["ai_systems"]
            ),
            "risk_register": EvidenceArtifact(
                artifact_id="risk_register",
                name="Risikoregister",
                category="ai_act",
                description="Register over identificerede risici og mitigering",
                required_for=["high_risk_ai"]
            ),
            "test_eval_reports": EvidenceArtifact(
                artifact_id="test_eval_reports",
                name="Test og evalueringsrapporter",
                category="ai_act",
                description="Dokumentation af test, validering og performance",
                required_for=["ai_systems"]
            ),
            "log_plan": EvidenceArtifact(
                artifact_id="log_plan",
                name="Logningsplan",
                category="ai_act",
                description="Plan for automatisk logning jf. AI Act Art. 12",
                required_for=["high_risk_ai"]
            ),
            "human_oversight_plan": EvidenceArtifact(
                artifact_id="human_oversight_plan",
                name="Human Oversight Plan",
                category="ai_act",
                description="Plan for menneskelig overvågning jf. AI Act Art. 14",
                required_for=["high_risk_ai", "automated_decisions"]
            ),
            "bias_audit_report": EvidenceArtifact(
                artifact_id="bias_audit_report",
                name="Bias Audit Report",
                category="ai_act",
                description="Rapport fra bias testing og fairness vurdering",
                required_for=["employment_ai", "high_risk_ai"]
            ),

            # Sikkerhedsartefakter
            "security_risk_assessment": EvidenceArtifact(
                artifact_id="security_risk_assessment",
                name="Sikkerhedsrisikovurdering",
                category="sikkerhed",
                description="Risikovurdering jf. GDPR Art. 32",
                required_for=["personal_data_processing"]
            ),
            "iso_controls": EvidenceArtifact(
                artifact_id="iso_controls",
                name="ISO 27001/27701 Controls",
                category="sikkerhed",
                description="Dokumentation af implementerede ISO sikkerhedskontroller",
                required_for=["high_risk_processing"]
            ),
            "incident_response_plan": EvidenceArtifact(
                artifact_id="incident_response_plan",
                name="Beredskabsplan",
                category="sikkerhed",
                description="Plan for håndtering af sikkerhedshændelser",
                required_for=["all_processing"]
            ),

            # Forvaltningsartefakter
            "legal_basis_memo": EvidenceArtifact(
                artifact_id="legal_basis_memo",
                name="Hjemmelsnotat",
                category="forvaltning",
                description="Juridisk notat om lovhjemmel",
                required_for=["public_authority_use"]
            ),
            "reasoning_template": EvidenceArtifact(
                artifact_id="reasoning_template",
                name="Begrundelse skabelon",
                category="forvaltning",
                description="Skabelon for afgørelsesbegrundelse",
                required_for=["automated_decisions_public"]
            ),
            "hearing_procedure": EvidenceArtifact(
                artifact_id="hearing_procedure",
                name="Partshøringsproces",
                category="forvaltning",
                description="Procedure for partshøring før afgørelse",
                required_for=["affects_individual_rights"]
            ),
            "journalization_procedure": EvidenceArtifact(
                artifact_id="journalization_procedure",
                name="Journaliseringsprocedure",
                category="forvaltning",
                description="Procedure for journalisering og arkivering",
                required_for=["public_authority_use"]
            )
        }
        return catalog

    def _load_evidence_catalog(self) -> Dict[str, EvidenceArtifact]:
        """Legacy method for compatibility - delegates to cached version"""
        return self._load_evidence_catalog_cached()

    def evaluate_rules(self, system_data: Dict[str, Any]) -> List[Tuple[ComplianceRule, bool]]:
        """Evaluer alle regler mod system data"""
        results = []

        for rule in self.rules:
            # Check om alle betingelser er opfyldt
            rule_triggered = True
            for condition_key, condition_value in rule.conditions.items():
                system_value = system_data.get(condition_key)

                # Håndter None værdier
                if condition_value is None:
                    if system_value is not None:
                        rule_triggered = False
                        break
                elif condition_value is True or condition_value is False:
                    if system_value != condition_value:
                        rule_triggered = False
                        break
                else:
                    # String eller anden værdi sammenligning
                    if system_value != condition_value:
                        rule_triggered = False
                        break

            results.append((rule, rule_triggered))

        return results

    def calculate_risk_score(self, triggered_rules: List[ComplianceRule]) -> int:
        """Beregn samlet risikoscore (0-100)"""
        if not triggered_rules:
            return 0

        total_weight = 0
        weighted_score = 0

        for rule in triggered_rules:
            total_weight += rule.weight
            if rule.severity == "hard_stop":
                weighted_score += rule.weight * 10
            else:
                weighted_score += rule.weight * 5

        # Normaliser til 0-100 skala
        if total_weight > 0:
            risk_score = min(100, int((weighted_score / total_weight) * 10))
        else:
            risk_score = 0

        return risk_score

    def determine_decision(self, triggered_rules: List[ComplianceRule]) -> ComplianceDecision:
        """Bestem samlet compliance beslutning"""
        has_hard_stop = any(rule.severity == "hard_stop" for rule in triggered_rules)
        has_soft_requirements = any(rule.severity == "soft_requirement" for rule in triggered_rules)

        if has_hard_stop:
            return ComplianceDecision.NO_GO
        elif has_soft_requirements:
            return ComplianceDecision.CONDITIONAL_GO
        else:
            return ComplianceDecision.GO

    def collect_required_artifacts(self, triggered_rules: List[ComplianceRule]) -> List[EvidenceArtifact]:
        """Saml alle nødvendige artefakter fra udløste regler"""
        artifact_ids = set()
        for rule in triggered_rules:
            artifact_ids.update(rule.required_evidence)

        artifacts = []
        for artifact_id in artifact_ids:
            if artifact_id in self.evidence_catalog:
                artifacts.append(self.evidence_catalog[artifact_id])

        return artifacts

    def generate_tests(self, system_data: Dict[str, Any], triggered_rules: List[ComplianceRule]) -> List[str]:
        """Generer liste af nødvendige tests baseret på system karakteristika"""
        tests = []

        # AI-specifikke tests
        if system_data.get("uses_ai", False):
            tests.append("Performance testing på test dataset")
            tests.append("Robustness testing mod adversarial examples")
            tests.append("Explainability testing af model output")

        # Bias tests for højrisiko domæner
        if system_data.get("domain") in ["employment", "education", "credit"]:
            tests.append("Bias testing på beskyttede kategorier")
            tests.append("Fairness metrics evaluering")
            tests.append("Disparate impact analysis")

        # GDPR tests
        if system_data.get("processes_personal_data", False):
            tests.append("Data minimization compliance test")
            tests.append("Purpose limitation test")
            tests.append("Data retention policy test")
            tests.append("Subject rights implementation test")

        # Sikkerhedstests
        if any(rule.category == RuleCategory.SIKKERHED for rule in triggered_rules):
            tests.append("Penetration testing")
            tests.append("Vulnerability scanning")
            tests.append("Access control testing")
            tests.append("Encryption validation")

        # Forvaltningsret tests
        if system_data.get("public_authority", False):
            tests.append("Transparency testing af afgørelseslogik")
            tests.append("Audit trail completeness test")
            tests.append("Notification mechanism test")

        return tests

    def perform_compliance_assessment(self, system_data: Dict[str, Any]) -> ComplianceAssessment:
        """Udfør komplet compliance vurdering"""
        # Evaluer regler
        rule_results = self.evaluate_rules(system_data)
        triggered_rules = [rule for rule, triggered in rule_results if triggered]

        # Bestem beslutning
        decision = self.determine_decision(triggered_rules)

        # Beregn risikoscore
        risk_score = self.calculate_risk_score(triggered_rules)

        # Saml hard stops
        hard_stops = [
            rule.outcomes["message"]
            for rule in triggered_rules
            if rule.severity == "hard_stop"
        ]

        # Saml betingelser
        conditions = [
            rule.outcomes["message"]
            for rule in triggered_rules
            if rule.severity == "soft_requirement"
        ]

        # Saml nødvendige artefakter
        required_artifacts = self.collect_required_artifacts(triggered_rules)

        # Generer nødvendige tests
        required_tests = self.generate_tests(system_data, triggered_rules)

        # Opret samlet vurdering
        assessment = ComplianceAssessment(
            decision=decision,
            risk_score=risk_score,
            hard_stops=hard_stops,
            conditions=conditions,
            required_artifacts=required_artifacts,
            required_tests=required_tests,
            applied_rules=triggered_rules
        )

        return assessment

class ComplianceController:
    """Hovedcontroller for Compliance Control systemet"""

    def __init__(self):
        self.rule_engine = ComplianceRuleEngine()

    def transform_assessment_data(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform rå vurderingsdata til regelmotor format"""
        entity_tokens = [
            str(raw_data.get("organisation", "")),
            str(raw_data.get("fagomraade", "")),
            str(raw_data.get("team", ""))
        ]
        if raw_data.get("fagomraade"):
            entity_tokens.append("kommune")
        entity_context = " ".join(token for token in entity_tokens if token).lower()

        lawful_basis_raw = raw_data.get("juridisk_grundlag")
        if lawful_basis_raw in (None, "", "ved_ikke"):
            lawful_basis_value = None
        else:
            lawful_basis_value = True

        transformed = {
            # AI Act relaterede
            "uses_ai": raw_data.get("bruger_ml", False),
            "uses_subliminal": False,  # Skal udvides baseret på system beskrivelse
            "beyond_consciousness": False,
            "social_scoring": "social scoring" in raw_data.get("system_beskrivelse", "").lower(),
            "by_public_authority": any(keyword in entity_context for keyword in [
                "kommune", "kommun", "jobcenter", "borgerservice", "myndighed"
            ]),

            # Domæne og risiko
            "domain": self._determine_domain(raw_data),
            "risk_level": raw_data.get("ai_risiko_kategori", "minimal"),

            # GDPR relaterede
            "processes_personal_data": raw_data.get("personoplysninger", False),
            "lawful_basis": lawful_basis_value,
            "special_categories": any(cat in raw_data.get("persondata_typer", [])
                                     for cat in ["Sundhedsdata", "Biometriske data",
                                                "Særlige kategorier (race, religion, etc.)"]),
            "explicit_consent": raw_data.get("juridisk_grundlag") == "samtykke",

            # Automatiserede beslutninger
            "automated_decisions": raw_data.get("autonome_beslutninger", False),
            "automated_decision_making": raw_data.get("autonome_beslutninger", False),
            "legal_effects": raw_data.get("kritiske_formaal", False),
            "human_intervention": raw_data.get("menneskelig_overvaagning", False),

            # Tredjelandsoverførsler (skal udvides)
            "third_country_transfer": False,
            "adequacy_decision": False,
            "appropriate_safeguards": False,

            # Forvaltningsret
            "public_authority": any(keyword in entity_context for keyword in [
                "kommune", "kommun", "jobcenter", "borgerservice", "myndighed"
            ]),
            "legal_basis_public": raw_data.get("juridisk_grundlag") == "offentlig_opgave",
            "affects_individual_rights": raw_data.get("kritiske_formaal", False),
            "hearing_process": raw_data.get("klage_procedurer", False),

            # Sikkerhed
            "security_measures": raw_data.get("sikkerhedsforanstaltninger", "") != ""
        }

        return transformed

    def run_quick_checks(self, quick_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Kør hurtig regelkontrol baseret på begrænset input."""

        baseline_data = {
            "system_beskrivelse": quick_payload.get("beskrivelse", ""),
            "organisation": quick_payload.get("organisation", ""),
            "team": quick_payload.get("team", ""),
            "fagomraade": quick_payload.get("fagomraade", ""),
            "ai_risiko_kategori": quick_payload.get("ai_risk_level", "minimal"),
            "personoplysninger": quick_payload.get("behandler_persondata", False),
            "autonome_beslutninger": quick_payload.get("automatiserede_beslutninger", False),
            "menneskelig_overvaagning": quick_payload.get("human_in_loop", False),
            "kritiske_formaal": quick_payload.get("har_retslige_konsekvenser", False),
            "juridisk_grundlag": quick_payload.get("juridisk_grundlag"),
            "persondata_typer": quick_payload.get("persondata_typer", []),
        }

        system_data = self.transform_assessment_data(baseline_data)
        rule_results = self.rule_engine.evaluate_rules(system_data)
        triggered_rules = [rule for rule, triggered in rule_results if triggered]

        decision = self.rule_engine.determine_decision(triggered_rules)
        risk_score = self.rule_engine.calculate_risk_score(triggered_rules)

        findings = [
            {
                "regel_id": rule.rule_id,
                "kategori": rule.category.value,
                "alvorlighed": rule.severity,
                "beskrivelse": rule.description,
                "anbefaling": rule.outcomes.get("message"),
            }
            for rule in triggered_rules
        ]

        summary = self._generate_summary(
            ComplianceAssessment(
                decision=decision,
                risk_score=risk_score,
                hard_stops=[rule.outcomes.get("message") for rule in triggered_rules if rule.severity == "hard_stop"],
                conditions=[rule.outcomes.get("message") for rule in triggered_rules if rule.severity == "soft_requirement"],
                required_artifacts=[],
                required_tests=[],
                applied_rules=triggered_rules
            )
        ) if triggered_rules else "Ingen kritiske regler blev udløst, men verificer altid med fuld vurdering."

        flow_steps: List[Dict[str, str]] = []
        obligations: List[str] = []
        classification = "minimal"

        ai_type = quick_payload.get("ai_type")
        sector = quick_payload.get("sector") or quick_payload.get("fagomraade")
        description = (quick_payload.get("beskrivelse") or "").lower()

        if not ai_type:
            flow_steps.append({
                "trin": "Er det et AI-system?",
                "resultat": "Nej",
                "forklaring": "Systemet falder uden for AI-forordningens anvendelsesområde."
            })
            classification = "uden_for_scope"
        else:
            flow_steps.append({
                "trin": "Er det et AI-system?",
                "resultat": "Ja",
                "forklaring": "Systemet anvender AI-teknologi og er dermed omfattet af AI-forordningen."
            })

            prohibited_hits = []
            prohibited_patterns = {
                "real-time biometrisk overvågning": ["real-time", "biometr"],
                "subliminal manipulation": ["subliminal", "manip"],
                "social scoring": ["social scoring", "adfærds", "score"],
            }
            for label, tokens in prohibited_patterns.items():
                if all(token in description for token in tokens):
                    prohibited_hits.append(label)

            if prohibited_hits:
                classification = "forbudt"
                flow_steps.append({
                    "trin": "Er praksissen forbudt?",
                    "resultat": "Ja",
                    "forklaring": f"Identificeret forbudt praksis: {', '.join(prohibited_hits)} (AI Act artikel 5)."
                })
                obligations.append("Stop eller redesignet systemet – praksissen er forbudt under AI-forordningen.")
            else:
                flow_steps.append({
                    "trin": "Er praksissen forbudt?",
                    "resultat": "Nej",
                    "forklaring": "Ingen forbudte AI-praksisser identificeret."
                })

                high_risk_reason = None
                high_risk_map = {
                    "Jobcenter": "Ansættelse og arbejdsformidling (Bilag III, punkt 4)",
                    "Børn og Familie": "Adgang til sociale ydelser for borgere (Bilag III, punkt 5)",
                    "Voksenspecialenheden": "Social- og sundhedsydelser (Bilag III, punkt 5)",
                    "Sundhed og Myndighed": "Sundhedsydelser og triagering (Bilag III, punkt 1)",
                    "Borgerservice og Biblioteker": "Offentlige myndighedsbeslutninger (Bilag III, punkt 5)",
                    "Organisationsstaben": "Forvaltningsmæssige afgørelser (Bilag III, punkt 5)",
                }

                if sector in high_risk_map:
                    high_risk_reason = high_risk_map[sector]
                elif quick_payload.get("automatiserede_beslutninger") and quick_payload.get("behandler_persondata"):
                    high_risk_reason = "Automatiserede afgørelser med betydning for borgeres rettigheder"

                if high_risk_reason:
                    classification = "høj_risiko"
                    flow_steps.append({
                        "trin": "Er systemet højrisiko?",
                        "resultat": "Ja",
                        "forklaring": high_risk_reason
                    })
                    obligations.extend([
                        "Etabler kvalitetssystem, risikostyring og teknisk dokumentation.",
                        "Gennemfør (intern/ekstern) konformitetsvurdering før idriftsættelse.",
                        "Sikre menneskelig overvågning, logning og registrering i EU-databasen."
                    ])
                else:
                    flow_steps.append({
                        "trin": "Er systemet højrisiko?",
                        "resultat": "Nej",
                        "forklaring": "Ingen indikatorer på Annex III-højrisikoområder."
                    })

                    limited_reasons = []
                    if ai_type in {"generative_ai", "nlp"}:
                        limited_reasons.append("Generativ eller sprog-baseret AI kræver gennemsigtighed (AI Act artikel 52).")
                    if "chatbot" in description or "assistant" in description:
                        limited_reasons.append("Chatbots skal informere brugeren om, at de interagerer med AI.")

                    if limited_reasons:
                        classification = "begrænset_risiko"
                        flow_steps.append({
                            "trin": "Er systemet begrænset risiko?",
                            "resultat": "Ja",
                            "forklaring": " ".join(limited_reasons)
                        })
                        obligations.extend([
                            "Informer tydeligt brugere om AI-interaktion.",
                            "Tilbyd klare brugervejledninger og etikettering.",
                        ])
                    else:
                        classification = "minimal"
                        flow_steps.append({
                            "trin": "Er systemet begrænset risiko?",
                            "resultat": "Nej",
                            "forklaring": "Klassificeret som minimal risiko – frivillig god praksis anbefales."
                        })
                        obligations.append("Følg frivillige kodekser for ansvarlig AI og overvåg fremtidige krav.")

        recommend_full = classification in {"forbudt", "høj_risiko"}

        return {
            "decision": decision.value,
            "risk_score": risk_score,
            "findings": findings,
            "summary": summary,
            "flow": flow_steps,
            "classification": classification,
            "obligations": obligations,
            "recommend_full": recommend_full or decision.value != ComplianceDecision.GO.value,
        }

    def _determine_domain(self, data: Dict[str, Any]) -> str:
        """Bestem system domæne baseret på beskrivelse og anvendelse"""
        description = data.get("system_beskrivelse", "").lower()
        application = data.get("anvendelsesomraade", "").lower()
        combined = f"{description} {application}"

        domain_keywords = {
            "critical_infrastructure": ["kritisk", "infrastruktur", "energi", "transport"],
            "employment": ["ansættel", "rekrutter", "hr", "medarbejder", "job"],
            "education": ["uddannel", "skole", "eksamen", "studerende"],
            "credit": ["kredit", "lån", "scoring", "bank"],
            "health": ["sundhed", "patient", "medicinsk", "diagnose"],
            "law_enforcement": ["politi", "retshåndhæv", "kriminal"],
            "migration": ["asyl", "immigration", "visum"],
            "justice": ["domstol", "retssag", "juridisk"]
        }

        for domain, keywords in domain_keywords.items():
            if any(keyword in combined for keyword in keywords):
                return domain

        return "general"

    def process_compliance_control(self, assessment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Proces komplet compliance kontrol"""
        # Transform data
        system_data = self.transform_assessment_data(assessment_data)

        # Udfør vurdering
        assessment = self.rule_engine.perform_compliance_assessment(system_data)

        # Formater output
        result = {
            "beslutning": assessment.decision.value,
            "beslutning_beskrivelse": self._get_decision_description(assessment.decision),
            "risiko_score": assessment.risk_score,
            "risiko_niveau": self._get_risk_level(assessment.risk_score),

            "hard_stops": assessment.hard_stops,
            "betingelser": assessment.conditions,

            "nødvendige_artefakter": [
                {
                    "id": artifact.artifact_id,
                    "navn": artifact.name,
                    "kategori": artifact.category,
                    "beskrivelse": artifact.description,
                    "template_url": artifact.template_url,
                    "status": artifact.status
                }
                for artifact in assessment.required_artifacts
            ],

            "nødvendige_tests": assessment.required_tests,

            "anvendte_regler": [
                {
                    "regel_id": rule.rule_id,
                    "kategori": rule.category.value,
                    "beskrivelse": rule.description,
                    "alvorlighed": rule.severity
                }
                for rule in assessment.applied_rules
            ],

            "timestamp": assessment.timestamp.isoformat(),

            # Sammenfatning
            "sammenfatning": self._generate_summary(assessment),

            # Næste skridt
            "næste_skridt": self._generate_next_steps(assessment)
        }

        return result

    def _get_decision_description(self, decision: ComplianceDecision) -> str:
        """Få beskrivelse af beslutning"""
        descriptions = {
            ComplianceDecision.GO: "Systemet kan implementeres uden kritiske blokeringer. Alle compliance krav kan opfyldes.",
            ComplianceDecision.CONDITIONAL_GO: "Systemet kan implementeres, men kræver yderligere betingelser og dokumentation.",
            ComplianceDecision.NO_GO: "Systemet kan IKKE implementeres i nuværende form. Kritiske lovkrav er ikke opfyldt."
        }
        return descriptions.get(decision, "Ukendt beslutning")

    def _get_risk_level(self, score: int) -> str:
        """Konverter risikoscore til niveau"""
        if score >= 80:
            return "Kritisk"
        elif score >= 60:
            return "Høj"
        elif score >= 40:
            return "Medium"
        elif score >= 20:
            return "Lav"
        else:
            return "Minimal"

    def _generate_summary(self, assessment: ComplianceAssessment) -> str:
        """Generer sammenfatning af vurdering"""
        if assessment.decision == ComplianceDecision.NO_GO:
            return f"Systemet har {len(assessment.hard_stops)} kritiske blokeringer der forhindrer implementering. Disse skal løses før systemet kan godkendes."
        elif assessment.decision == ComplianceDecision.CONDITIONAL_GO:
            return f"Systemet kan implementeres med {len(assessment.conditions)} betingelser. Der kræves {len(assessment.required_artifacts)} dokumenter og {len(assessment.required_tests)} tests."
        else:
            return "Systemet opfylder alle compliance krav og kan implementeres uden yderligere betingelser."

    def _generate_next_steps(self, assessment: ComplianceAssessment) -> List[str]:
        """Generer liste af næste skridt"""
        steps = []

        if assessment.hard_stops:
            steps.append("KRITISK: Løs alle hard stops før videre arbejde")
            for stop in assessment.hard_stops[:3]:  # Vis max 3
                steps.append(f"  • {stop}")

        if assessment.required_artifacts:
            steps.append(f"Udarbejd {len(assessment.required_artifacts)} nødvendige dokumenter")
            priority_artifacts = sorted(assessment.required_artifacts,
                                      key=lambda x: 0 if x.category == "juridisk" else 1)[:3]
            for artifact in priority_artifacts:
                steps.append(f"  • {artifact.name}")

        if assessment.required_tests:
            steps.append(f"Gennemfør {len(assessment.required_tests)} påkrævede tests")
            for test in assessment.required_tests[:3]:
                steps.append(f"  • {test}")

        if assessment.decision == ComplianceDecision.GO:
            steps.append("Systemet er klar til implementering")
            steps.append("Opret løbende monitorering og compliance review")

        return steps
