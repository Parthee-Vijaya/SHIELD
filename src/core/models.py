"""Data models for the AI Compliance Platform"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict


class RiskLevel(str, Enum):
    """AI Act Risk Levels"""
    UNACCEPTABLE = "unacceptable"
    HIGH = "high"
    LIMITED = "limited"
    MINIMAL = "minimal"
    NOT_APPLICABLE = "not_applicable"


class ComplianceStatus(str, Enum):
    """Compliance assessment status"""
    COMPLIANT = "compliant"
    PARTIALLY_COMPLIANT = "partially_compliant"
    NON_COMPLIANT = "non_compliant"
    NEEDS_REVIEW = "needs_review"
    PENDING = "pending"


class AISystemType(str, Enum):
    """Types of AI systems"""
    GENERATIVE_AI = "generative_ai"
    PREDICTIVE_AI = "predictive_ai"
    CLASSIFICATION = "classification"
    RECOMMENDATION = "recommendation"
    COMPUTER_VISION = "computer_vision"
    NLP = "nlp"
    ROBOTICS = "robotics"
    OTHER = "other"


class LegalFramework(str, Enum):
    """Legal frameworks to check against"""
    EU_AI_ACT = "eu_ai_act"
    GDPR = "gdpr"
    DANISH_DATA_ACT = "danish_data_act"
    SECTOR_SPECIFIC = "sector_specific"
    PRODUCT_LIABILITY = "product_liability"
    INTELLECTUAL_PROPERTY = "intellectual_property"


class ProjectInput(BaseModel):
    """Input model for project/idea submission"""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., description="Project or system name")
    description: str = Field(..., description="Detailed description of the AI system")
    ai_type: AISystemType = Field(..., description="Type of AI system")
    sector: str = Field(..., description="Industry sector (e.g., healthcare, finance)")
    data_types: List[str] = Field(default_factory=list, description="Types of data processed")
    personal_data: bool = Field(False, description="Whether personal data is processed")
    automated_decision_making: bool = Field(False, description="Whether system makes automated decisions")
    target_users: List[str] = Field(default_factory=list, description="Target user groups")
    deployment_region: List[str] = Field(default=["EU", "Denmark"], description="Deployment regions")
    additional_info: Optional[Dict[str, Any]] = Field(default=None, description="Additional project information")


class ComplianceRequirement(BaseModel):
    """Individual compliance requirement"""
    id: str = Field(..., description="Unique requirement ID")
    framework: LegalFramework = Field(..., description="Legal framework")
    category: str = Field(..., description="Requirement category")
    description: str = Field(..., description="Requirement description")
    article_reference: Optional[str] = Field(None, description="Legal article reference")
    mandatory: bool = Field(True, description="Whether requirement is mandatory")
    applies_to_project: bool = Field(False, description="Whether requirement applies")
    compliance_status: ComplianceStatus = Field(ComplianceStatus.PENDING)
    evidence: Optional[List[str]] = Field(default_factory=list, description="Evidence of compliance")
    recommendations: Optional[List[str]] = Field(default_factory=list, description="Compliance recommendations")


class ComplianceAssessment(BaseModel):
    """Complete compliance assessment result"""
    project_id: str = Field(..., description="Unique project ID")
    project_name: str = Field(..., description="Project name")
    assessment_date: datetime = Field(default_factory=datetime.now)
    risk_level: RiskLevel = Field(..., description="AI Act risk level")
    overall_status: ComplianceStatus = Field(..., description="Overall compliance status")
    compliance_score: float = Field(..., description="Compliance score (0-100)")

    # Framework-specific assessments
    ai_act_compliance: Dict[str, Any] = Field(default_factory=dict)
    gdpr_compliance: Dict[str, Any] = Field(default_factory=dict)
    sector_compliance: Dict[str, Any] = Field(default_factory=dict)

    # Detailed requirements
    requirements: List[ComplianceRequirement] = Field(default_factory=list)

    # Risks and recommendations
    identified_risks: List[Dict[str, Any]] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    action_items: List[Dict[str, Any]] = Field(default_factory=list)

    # Documentation
    generated_documents: List[str] = Field(default_factory=list)
    references: List[Dict[str, str]] = Field(default_factory=list)


class LegalDocument(BaseModel):
    """Legal document reference"""
    id: str = Field(..., description="Document ID")
    title: str = Field(..., description="Document title")
    type: str = Field(..., description="Document type (law, regulation, guideline)")
    source: str = Field(..., description="Document source")
    url: Optional[str] = Field(None, description="Document URL")
    publication_date: Optional[datetime] = Field(None)
    effective_date: Optional[datetime] = Field(None)
    summary: Optional[str] = Field(None, description="Document summary")
    relevant_sections: List[Dict[str, str]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class ComplianceReport(BaseModel):
    """Exportable compliance report"""
    assessment: ComplianceAssessment
    executive_summary: str = Field(..., description="Executive summary")
    detailed_analysis: Dict[str, Any] = Field(default_factory=dict)
    legal_references: List[LegalDocument] = Field(default_factory=list)
    remediation_plan: Optional[Dict[str, Any]] = Field(None)
    timeline: Optional[List[Dict[str, Any]]] = Field(None)
    generated_at: datetime = Field(default_factory=datetime.now)
    format: str = Field("pdf", description="Report format")


class AgentState(BaseModel):
    """State management for LangGraph agents"""
    project_input: ProjectInput
    current_step: str = Field("initialization")
    collected_evidence: Dict[str, Any] = Field(default_factory=dict)
    legal_analysis: Dict[str, Any] = Field(default_factory=dict)
    risk_assessment: Dict[str, Any] = Field(default_factory=dict)
    compliance_gaps: List[Dict[str, Any]] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    completed_steps: List[str] = Field(default_factory=list)