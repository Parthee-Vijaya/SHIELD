"""
GDPR Compliance Checker for AI Systems
Implements comprehensive GDPR checks specific to AI/ML systems
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
from src.core.models import (
    ProjectInput, ComplianceStatus, ComplianceRequirement,
    LegalFramework, AISystemType
)
import logging

logger = logging.getLogger(__name__)


class GDPRComplianceChecker:
    """
    Checks AI systems against GDPR requirements with AI-specific considerations
    """

    # GDPR Principles (Article 5)
    GDPR_PRINCIPLES = {
        "lawfulness": "Processing must have a legal basis",
        "fairness": "Processing must be fair to data subjects",
        "transparency": "Clear information about processing",
        "purpose_limitation": "Collected for specific, explicit purposes",
        "data_minimization": "Adequate, relevant and limited data",
        "accuracy": "Accurate and kept up to date",
        "storage_limitation": "Kept no longer than necessary",
        "integrity_confidentiality": "Appropriate security measures",
        "accountability": "Demonstrate compliance"
    }

    # Legal bases for processing (Article 6)
    LEGAL_BASES = {
        "consent": "Data subject has given consent",
        "contract": "Necessary for contract performance",
        "legal_obligation": "Necessary for legal compliance",
        "vital_interests": "Protect vital interests",
        "public_task": "Task in public interest",
        "legitimate_interests": "Legitimate interests of controller"
    }

    def __init__(self):
        self.assessment_cache = {}

    def assess_gdpr_compliance(self, project: ProjectInput) -> Dict[str, Any]:
        """
        Comprehensive GDPR assessment for AI systems
        """
        logger.info(f"Starting GDPR compliance check for project: {project.name}")

        requirements = []
        compliance_issues = []
        recommendations = []

        # 1. Check if personal data is processed
        if project.personal_data:
            requirements.extend(self._generate_personal_data_requirements(project))

            # 2. Assess legal basis
            legal_basis_req = self._assess_legal_basis(project)
            requirements.append(legal_basis_req)

            # 3. Check for automated decision-making (Article 22)
            if project.automated_decision_making:
                adm_requirements = self._check_automated_decision_making(project)
                requirements.extend(adm_requirements)
                compliance_issues.append("Automated decision-making detected - special requirements apply")

            # 4. Data Protection Impact Assessment (DPIA) requirement
            if self._requires_dpia(project):
                requirements.append(ComplianceRequirement(
                    id="GDPR_DPIA_001",
                    framework=LegalFramework.GDPR,
                    category="Impact Assessment",
                    description="Data Protection Impact Assessment required",
                    article_reference="Article 35",
                    mandatory=True,
                    applies_to_project=True,
                    compliance_status=ComplianceStatus.NEEDS_REVIEW,
                    recommendations=[
                        "Conduct systematic DPIA",
                        "Document risks to data subjects",
                        "Implement risk mitigation measures"
                    ]
                ))
                compliance_issues.append("DPIA required due to high risk processing")

            # 5. Privacy by Design requirements
            requirements.extend(self._generate_privacy_by_design_requirements(project))

            # 6. Data subject rights
            requirements.extend(self._generate_data_rights_requirements(project))

            # 7. Security measures
            requirements.extend(self._generate_security_requirements(project))

            # 8. Cross-border data transfers
            if "international" in " ".join(project.deployment_region).lower():
                requirements.extend(self._check_data_transfers(project))

        else:
            # Even without personal data, some requirements may apply
            requirements.append(ComplianceRequirement(
                id="GDPR_ANON_001",
                framework=LegalFramework.GDPR,
                category="Data Protection",
                description="Ensure data remains truly anonymous",
                article_reference="Recital 26",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.NEEDS_REVIEW,
                recommendations=["Verify anonymization is irreversible", "Document anonymization methods"]
            ))

        # Calculate compliance score
        compliance_score = self._calculate_compliance_score(requirements)

        # Generate overall assessment
        result = {
            "processes_personal_data": project.personal_data,
            "requirements": requirements,
            "compliance_issues": compliance_issues,
            "compliance_score": compliance_score,
            "high_risk_processing": self._requires_dpia(project),
            "automated_decisions": project.automated_decision_making,
            "recommendations": self._generate_recommendations(project, requirements),
            "data_subject_rights": self._list_applicable_rights(project),
            "summary": self._generate_summary(project, requirements, compliance_score)
        }

        self.assessment_cache[project.name] = result
        logger.info(f"Completed GDPR check: Score={compliance_score:.1f}%")

        return result

    def _generate_personal_data_requirements(self, project: ProjectInput) -> List[ComplianceRequirement]:
        """Generate requirements for personal data processing"""
        requirements = []

        # Lawful basis
        requirements.append(ComplianceRequirement(
            id="GDPR_LAW_001",
            framework=LegalFramework.GDPR,
            category="Lawful Basis",
            description="Establish and document lawful basis for processing",
            article_reference="Article 6",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.NEEDS_REVIEW,
            recommendations=[
                "Identify appropriate legal basis",
                "Document justification",
                "Review if basis changes"
            ]
        ))

        # Transparency
        requirements.append(ComplianceRequirement(
            id="GDPR_TRANS_001",
            framework=LegalFramework.GDPR,
            category="Transparency",
            description="Provide clear privacy information to data subjects",
            article_reference="Articles 12-14",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.PENDING,
            recommendations=[
                "Create comprehensive privacy notice",
                "Explain AI processing in plain language",
                "Include all required information elements"
            ]
        ))

        # Data minimization
        requirements.append(ComplianceRequirement(
            id="GDPR_MIN_001",
            framework=LegalFramework.GDPR,
            category="Data Minimization",
            description="Process only data necessary for specified purposes",
            article_reference="Article 5(1)(c)",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.NEEDS_REVIEW,
            recommendations=[
                "Review data collection scope",
                "Remove unnecessary data fields",
                "Document data necessity"
            ]
        ))

        # Purpose limitation
        requirements.append(ComplianceRequirement(
            id="GDPR_PURP_001",
            framework=LegalFramework.GDPR,
            category="Purpose Limitation",
            description="Use data only for specified, explicit purposes",
            article_reference="Article 5(1)(b)",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.PENDING,
            recommendations=[
                "Clearly define processing purposes",
                "Avoid scope creep",
                "Document any compatible purposes"
            ]
        ))

        return requirements

    def _assess_legal_basis(self, project: ProjectInput) -> ComplianceRequirement:
        """Assess and recommend legal basis for processing"""
        # Intelligent assessment based on project characteristics
        recommended_basis = "legitimate_interests"  # Default

        if "health" in project.sector.lower() or "medical" in project.sector.lower():
            recommended_basis = "consent"  # Health data typically requires explicit consent
        elif "public" in project.sector.lower() or "government" in project.sector.lower():
            recommended_basis = "public_task"
        elif "employment" in project.sector.lower():
            recommended_basis = "contract"

        return ComplianceRequirement(
            id="GDPR_BASIS_001",
            framework=LegalFramework.GDPR,
            category="Legal Basis",
            description=f"Recommended legal basis: {self.LEGAL_BASES[recommended_basis]}",
            article_reference="Article 6",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.NEEDS_REVIEW,
            recommendations=[
                f"Document why '{recommended_basis}' is appropriate",
                "Consider if multiple bases apply",
                "Prepare balancing test if using legitimate interests"
            ]
        )

    def _check_automated_decision_making(self, project: ProjectInput) -> List[ComplianceRequirement]:
        """Check requirements for automated decision-making"""
        requirements = []

        requirements.append(ComplianceRequirement(
            id="GDPR_ADM_001",
            framework=LegalFramework.GDPR,
            category="Automated Decision-Making",
            description="Automated decision-making with legal/significant effects",
            article_reference="Article 22",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.NON_COMPLIANT,
            recommendations=[
                "Implement human review mechanism",
                "Provide opt-out option",
                "Explain logic involved",
                "Enable contestation of decisions"
            ]
        ))

        # Special requirements for AI explainability
        requirements.append(ComplianceRequirement(
            id="GDPR_ADM_002",
            framework=LegalFramework.GDPR,
            category="Explainability",
            description="Provide meaningful information about logic involved",
            article_reference="Articles 13(2)(f), 14(2)(g), 15(1)(h)",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.PENDING,
            recommendations=[
                "Implement explainable AI techniques",
                "Document decision logic",
                "Create user-friendly explanations"
            ]
        ))

        return requirements

    def _requires_dpia(self, project: ProjectInput) -> bool:
        """Determine if DPIA is required"""
        # DPIA triggers
        if project.automated_decision_making:
            return True

        if project.personal_data and any(term in " ".join(project.data_types).lower()
                                         for term in ["biometric", "genetic", "health", "criminal"]):
            return True

        if project.ai_type == AISystemType.COMPUTER_VISION and project.personal_data:
            return True

        if "large scale" in project.description.lower():
            return True

        if "vulnerable" in project.description.lower() or "children" in project.description.lower():
            return True

        return False

    def _generate_privacy_by_design_requirements(self, project: ProjectInput) -> List[ComplianceRequirement]:
        """Generate Privacy by Design requirements"""
        return [
            ComplianceRequirement(
                id="GDPR_PBD_001",
                framework=LegalFramework.GDPR,
                category="Privacy by Design",
                description="Implement data protection by design and by default",
                article_reference="Article 25",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.PENDING,
                recommendations=[
                    "Implement privacy-preserving ML techniques",
                    "Use differential privacy where appropriate",
                    "Minimize data retention periods",
                    "Implement strong access controls"
                ]
            )
        ]

    def _generate_data_rights_requirements(self, project: ProjectInput) -> List[ComplianceRequirement]:
        """Generate requirements for data subject rights"""
        requirements = []

        # Right to information
        requirements.append(ComplianceRequirement(
            id="GDPR_RIGHTS_001",
            framework=LegalFramework.GDPR,
            category="Data Subject Rights",
            description="Enable right to access personal data",
            article_reference="Article 15",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.PENDING,
            recommendations=["Implement data export functionality", "Create data access procedures"]
        ))

        # Right to rectification
        requirements.append(ComplianceRequirement(
            id="GDPR_RIGHTS_002",
            framework=LegalFramework.GDPR,
            category="Data Subject Rights",
            description="Enable correction of inaccurate data",
            article_reference="Article 16",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.PENDING,
            recommendations=["Implement data correction features", "Update ML models after corrections"]
        ))

        # Right to erasure
        requirements.append(ComplianceRequirement(
            id="GDPR_RIGHTS_003",
            framework=LegalFramework.GDPR,
            category="Data Subject Rights",
            description="Enable right to erasure ('right to be forgotten')",
            article_reference="Article 17",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.PENDING,
            recommendations=["Implement data deletion procedures", "Consider ML model updates after deletion"]
        ))

        # Right to object (especially important for AI)
        requirements.append(ComplianceRequirement(
            id="GDPR_RIGHTS_004",
            framework=LegalFramework.GDPR,
            category="Data Subject Rights",
            description="Enable right to object to processing",
            article_reference="Article 21",
            mandatory=True,
            applies_to_project=True,
            compliance_status=ComplianceStatus.PENDING,
            recommendations=["Implement opt-out mechanisms", "Respect objections to profiling"]
        ))

        return requirements

    def _generate_security_requirements(self, project: ProjectInput) -> List[ComplianceRequirement]:
        """Generate security requirements"""
        return [
            ComplianceRequirement(
                id="GDPR_SEC_001",
                framework=LegalFramework.GDPR,
                category="Security",
                description="Implement appropriate technical and organizational measures",
                article_reference="Article 32",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.NEEDS_REVIEW,
                recommendations=[
                    "Implement encryption at rest and in transit",
                    "Use pseudonymization techniques",
                    "Regular security testing",
                    "Access control and authentication",
                    "Audit logging and monitoring"
                ]
            )
        ]

    def _check_data_transfers(self, project: ProjectInput) -> List[ComplianceRequirement]:
        """Check requirements for international data transfers"""
        return [
            ComplianceRequirement(
                id="GDPR_TRANSFER_001",
                framework=LegalFramework.GDPR,
                category="Data Transfers",
                description="Ensure appropriate safeguards for international transfers",
                article_reference="Chapter V (Articles 44-50)",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.NEEDS_REVIEW,
                recommendations=[
                    "Check adequacy decisions",
                    "Implement Standard Contractual Clauses",
                    "Consider data localization"
                ]
            )
        ]

    def _calculate_compliance_score(self, requirements: List[ComplianceRequirement]) -> float:
        """Calculate overall GDPR compliance score"""
        if not requirements:
            return 100.0

        scores = {
            ComplianceStatus.COMPLIANT: 100,
            ComplianceStatus.PARTIALLY_COMPLIANT: 60,
            ComplianceStatus.NEEDS_REVIEW: 30,
            ComplianceStatus.PENDING: 20,
            ComplianceStatus.NON_COMPLIANT: 0
        }

        total_score = sum(scores.get(req.compliance_status, 0) for req in requirements)
        return total_score / len(requirements)

    def _list_applicable_rights(self, project: ProjectInput) -> List[str]:
        """List applicable data subject rights"""
        rights = [
            "Right to be informed (Articles 12-14)",
            "Right of access (Article 15)",
            "Right to rectification (Article 16)",
            "Right to erasure (Article 17)",
            "Right to restrict processing (Article 18)",
            "Right to data portability (Article 20)",
            "Right to object (Article 21)"
        ]

        if project.automated_decision_making:
            rights.append("Rights related to automated decision-making (Article 22)")

        return rights

    def _generate_recommendations(self, project: ProjectInput, requirements: List[ComplianceRequirement]) -> List[str]:
        """Generate prioritized recommendations"""
        recommendations = []

        # Priority 1: Critical non-compliance
        critical = [req for req in requirements if req.compliance_status == ComplianceStatus.NON_COMPLIANT]
        if critical:
            recommendations.append("CRITICAL: Address non-compliant areas immediately")

        # Priority 2: DPIA
        if self._requires_dpia(project):
            recommendations.append("HIGH: Conduct Data Protection Impact Assessment")

        # Priority 3: Legal basis
        recommendations.append("Document and validate legal basis for processing")

        # Priority 4: Technical measures
        recommendations.append("Implement privacy-preserving techniques (differential privacy, federated learning)")

        # Priority 5: Documentation
        recommendations.append("Create comprehensive documentation package")

        return recommendations[:5]  # Top 5 recommendations

    def _generate_summary(self, project: ProjectInput, requirements: List[ComplianceRequirement], score: float) -> str:
        """Generate executive summary"""
        if not project.personal_data:
            return "This AI system does not process personal data, limiting GDPR applicability."

        risk_level = "high" if self._requires_dpia(project) else "standard"

        if score >= 70:
            status = "well-positioned for GDPR compliance"
        elif score >= 40:
            status = "requires significant work for GDPR compliance"
        else:
            status = "has major GDPR compliance gaps"

        summary = f"This AI system processes personal data with {risk_level} risk and {status}. "

        if project.automated_decision_making:
            summary += "Special attention needed for automated decision-making provisions. "

        summary += f"Overall GDPR compliance score: {score:.1f}%"

        return summary