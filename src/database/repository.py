"""
Repository pattern for database operations.

This module provides a clean API for CRUD operations on compliance
assessments and related entities.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, or_
from loguru import logger

from .models import AssessmentRecord, ComplianceCheck, UserSession, LegalDocumentRecord
from src.core.models import (
    ComplianceAssessment,
    ProjectInput,
    RiskLevel,
    ComplianceStatus,
    LegalFramework,
)


class AssessmentRepository:
    """
    Repository for assessment-related database operations.

    Provides CRUD operations and queries for compliance assessments
    and related checks.
    """

    def __init__(self, db: Session):
        """
        Initialize repository with database session.

        Args:
            db: SQLAlchemy database session
        """
        self.db = db

    def create_assessment(
        self,
        project_input: ProjectInput,
        assessment: ComplianceAssessment
    ) -> AssessmentRecord:
        """
        Create a new assessment record from compliance assessment.

        Args:
            project_input: Original project input
            assessment: Complete compliance assessment result

        Returns:
            AssessmentRecord: Created database record

        Example:
            ```python
            from src.database import get_db_context, AssessmentRepository

            with get_db_context() as db:
                repo = AssessmentRepository(db)
                record = repo.create_assessment(project_input, assessment)
                print(f"Assessment created with ID: {record.id}")
            ```
        """
        try:
            # Create main assessment record
            record = AssessmentRecord(
                project_id=assessment.project_id,
                project_name=assessment.project_name,
                project_description=project_input.description,
                ai_type=project_input.ai_type,
                sector=project_input.sector,
                risk_level=assessment.risk_level,
                overall_status=assessment.overall_status,
                compliance_score=assessment.compliance_score,
                processes_personal_data=project_input.personal_data,
                automated_decision_making=project_input.automated_decision_making,
                assessment_data={
                    "ai_act_compliance": assessment.ai_act_compliance,
                    "gdpr_compliance": assessment.gdpr_compliance,
                    "sector_compliance": assessment.sector_compliance,
                    "identified_risks": assessment.identified_risks,
                    "recommendations": assessment.recommendations,
                    "action_items": assessment.action_items,
                    "references": assessment.references,
                },
            )

            self.db.add(record)
            self.db.flush()  # Get the ID before creating checks

            # Create compliance checks
            for req in assessment.requirements:
                check = ComplianceCheck(
                    assessment_id=record.id,
                    framework=req.framework,
                    check_type=req.category,
                    requirement_id=req.id,
                    article_reference=req.article_reference,
                    description=req.description,
                    status=req.compliance_status,
                    mandatory=req.mandatory,
                    result_data={
                        "applies_to_project": req.applies_to_project,
                    },
                    evidence=req.evidence,
                    recommendations=req.recommendations,
                )
                self.db.add(check)

            self.db.commit()
            self.db.refresh(record)

            logger.info(f"Created assessment record: {record.id} for project {record.project_name}")
            return record

        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to create assessment: {e}")
            raise

    def get_assessment_by_id(self, assessment_id: int) -> Optional[AssessmentRecord]:
        """
        Get assessment by database ID.

        Args:
            assessment_id: Database primary key

        Returns:
            AssessmentRecord or None if not found

        Example:
            ```python
            repo = AssessmentRepository(db)
            assessment = repo.get_assessment_by_id(1)
            if assessment:
                print(f"Project: {assessment.project_name}")
            ```
        """
        return self.db.query(AssessmentRecord).filter(
            AssessmentRecord.id == assessment_id
        ).first()

    def get_assessment_by_project_id(self, project_id: str) -> Optional[AssessmentRecord]:
        """
        Get assessment by project ID string.

        Args:
            project_id: Unique project identifier

        Returns:
            AssessmentRecord or None if not found

        Example:
            ```python
            repo = AssessmentRepository(db)
            assessment = repo.get_assessment_by_project_id("proj_123")
            ```
        """
        return self.db.query(AssessmentRecord).filter(
            AssessmentRecord.project_id == project_id
        ).first()

    def list_assessments(
        self,
        skip: int = 0,
        limit: int = 100,
        risk_level: Optional[RiskLevel] = None,
        status: Optional[ComplianceStatus] = None,
        sector: Optional[str] = None,
    ) -> List[AssessmentRecord]:
        """
        List assessments with optional filters.

        Args:
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            risk_level: Filter by risk level
            status: Filter by compliance status
            sector: Filter by sector

        Returns:
            List of assessment records

        Example:
            ```python
            repo = AssessmentRepository(db)

            # Get all high-risk assessments
            high_risk = repo.list_assessments(risk_level=RiskLevel.HIGH)

            # Get non-compliant healthcare assessments
            healthcare = repo.list_assessments(
                status=ComplianceStatus.NON_COMPLIANT,
                sector="healthcare"
            )
            ```
        """
        query = self.db.query(AssessmentRecord)

        # Apply filters
        if risk_level:
            query = query.filter(AssessmentRecord.risk_level == risk_level)
        if status:
            query = query.filter(AssessmentRecord.overall_status == status)
        if sector:
            query = query.filter(AssessmentRecord.sector == sector)

        # Order by most recent first
        query = query.order_by(desc(AssessmentRecord.created_at))

        # Pagination
        return query.offset(skip).limit(limit).all()

    def update_assessment(
        self,
        assessment_id: int,
        updates: Dict[str, Any]
    ) -> Optional[AssessmentRecord]:
        """
        Update an existing assessment record.

        Args:
            assessment_id: Database primary key
            updates: Dictionary of fields to update

        Returns:
            Updated assessment record or None if not found

        Example:
            ```python
            repo = AssessmentRepository(db)
            updated = repo.update_assessment(
                assessment_id=1,
                updates={"compliance_score": 95.0, "overall_status": ComplianceStatus.COMPLIANT}
            )
            ```
        """
        try:
            record = self.get_assessment_by_id(assessment_id)
            if not record:
                return None

            for key, value in updates.items():
                if hasattr(record, key):
                    setattr(record, key, value)

            self.db.commit()
            self.db.refresh(record)

            logger.info(f"Updated assessment {assessment_id}")
            return record

        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to update assessment {assessment_id}: {e}")
            raise

    def delete_assessment(self, assessment_id: int) -> bool:
        """
        Delete an assessment and all related checks.

        Args:
            assessment_id: Database primary key

        Returns:
            bool: True if deleted, False if not found

        Example:
            ```python
            repo = AssessmentRepository(db)
            deleted = repo.delete_assessment(1)
            if deleted:
                print("Assessment deleted successfully")
            ```
        """
        try:
            record = self.get_assessment_by_id(assessment_id)
            if not record:
                return False

            self.db.delete(record)
            self.db.commit()

            logger.info(f"Deleted assessment {assessment_id}")
            return True

        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to delete assessment {assessment_id}: {e}")
            raise

    def get_checks_by_assessment(
        self,
        assessment_id: int,
        framework: Optional[LegalFramework] = None
    ) -> List[ComplianceCheck]:
        """
        Get all compliance checks for an assessment.

        Args:
            assessment_id: Database primary key of assessment
            framework: Optional filter by legal framework

        Returns:
            List of compliance checks

        Example:
            ```python
            repo = AssessmentRepository(db)

            # Get all checks
            all_checks = repo.get_checks_by_assessment(1)

            # Get only GDPR checks
            gdpr_checks = repo.get_checks_by_assessment(1, framework=LegalFramework.GDPR)
            ```
        """
        query = self.db.query(ComplianceCheck).filter(
            ComplianceCheck.assessment_id == assessment_id
        )

        if framework:
            query = query.filter(ComplianceCheck.framework == framework)

        return query.all()

    def get_statistics(self) -> Dict[str, Any]:
        """
        Get database statistics and insights.

        Returns:
            Dictionary with statistics

        Example:
            ```python
            repo = AssessmentRepository(db)
            stats = repo.get_statistics()
            print(f"Total assessments: {stats['total_assessments']}")
            print(f"High risk systems: {stats['risk_distribution']['high']}")
            ```
        """
        try:
            total = self.db.query(AssessmentRecord).count()

            # Risk distribution
            risk_dist = {}
            for risk in RiskLevel:
                count = self.db.query(AssessmentRecord).filter(
                    AssessmentRecord.risk_level == risk
                ).count()
                risk_dist[risk.value] = count

            # Status distribution
            status_dist = {}
            for status in ComplianceStatus:
                count = self.db.query(AssessmentRecord).filter(
                    AssessmentRecord.overall_status == status
                ).count()
                status_dist[status.value] = count

            # Sector distribution
            sector_query = self.db.query(
                AssessmentRecord.sector,
                self.db.func.count(AssessmentRecord.id)
            ).group_by(AssessmentRecord.sector).all()
            sector_dist = {sector: count for sector, count in sector_query}

            return {
                "total_assessments": total,
                "risk_distribution": risk_dist,
                "status_distribution": status_dist,
                "sector_distribution": sector_dist,
            }

        except Exception as e:
            logger.error(f"Failed to get statistics: {e}")
            raise


class UserSessionRepository:
    """Repository for user session operations."""

    def __init__(self, db: Session):
        self.db = db

    def create_session(
        self,
        session_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        user_identifier: Optional[str] = None,
    ) -> UserSession:
        """
        Create a new user session.

        Example:
            ```python
            from src.database import get_db_context, UserSessionRepository

            with get_db_context() as db:
                repo = UserSessionRepository(db)
                session = repo.create_session(
                    session_id="sess_123",
                    ip_address="192.168.1.1",
                    user_agent="Mozilla/5.0..."
                )
            ```
        """
        try:
            session = UserSession(
                session_id=session_id,
                ip_address=ip_address,
                user_agent=user_agent,
                user_identifier=user_identifier,
            )
            self.db.add(session)
            self.db.commit()
            self.db.refresh(session)

            logger.info(f"Created user session: {session_id}")
            return session

        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to create session: {e}")
            raise

    def get_session(self, session_id: str) -> Optional[UserSession]:
        """Get session by ID."""
        return self.db.query(UserSession).filter(
            UserSession.session_id == session_id
        ).first()

    def update_session_activity(self, session_id: str) -> None:
        """Update last activity timestamp for a session."""
        session = self.get_session(session_id)
        if session:
            session.last_activity = datetime.utcnow()
            self.db.commit()
