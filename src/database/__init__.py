"""
Database module for AI Compliance Platform.

This module provides database connectivity, ORM models, and data access layers
for both PostgreSQL (relational data) and Qdrant (vector embeddings).
"""

from .connection import engine, SessionLocal, get_db, init_db
from .models import Base, AssessmentRecord, ComplianceCheck, UserSession, LegalDocumentRecord
from .cases import Case, CaseTransition
from .dpia import DPIAAssessmentRecord
from .case_workspace import CaseAction, CaseApproval, CaseWorkspaceReference
from .document_bank import MunicipalDocument, MunicipalDocumentVersion, CaseDocumentLink
from .legal_monitoring import (
    MonitoredLegalSource,
    LegalSourceVersion,
    CaseLegalDependency,
    CaseReassessment,
)

# Optional imports (may not be available in all environments)
try:
    from .qdrant_service import get_qdrant_client, init_qdrant
except ImportError:
    get_qdrant_client = None
    init_qdrant = None

try:
    from .repository import AssessmentRepository
except ImportError:
    AssessmentRepository = None

try:
    from .vector_store import VectorStore
except ImportError:
    VectorStore = None

__all__ = [
    # Database connection
    "engine",
    "SessionLocal",
    "get_db",
    "init_db",
    # ORM Models
    "Base",
    "AssessmentRecord",
    "ComplianceCheck",
    "UserSession",
    "LegalDocumentRecord",
    "Case",
    "CaseTransition",
    "DPIAAssessmentRecord",
    "CaseAction",
    "CaseApproval",
    "CaseWorkspaceReference",
    "MunicipalDocument",
    "MunicipalDocumentVersion",
    "CaseDocumentLink",
    "MonitoredLegalSource",
    "LegalSourceVersion",
    "CaseLegalDependency",
    "CaseReassessment",
    # Qdrant
    "get_qdrant_client",
    "init_qdrant",
    # Repositories
    "AssessmentRepository",
    # Vector Store
    "VectorStore",
]
