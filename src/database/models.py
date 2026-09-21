"""
SQLAlchemy ORM models for AI Compliance Platform.

This module defines the database schema for storing compliance assessments,
checks, user sessions, and legal document metadata.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Boolean,
    Float,
    ForeignKey,
    JSON,
    Enum as SQLEnum,
    Index,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func

from .connection import Base
from src.core.models import RiskLevel, ComplianceStatus, AISystemType, LegalFramework


class AssessmentRecord(Base):
    """
    Main assessment record storing compliance evaluation results.

    Stores the complete compliance assessment for an AI project/system,
    including risk level, compliance status, and scores.

    Attributes:
        id: Primary key
        project_id: Unique project identifier
        project_name: Human-readable project name
        project_description: Detailed project description
        ai_type: Type of AI system (from AISystemType enum)
        sector: Industry sector
        risk_level: AI Act risk classification
        overall_status: Overall compliance status
        compliance_score: Numeric compliance score (0-100)
        created_at: Record creation timestamp
        updated_at: Last update timestamp
        assessment_data: JSON field for flexible data storage
        checks: Related compliance checks (one-to-many)
    """

    __tablename__ = "assessment_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    project_name: Mapped[str] = mapped_column(String(500), nullable=False)
    project_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # AI System Classification
    ai_type: Mapped[str] = mapped_column(
        SQLEnum(AISystemType, name="ai_system_type"),
        nullable=False
    )
    sector: Mapped[str] = mapped_column(String(255), nullable=False)

    # Compliance Results
    risk_level: Mapped[str] = mapped_column(
        SQLEnum(RiskLevel, name="risk_level"),
        nullable=False
    )
    overall_status: Mapped[str] = mapped_column(
        SQLEnum(ComplianceStatus, name="compliance_status"),
        nullable=False
    )
    compliance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Flexible JSON storage for complete assessment data
    assessment_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # Personal data handling flags
    processes_personal_data: Mapped[bool] = mapped_column(Boolean, default=False)
    automated_decision_making: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    checks: Mapped[List["ComplianceCheck"]] = relationship(
        "ComplianceCheck",
        back_populates="assessment",
        cascade="all, delete-orphan"
    )

    # Indexes for common queries
    __table_args__ = (
        Index("idx_risk_status", "risk_level", "overall_status"),
        Index("idx_sector_ai_type", "sector", "ai_type"),
        Index("idx_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<AssessmentRecord(id={self.id}, project='{self.project_name}', risk={self.risk_level})>"


class ComplianceCheck(Base):
    """
    Individual compliance check results.

    Stores specific compliance requirements and their evaluation results
    for each legal framework (AI Act, GDPR, etc.).

    Attributes:
        id: Primary key
        assessment_id: Foreign key to AssessmentRecord
        framework: Legal framework (EU AI Act, GDPR, etc.)
        check_type: Type/category of the check
        requirement_id: Reference to specific legal requirement
        article_reference: Legal article/section reference
        description: Human-readable check description
        status: Compliance status for this check
        mandatory: Whether the requirement is mandatory
        result_data: JSON field for detailed check results
        evidence: Evidence supporting the compliance status
        recommendations: Recommendations for achieving compliance
        created_at: Check timestamp
        assessment: Related assessment record (many-to-one)
    """

    __tablename__ = "compliance_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    assessment_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("assessment_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Framework and check identification
    framework: Mapped[str] = mapped_column(
        SQLEnum(LegalFramework, name="legal_framework"),
        nullable=False
    )
    check_type: Mapped[str] = mapped_column(String(255), nullable=False)
    requirement_id: Mapped[str] = mapped_column(String(255), nullable=False)
    article_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Check details
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        SQLEnum(ComplianceStatus, name="compliance_status"),
        nullable=False
    )
    mandatory: Mapped[bool] = mapped_column(Boolean, default=True)

    # Detailed results and recommendations
    result_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    evidence: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    recommendations: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # Relationships
    assessment: Mapped["AssessmentRecord"] = relationship(
        "AssessmentRecord",
        back_populates="checks"
    )

    # Indexes
    __table_args__ = (
        Index("idx_framework_status", "framework", "status"),
        Index("idx_assessment_framework", "assessment_id", "framework"),
    )

    def __repr__(self) -> str:
        return f"<ComplianceCheck(id={self.id}, framework={self.framework}, status={self.status})>"


class UserSession(Base):
    """
    User session tracking for analytics and audit.

    Tracks user interactions with the compliance platform for analytics,
    debugging, and audit purposes.

    Attributes:
        id: Primary key
        session_id: Unique session identifier
        user_identifier: Optional user identifier (email, ID, etc.)
        ip_address: Client IP address
        user_agent: Browser/client user agent
        started_at: Session start time
        last_activity: Last activity timestamp
        assessments_created: Number of assessments in this session
        session_data: Additional session metadata
    """

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    user_identifier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Session metadata
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    last_activity: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Session statistics
    assessments_created: Mapped[int] = mapped_column(Integer, default=0)

    # Flexible session data storage
    session_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # Indexes
    __table_args__ = (
        Index("idx_started_at", "started_at"),
        Index("idx_user_identifier", "user_identifier"),
    )

    def __repr__(self) -> str:
        return f"<UserSession(id={self.id}, session_id='{self.session_id}')>"


class LegalDocumentRecord(Base):
    """
    Legal document metadata for vector search.

    Stores metadata about legal documents (laws, regulations, guidelines)
    that are embedded in Qdrant for semantic search.

    Attributes:
        id: Primary key
        document_id: Unique document identifier (matches Qdrant point ID)
        title: Document title
        document_type: Type (law, regulation, guideline, case law)
        framework: Related legal framework
        source: Document source/publisher
        url: Document URL
        publication_date: Publication date
        effective_date: Effective date
        summary: Brief summary
        tags: Search tags
        language: Document language
        country: Country/jurisdiction
        embedding_model: Model used for embedding
        chunk_count: Number of text chunks embedded
        created_at: Record creation timestamp
        updated_at: Last update timestamp
    """

    __tablename__ = "legal_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(1000), nullable=False)

    # Document classification
    document_type: Mapped[str] = mapped_column(String(100), nullable=False)
    framework: Mapped[Optional[str]] = mapped_column(
        SQLEnum(LegalFramework, name="legal_framework"),
        nullable=True
    )

    # Source information
    source: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Dates
    publication_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Content
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)

    # Metadata
    language: Mapped[str] = mapped_column(String(10), default="en")
    country: Mapped[str] = mapped_column(String(50), default="EU")

    # Vector embedding metadata
    embedding_model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Indexes
    __table_args__ = (
        Index("idx_framework_type", "framework", "document_type"),
        Index("idx_effective_date", "effective_date"),
        Index("idx_country_language", "country", "language"),
    )

    def __repr__(self) -> str:
        return f"<LegalDocumentRecord(id={self.id}, title='{self.title}')>"


# ===================================================================
# COMPLIANCE CONTROL (7-PUNKTS VURDERING) MODELS
# ===================================================================

class ComplianceControlAssessment(Base):
    """
    7-punkts compliance control vurdering.

    Gemmer resultaterne af en fuld 7-punkts compliance control vurdering
    inkl. beslutning, risikoscore, hard stops, betingelser og anbefalinger.
    """
    __tablename__ = 'compliance_control_assessments'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # System information
    system_navn: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    system_beskrivelse: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fagomraade: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    organisation: Mapped[str] = mapped_column(String(255), default="Kalundborg Kommune")
    team: Mapped[Optional[str]] = mapped_column(String(100))
    kontaktperson: Mapped[Optional[str]] = mapped_column(String(255))

    # Beslutning og risiko
    beslutning: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # go, betinget-go, no-go
    beslutning_beskrivelse: Mapped[Optional[str]] = mapped_column(Text)
    risiko_score: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-100
    risiko_niveau: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # Lav, Medium, Høj, Kritisk

    # AI system characteristics
    bruger_ml: Mapped[bool] = mapped_column(Boolean, default=False)
    autonome_beslutninger: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_risiko_kategori: Mapped[Optional[str]] = mapped_column(String(50))  # unacceptable, high, limited, minimal

    # GDPR relevans
    behandler_persondata: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    persondata_typer: Mapped[Optional[List[str]]] = mapped_column(JSON)  # Array of data types
    juridisk_grundlag: Mapped[Optional[str]] = mapped_column(String(100))
    kraever_dpia: Mapped[bool] = mapped_column(Boolean, default=False)
    dpia_udfoert: Mapped[bool] = mapped_column(Boolean, default=False)

    # Form data (komplet JSON storage af alle 7 punkter)
    form_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)

    # Punkt-specifikke vurderinger
    punkt_vurderinger: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON)

    # Relationer til related tables
    hard_stops: Mapped[List["ComplianceHardStop"]] = relationship(
        "ComplianceHardStop",
        back_populates="assessment",
        cascade="all, delete-orphan"
    )
    betingelser: Mapped[List["ComplianceBetingelse"]] = relationship(
        "ComplianceBetingelse",
        back_populates="assessment",
        cascade="all, delete-orphan"
    )
    anbefalinger: Mapped[List["ComplianceAnbefaling"]] = relationship(
        "ComplianceAnbefaling",
        back_populates="assessment",
        cascade="all, delete-orphan"
    )
    artefakter: Mapped[List["ComplianceArtefakt"]] = relationship(
        "ComplianceArtefakt",
        back_populates="assessment",
        cascade="all, delete-orphan"
    )
    tests: Mapped[List["ComplianceTest"]] = relationship(
        "ComplianceTest",
        back_populates="assessment",
        cascade="all, delete-orphan"
    )
    naeste_skridt: Mapped[List["ComplianceNaesteSkridt"]] = relationship(
        "ComplianceNaesteSkridt",
        back_populates="assessment",
        cascade="all, delete-orphan"
    )

    # Indexes
    __table_args__ = (
        Index("idx_beslutning_risiko", "beslutning", "risiko_niveau"),
        Index("idx_organisation_fagomraade", "organisation", "fagomraade"),
        Index("idx_created_at_cc", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ComplianceControlAssessment(id={self.id}, system='{self.system_navn}', beslutning={self.beslutning})>"


class ComplianceHardStop(Base):
    """
    Kritiske blokeringer der forhindrer GO beslutning.
    """
    __tablename__ = 'compliance_hard_stops'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assessment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('compliance_control_assessments.id', ondelete='CASCADE'),
        nullable=False
    )
    beskrivelse: Mapped[str] = mapped_column(Text, nullable=False)
    artikel_reference: Mapped[Optional[str]] = mapped_column(String(100))  # e.g., "AI Act Art. 5"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    assessment: Mapped["ComplianceControlAssessment"] = relationship("ComplianceControlAssessment", back_populates="hard_stops")

    def __repr__(self) -> str:
        return f"<ComplianceHardStop(id={self.id}, assessment_id={self.assessment_id})>"


class ComplianceBetingelse(Base):
    """
    Betingelser der skal opfyldes for godkendelse.
    """
    __tablename__ = 'compliance_betingelser'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assessment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('compliance_control_assessments.id', ondelete='CASCADE'),
        nullable=False
    )
    beskrivelse: Mapped[str] = mapped_column(Text, nullable=False)
    kategori: Mapped[Optional[str]] = mapped_column(String(100))  # e.g., "GDPR", "AI Act"
    prioritet: Mapped[int] = mapped_column(Integer, default=0)  # 0=low, 1=medium, 2=high
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, completed, blocked
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    assessment: Mapped["ComplianceControlAssessment"] = relationship("ComplianceControlAssessment", back_populates="betingelser")

    def __repr__(self) -> str:
        return f"<ComplianceBetingelse(id={self.id}, status={self.status})>"


class ComplianceAnbefaling(Base):
    """
    Anbefalinger til forbedring af compliance.
    """
    __tablename__ = 'compliance_anbefalinger'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assessment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('compliance_control_assessments.id', ondelete='CASCADE'),
        nullable=False
    )
    beskrivelse: Mapped[str] = mapped_column(Text, nullable=False)
    kategori: Mapped[Optional[str]] = mapped_column(String(100))
    prioritet: Mapped[int] = mapped_column(Integer, default=0)
    implementeret: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    assessment: Mapped["ComplianceControlAssessment"] = relationship("ComplianceControlAssessment", back_populates="anbefalinger")

    def __repr__(self) -> str:
        return f"<ComplianceAnbefaling(id={self.id}, implementeret={self.implementeret})>"


class ComplianceArtefakt(Base):
    """
    Nødvendige dokumenter og artefakter.
    """
    __tablename__ = 'compliance_artefakter'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assessment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('compliance_control_assessments.id', ondelete='CASCADE'),
        nullable=False
    )
    navn: Mapped[str] = mapped_column(String(255), nullable=False)
    beskrivelse: Mapped[Optional[str]] = mapped_column(Text)
    kategori: Mapped[Optional[str]] = mapped_column(String(100))
    paakraevet: Mapped[bool] = mapped_column(Boolean, default=False)
    fuldfoert: Mapped[bool] = mapped_column(Boolean, default=False)
    template_url: Mapped[Optional[str]] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    assessment: Mapped["ComplianceControlAssessment"] = relationship("ComplianceControlAssessment", back_populates="artefakter")

    def __repr__(self) -> str:
        return f"<ComplianceArtefakt(id={self.id}, navn='{self.navn}')>"


class ComplianceTest(Base):
    """
    Nødvendige tests før deployment.
    """
    __tablename__ = 'compliance_tests'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assessment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('compliance_control_assessments.id', ondelete='CASCADE'),
        nullable=False
    )
    beskrivelse: Mapped[str] = mapped_column(Text, nullable=False)
    kategori: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, passed, failed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    assessment: Mapped["ComplianceControlAssessment"] = relationship("ComplianceControlAssessment", back_populates="tests")

    def __repr__(self) -> str:
        return f"<ComplianceTest(id={self.id}, status={self.status})>"


class ComplianceNaesteSkridt(Base):
    """
    Næste skridt og action items.
    """
    __tablename__ = 'compliance_naeste_skridt'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assessment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('compliance_control_assessments.id', ondelete='CASCADE'),
        nullable=False
    )
    skridt_nummer: Mapped[int] = mapped_column(Integer, nullable=False)
    beskrivelse: Mapped[str] = mapped_column(Text, nullable=False)
    fuldfoert: Mapped[bool] = mapped_column(Boolean, default=False)
    fuldfoert_dato: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    assessment: Mapped["ComplianceControlAssessment"] = relationship("ComplianceControlAssessment", back_populates="naeste_skridt")

    def __repr__(self) -> str:
        return f"<ComplianceNaesteSkridt(id={self.id}, skridt_nummer={self.skridt_nummer})>"


class ComplianceBeslutningsTrae(Base):
    """
    Beslutningsregler for automated recommendations.

    Dette er en regelbase der kan udvides over tid baseret på historiske data.
    Bruges til at give intelligente anbefalinger baseret på tidligere vurderinger.
    """
    __tablename__ = 'compliance_beslutningstrae'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    regel_navn: Mapped[str] = mapped_column(String(255), nullable=False)
    regel_beskrivelse: Mapped[Optional[str]] = mapped_column(Text)
    betingelse: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)  # Conditions that must be met
    anbefaling: Mapped[str] = mapped_column(Text, nullable=False)
    anbefaling_type: Mapped[str] = mapped_column(String(100))  # warning, action, best_practice
    prioritet: Mapped[int] = mapped_column(Integer, default=0)
    aktiv: Mapped[bool] = mapped_column(Boolean, default=True)
    anvendelser: Mapped[int] = mapped_column(Integer, default=0)  # How many times triggered
    success_rate: Mapped[Optional[float]] = mapped_column(Float)  # Success rate if feedback implemented
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    __table_args__ = (
        Index("idx_aktiv_prioritet", "aktiv", "prioritet"),
    )

    def __repr__(self) -> str:
        return f"<ComplianceBeslutningsTrae(id={self.id}, regel='{self.regel_navn}')>"


class QuickCheckHistory(Base):
    """
    Historie for hurtige compliance checks (hurtig-tjek).
    """
    __tablename__ = 'quick_check_history'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    session_id: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    # Input data
    beskrivelse: Mapped[str] = mapped_column(Text, nullable=False)
    ai_type: Mapped[Optional[str]] = mapped_column(String(100))
    sektor: Mapped[Optional[str]] = mapped_column(String(255))
    behandler_persondata: Mapped[bool] = mapped_column(Boolean, default=False)
    automatiserede_beslutninger: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_web_search: Mapped[bool] = mapped_column(Boolean, default=True)

    # Results
    ai_act_risk_level: Mapped[Optional[str]] = mapped_column(String(50))
    gdpr_relevant: Mapped[Optional[bool]] = mapped_column(Boolean)
    gdpr_requires_dpia: Mapped[Optional[bool]] = mapped_column(Boolean)
    needs_full_assessment: Mapped[Optional[bool]] = mapped_column(Boolean)
    classification: Mapped[Optional[str]] = mapped_column(String(100))
    decision: Mapped[Optional[str]] = mapped_column(String(50))
    risk_score: Mapped[Optional[int]] = mapped_column(Integer)

    # Full response data
    response_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON)

    __table_args__ = (
        Index("idx_qc_created_risk", "created_at", "risk_score"),
    )

    def __repr__(self) -> str:
        return f"<QuickCheckHistory(id={self.id}, risk_level={self.ai_act_risk_level})>"
