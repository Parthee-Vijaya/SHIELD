"""
Example usage of the database module for the Judge Dredd AI Compliance Platform.

This script demonstrates:
1. Creating compliance assessments in PostgreSQL
2. Storing and searching legal documents in Qdrant
3. Using the repository pattern for database operations
4. Vector search for semantic document retrieval
"""

import os
import sys
from datetime import datetime
from uuid import uuid4

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.database import (
    get_db_context,
    AssessmentRepository,
    UserSessionRepository,
    VectorStore,
    check_db_connection,
    check_qdrant_connection,
)
from src.core.models import (
    ProjectInput,
    ComplianceAssessment,
    ComplianceRequirement,
    RiskLevel,
    ComplianceStatus,
    AISystemType,
    LegalFramework,
)


def example_1_create_assessment():
    """Example 1: Create and store a compliance assessment."""
    print("\n=== Example 1: Create Compliance Assessment ===\n")

    # Create project input
    project = ProjectInput(
        name="AI-Powered Healthcare Chatbot",
        description="Conversational AI system for answering patient health queries and providing medical information",
        ai_type=AISystemType.GENERATIVE_AI,
        sector="healthcare",
        data_types=["patient_queries", "medical_information", "conversation_history"],
        personal_data=True,
        automated_decision_making=False,
        target_users=["patients", "healthcare_providers"],
        deployment_region=["EU", "Denmark"],
    )

    # Create compliance assessment
    assessment = ComplianceAssessment(
        project_id=f"proj_{uuid4().hex[:8]}",
        project_name=project.name,
        assessment_date=datetime.now(),
        risk_level=RiskLevel.HIGH,
        overall_status=ComplianceStatus.PARTIALLY_COMPLIANT,
        compliance_score=72.5,
        ai_act_compliance={
            "risk_classification": "high",
            "prohibited_practices": "none_detected",
            "transparency_requirements": "partial",
        },
        gdpr_compliance={
            "lawful_basis": "consent",
            "data_protection_impact_assessment": "required",
            "data_minimization": "compliant",
        },
        requirements=[
            ComplianceRequirement(
                id="AI_ACT_ART_13",
                framework=LegalFramework.EU_AI_ACT,
                category="Transparency",
                description="AI system must provide clear information to users",
                article_reference="Article 13",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.COMPLIANT,
                evidence=["User interface includes AI disclosure", "Terms of service updated"],
                recommendations=["Add more prominent AI disclosure in UI"],
            ),
            ComplianceRequirement(
                id="GDPR_ART_6",
                framework=LegalFramework.GDPR,
                category="Lawful Basis",
                description="Personal data processing requires lawful basis",
                article_reference="Article 6",
                mandatory=True,
                applies_to_project=True,
                compliance_status=ComplianceStatus.COMPLIANT,
                evidence=["User consent mechanism implemented"],
                recommendations=["Review consent withdrawal process"],
            ),
        ],
        identified_risks=[
            {
                "id": "RISK_001",
                "category": "data_protection",
                "severity": "high",
                "description": "Potential exposure of sensitive health data",
                "mitigation": "Implement end-to-end encryption",
            }
        ],
        recommendations=[
            "Conduct Data Protection Impact Assessment (DPIA)",
            "Implement audit logging for all data access",
            "Review data retention policies",
        ],
    )

    # Save to database
    with get_db_context() as db:
        repo = AssessmentRepository(db)
        record = repo.create_assessment(project, assessment)

        print(f"✓ Created assessment record:")
        print(f"  ID: {record.id}")
        print(f"  Project: {record.project_name}")
        print(f"  Risk Level: {record.risk_level}")
        print(f"  Status: {record.overall_status}")
        print(f"  Score: {record.compliance_score}")
        print(f"  Checks: {len(record.checks)}")
        print(f"  Created: {record.created_at}")

        return record.id


def example_2_query_assessments():
    """Example 2: Query assessments with filters."""
    print("\n=== Example 2: Query Assessments ===\n")

    with get_db_context() as db:
        repo = AssessmentRepository(db)

        # Get all high-risk assessments
        print("High-risk assessments:")
        high_risk = repo.list_assessments(
            risk_level=RiskLevel.HIGH,
            limit=5
        )
        for assessment in high_risk:
            print(f"  - {assessment.project_name} (Score: {assessment.compliance_score})")

        # Get statistics
        stats = repo.get_statistics()
        print(f"\nDatabase Statistics:")
        print(f"  Total assessments: {stats['total_assessments']}")
        print(f"  Risk distribution: {stats['risk_distribution']}")
        print(f"  Status distribution: {stats['status_distribution']}")


def example_3_legal_document_search():
    """Example 3: Add legal documents to vector store and search."""
    print("\n=== Example 3: Legal Document Search ===\n")

    # Initialize vector store
    store = VectorStore()

    # Sample legal documents (in practice, these would come from actual legal texts)
    documents = [
        {
            "text": "Article 5 of the EU AI Act prohibits AI practices that deploy subliminal techniques beyond a person's consciousness, exploit vulnerabilities, or manipulate behavior in a manner that causes harm.",
            "metadata": {
                "title": "EU AI Act - Article 5: Prohibited AI Practices",
                "framework": "eu_ai_act",
                "article": "5",
                "source": "EUR-Lex",
                "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021PC0206",
                "publication_date": "2024-08-01",
            }
        },
        {
            "text": "Article 13 requires that high-risk AI systems be designed to be sufficiently transparent to enable users to interpret the system's output and use it appropriately.",
            "metadata": {
                "title": "EU AI Act - Article 13: Transparency and User Information",
                "framework": "eu_ai_act",
                "article": "13",
                "source": "EUR-Lex",
                "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021PC0206",
                "publication_date": "2024-08-01",
            }
        },
        {
            "text": "Article 6 GDPR establishes that processing shall be lawful only if at least one legal basis applies, including consent, contract, legal obligation, vital interests, public task, or legitimate interests.",
            "metadata": {
                "title": "GDPR - Article 6: Lawfulness of Processing",
                "framework": "gdpr",
                "article": "6",
                "source": "EUR-Lex",
                "url": "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
                "publication_date": "2016-04-27",
            }
        },
    ]

    # Add documents (comment out if already added)
    print("Adding legal documents to vector store...")
    doc_ids = []
    for doc in documents:
        try:
            doc_id = store.add_document(
                text=doc["text"],
                metadata=doc["metadata"]
            )
            doc_ids.append(doc_id)
            print(f"  ✓ Added: {doc['metadata']['title']}")
        except Exception as e:
            print(f"  ✗ Error adding document: {e}")

    # Perform semantic search
    print("\nSearching for: 'What are prohibited AI practices?'")
    results = store.search(
        query="What are prohibited AI practices?",
        limit=3,
        filters={"framework": "eu_ai_act"}
    )

    print(f"\nFound {len(results)} relevant documents:")
    for i, result in enumerate(results, 1):
        print(f"\n{i}. {result['metadata']['title']}")
        print(f"   Relevance: {result['score']:.2%}")
        print(f"   Article: {result['metadata'].get('article', 'N/A')}")
        print(f"   Text: {result['text'][:150]}...")


def example_4_user_session_tracking():
    """Example 4: Track user sessions."""
    print("\n=== Example 4: User Session Tracking ===\n")

    session_id = f"sess_{uuid4().hex[:12]}"

    with get_db_context() as db:
        repo = UserSessionRepository(db)

        # Create session
        session = repo.create_session(
            session_id=session_id,
            ip_address="192.168.1.100",
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            user_identifier="user@example.com",
        )

        print(f"✓ Created user session:")
        print(f"  Session ID: {session.session_id}")
        print(f"  User: {session.user_identifier}")
        print(f"  Started: {session.started_at}")

        # Update activity
        repo.update_session_activity(session_id)
        print(f"  ✓ Updated last activity")


def example_5_assessment_update():
    """Example 5: Update an existing assessment."""
    print("\n=== Example 5: Update Assessment ===\n")

    with get_db_context() as db:
        repo = AssessmentRepository(db)

        # Get first assessment
        assessments = repo.list_assessments(limit=1)
        if not assessments:
            print("No assessments found to update")
            return

        assessment = assessments[0]
        print(f"Original assessment:")
        print(f"  Project: {assessment.project_name}")
        print(f"  Score: {assessment.compliance_score}")
        print(f"  Status: {assessment.overall_status}")

        # Update the assessment
        updated = repo.update_assessment(
            assessment_id=assessment.id,
            updates={
                "compliance_score": 85.0,
                "overall_status": ComplianceStatus.COMPLIANT,
            }
        )

        print(f"\n✓ Updated assessment:")
        print(f"  New Score: {updated.compliance_score}")
        print(f"  New Status: {updated.overall_status}")


def main():
    """Run all examples."""
    print("=" * 60)
    print("Judge Dredd Database Module Examples")
    print("=" * 60)

    # Check connections
    print("\nChecking database connections...")
    if not check_db_connection():
        print("✗ PostgreSQL connection failed. Please start the database:")
        print("  docker-compose up -d db")
        sys.exit(1)
    print("✓ PostgreSQL connected")

    if not check_qdrant_connection():
        print("✗ Qdrant connection failed. Please start Qdrant:")
        print("  docker-compose up -d qdrant")
        sys.exit(1)
    print("✓ Qdrant connected")

    try:
        # Run examples
        example_1_create_assessment()
        example_2_query_assessments()
        example_3_legal_document_search()
        example_4_user_session_tracking()
        example_5_assessment_update()

        print("\n" + "=" * 60)
        print("All examples completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
