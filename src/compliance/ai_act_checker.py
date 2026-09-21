"""
EU AI Act Compliance Checker
Implements comprehensive checks for EU AI Act requirements
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
from src.core.models import (
    ProjectInput, RiskLevel, ComplianceStatus,
    ComplianceRequirement, LegalFramework, AISystemType
)
import logging

logger = logging.getLogger(__name__)


class AIActComplianceChecker:
    """
    Checks AI systems against EU AI Act requirements
    """

    # Prohibited AI practices (Article 5)
    PROHIBITED_PRACTICES = [
        {
            "id": "AIA_5_1a",
            "description": "Subliminal techniques beyond consciousness",
            "keywords": ["subliminal", "unconscious", "manipulation"]
        },
        {
            "id": "AIA_5_1b",
            "description": "Exploiting vulnerabilities of specific groups",
            "keywords": ["vulnerable", "children", "disability", "exploit"]
        },
        {
            "id": "AIA_5_1c",
            "description": "Social scoring by public authorities",
            "keywords": ["social scoring", "social credit", "behavior evaluation"]
        },
        {
            "id": "AIA_5_1d",
            "description": "Real-time remote biometric identification in public spaces",
            "keywords": ["biometric", "facial recognition", "public spaces", "real-time"]
        }
    ]

    # High-risk AI categories (Annex III)
    HIGH_RISK_CATEGORIES = {
        "biometrics": {
            "description": "Biometric identification and categorization",
            "requirements": ["accuracy", "robustness", "cybersecurity", "transparency"]
        },
        "critical_infrastructure": {
            "description": "Management and operation of critical infrastructure",
            "requirements": ["safety", "reliability", "cybersecurity", "human oversight"]
        },
        "education": {
            "description": "Educational and vocational training",
            "requirements": ["fairness", "non-discrimination", "transparency", "human oversight"]
        },
        "employment": {
            "description": "Employment, worker management and access to self-employment",
            "requirements": ["non-discrimination", "transparency", "human oversight", "accuracy"]
        },
        "essential_services": {
            "description": "Access to essential private and public services",
            "requirements": ["fairness", "transparency", "non-discrimination", "human oversight"]
        },
        "law_enforcement": {
            "description": "Law enforcement purposes",
            "requirements": ["accuracy", "transparency", "human oversight", "accountability"]
        },
        "migration": {
            "description": "Migration, asylum and border control",
            "requirements": ["accuracy", "non-discrimination", "transparency", "human oversight"]
        },
        "justice": {
            "description": "Administration of justice and democratic processes",
            "requirements": ["fairness", "transparency", "human oversight", "accountability"]
        }
    }

    def __init__(self):
        self.requirements_cache = {}
        self.risk_assessment_history = []

    def assess_risk_level(self, project: ProjectInput) -> tuple[RiskLevel, List[str]]:
        """
        Determine the risk level of an AI system according to AI Act
        Returns: (RiskLevel, List of reasons)
        """
        reasons = []

        # Check for prohibited practices
        project_text = f"{project.description} {project.name} {' '.join(project.data_types)}"
        project_text_lower = project_text.lower()

        for prohibited in self.PROHIBITED_PRACTICES:
            if any(keyword in project_text_lower for keyword in prohibited["keywords"]):
                reasons.append(f"Potential prohibited practice: {prohibited['description']}")
                return RiskLevel.UNACCEPTABLE, reasons

        # Check for high-risk categories
        high_risk_indicators = []

        # Sector-based analysis
        sector_lower = project.sector.lower()
        if any(term in sector_lower for term in ["health", "medical", "hospital"]):
            high_risk_indicators.append("Healthcare sector - potential high-risk")
            if project.automated_decision_making:
                high_risk_indicators.append("Automated decision-making in healthcare")

        if any(term in sector_lower for term in ["education", "school", "university"]):
            high_risk_indicators.append("Education sector - potential high-risk")

        if any(term in sector_lower for term in ["employment", "hr", "recruitment"]):
            high_risk_indicators.append("Employment sector - high-risk category")

        if any(term in sector_lower for term in ["finance", "banking", "credit"]):
            high_risk_indicators.append("Financial services - potential high-risk")
            if project.automated_decision_making:
                high_risk_indicators.append("Automated creditworthiness assessment")

        # Data type analysis
        if project.personal_data:
            if "biometric" in " ".join(project.data_types).lower():
                high_risk_indicators.append("Processing biometric data")

        # AI type analysis
        if project.ai_type in [AISystemType.COMPUTER_VISION, AISystemType.PREDICTIVE_AI]:
            if project.automated_decision_making:
                high_risk_indicators.append("Automated decision-making with AI")

        # Determine final risk level
        if high_risk_indicators:
            return RiskLevel.HIGH, high_risk_indicators

        # Check for limited risk (transparency obligations)
        if project.ai_type == AISystemType.GENERATIVE_AI:
            reasons.append("Generative AI system - transparency obligations apply")
            return RiskLevel.LIMITED, reasons

        if "chatbot" in project_text_lower or "virtual assistant" in project_text_lower:
            reasons.append("AI system interacting with natural persons")
            return RiskLevel.LIMITED, reasons

        # Default to minimal risk
        reasons.append("No high-risk indicators identified")
        return RiskLevel.MINIMAL, reasons

    def generate_requirements(self, project: ProjectInput, risk_level: RiskLevel) -> List[ComplianceRequirement]:
        """
        Generate specific compliance requirements based on risk level
        """
        requirements = []

        if risk_level == RiskLevel.UNACCEPTABLE:
            requirements.append(ComplianceRequirement(
                id="AIA_PROHIB_001",
                framework=LegalFramework.EU_AI_ACT,
                category="Prohibition",
                description="This AI system appears to fall under prohibited practices and cannot be deployed in the EU",
                article_reference="Article 5",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.NON_COMPLIANT,
                recommendations=["Redesign system to avoid prohibited practices", "Seek legal consultation"]
            ))

        elif risk_level == RiskLevel.HIGH:
            # Risk management system
            requirements.append(ComplianceRequirement(
                id="AIA_HIGH_001",
                framework=LegalFramework.EU_AI_ACT,
                category="Risk Management",
                description="Establish and maintain risk management system throughout AI lifecycle",
                article_reference="Article 9",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.NEEDS_REVIEW,
                recommendations=["Implement ISO 31000 compliant risk management", "Document all identified risks"]
            ))

            # Data governance
            requirements.append(ComplianceRequirement(
                id="AIA_HIGH_002",
                framework=LegalFramework.EU_AI_ACT,
                category="Data Governance",
                description="Ensure training, validation and testing datasets meet quality criteria",
                article_reference="Article 10",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.NEEDS_REVIEW,
                recommendations=["Document data sources", "Implement data quality checks", "Address potential biases"]
            ))

            # Technical documentation
            requirements.append(ComplianceRequirement(
                id="AIA_HIGH_003",
                framework=LegalFramework.EU_AI_ACT,
                category="Documentation",
                description="Maintain comprehensive technical documentation",
                article_reference="Article 11",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.PENDING,
                recommendations=["Use Annex IV template", "Include algorithm description", "Document performance metrics"]
            ))

            # Logging and record-keeping
            requirements.append(ComplianceRequirement(
                id="AIA_HIGH_004",
                framework=LegalFramework.EU_AI_ACT,
                category="Logging",
                description="Automatic recording of events and logs",
                article_reference="Article 12",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.PENDING,
                recommendations=["Implement audit logging", "Ensure log integrity", "Define retention period"]
            ))

            # Transparency
            requirements.append(ComplianceRequirement(
                id="AIA_HIGH_005",
                framework=LegalFramework.EU_AI_ACT,
                category="Transparency",
                description="Provide clear information to users about AI system",
                article_reference="Article 13",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.PENDING,
                recommendations=["Create user documentation", "Explain AI capabilities and limitations"]
            ))

            # Human oversight
            requirements.append(ComplianceRequirement(
                id="AIA_HIGH_006",
                framework=LegalFramework.EU_AI_ACT,
                category="Human Oversight",
                description="Enable appropriate human oversight measures",
                article_reference="Article 14",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.NEEDS_REVIEW,
                recommendations=["Implement human-in-the-loop mechanisms", "Define oversight procedures"]
            ))

            # Accuracy and robustness
            requirements.append(ComplianceRequirement(
                id="AIA_HIGH_007",
                framework=LegalFramework.EU_AI_ACT,
                category="Performance",
                description="Achieve appropriate levels of accuracy, robustness and cybersecurity",
                article_reference="Article 15",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.PENDING,
                recommendations=["Define and test accuracy metrics", "Implement security measures", "Conduct robustness testing"]
            ))

        elif risk_level == RiskLevel.LIMITED:
            # Transparency obligations
            requirements.append(ComplianceRequirement(
                id="AIA_LIM_001",
                framework=LegalFramework.EU_AI_ACT,
                category="Transparency",
                description="Inform users they are interacting with an AI system",
                article_reference="Article 52",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.PENDING,
                recommendations=["Add clear AI disclosure", "Implement opt-out mechanisms where appropriate"]
            ))

            if project.ai_type == AISystemType.GENERATIVE_AI:
                requirements.append(ComplianceRequirement(
                    id="AIA_LIM_002",
                    framework=LegalFramework.EU_AI_ACT,
                    category="Content Labeling",
                    description="Mark AI-generated content as artificially generated",
                    article_reference="Article 52(3)",
                    mandatory=True,
                    applies_to_project=True,
                    compliance_status=ComplianceStatus.PENDING,
                    recommendations=["Implement watermarking", "Add metadata to generated content"]
                ))

        # General obligations for all AI systems
        requirements.append(ComplianceRequirement(
            id="AIA_GEN_001",
            framework=LegalFramework.EU_AI_ACT,
            category="Quality Management",
            description="Implement appropriate quality management system",
            article_reference="Article 17",
            mandatory=(risk_level == RiskLevel.HIGH),
            applies_to_project=True,
            compliance_status=ComplianceStatus.PENDING,
            recommendations=["Consider ISO/IEC 23053 and 23894", "Document quality processes"]
        ))

        return requirements

    def check_compliance(self, project: ProjectInput) -> Dict[str, Any]:
        """
        Perform comprehensive AI Act compliance check
        """
        logger.info(f"Starting AI Act compliance check for project: {project.name}")

        # Assess risk level
        risk_level, risk_reasons = self.assess_risk_level(project)

        # Generate requirements
        requirements = self.generate_requirements(project, risk_level)

        # Calculate compliance score
        total_requirements = len(requirements)
        compliant_count = sum(1 for req in requirements
                             if req.compliance_status == ComplianceStatus.COMPLIANT)
        compliance_score = (compliant_count / total_requirements * 100) if total_requirements > 0 else 0

        # Determine overall status
        if risk_level == RiskLevel.UNACCEPTABLE:
            overall_status = ComplianceStatus.NON_COMPLIANT
        elif compliance_score >= 80:
            overall_status = ComplianceStatus.COMPLIANT
        elif compliance_score >= 50:
            overall_status = ComplianceStatus.PARTIALLY_COMPLIANT
        else:
            overall_status = ComplianceStatus.NON_COMPLIANT

        result = {
            "risk_level": risk_level,
            "risk_assessment": {
                "level": risk_level.value,
                "reasons": risk_reasons,
                "assessed_at": datetime.now().isoformat()
            },
            "requirements": requirements,
            "compliance_score": compliance_score,
            "overall_status": overall_status,
            "summary": self._generate_summary(risk_level, requirements),
            "next_steps": self._generate_next_steps(risk_level, requirements)
        }

        # Cache result
        self.requirements_cache[project.name] = result
        self.risk_assessment_history.append({
            "project": project.name,
            "timestamp": datetime.now(),
            "risk_level": risk_level
        })

        logger.info(f"Completed AI Act check: Risk={risk_level.value}, Score={compliance_score:.1f}%")
        return result

    def _generate_summary(self, risk_level: RiskLevel, requirements: List[ComplianceRequirement]) -> str:
        """Generate executive summary of AI Act compliance"""
        if risk_level == RiskLevel.UNACCEPTABLE:
            return "This AI system appears to involve prohibited practices under the EU AI Act and cannot be legally deployed."
        elif risk_level == RiskLevel.HIGH:
            return f"This is a high-risk AI system requiring compliance with {len(requirements)} mandatory requirements before deployment."
        elif risk_level == RiskLevel.LIMITED:
            return "This AI system has limited risk but must comply with transparency obligations."
        else:
            return "This AI system is classified as minimal risk with basic compliance requirements."

    def _generate_next_steps(self, risk_level: RiskLevel, requirements: List[ComplianceRequirement]) -> List[str]:
        """Generate actionable next steps"""
        steps = []

        if risk_level == RiskLevel.UNACCEPTABLE:
            steps.append("Immediately cease development/deployment")
            steps.append("Consult legal experts for system redesign")
        elif risk_level == RiskLevel.HIGH:
            steps.append("Conduct conformity assessment")
            steps.append("Prepare technical documentation package")
            steps.append("Implement risk management system")
            steps.append("Register in EU database (when operational)")
        elif risk_level == RiskLevel.LIMITED:
            steps.append("Implement transparency measures")
            steps.append("Add user notifications about AI interaction")

        # Add general steps
        steps.append("Document compliance measures")
        steps.append("Schedule regular compliance reviews")

        return steps