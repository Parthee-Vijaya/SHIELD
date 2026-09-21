# Database Module

Database integration layer for the Judge Dredd AI Compliance Platform, providing PostgreSQL for relational data and Qdrant for vector embeddings.

## Architecture

```
src/database/
├── __init__.py          # Module exports
├── connection.py        # PostgreSQL connection management
├── models.py            # SQLAlchemy ORM models
├── qdrant_client.py     # Qdrant client configuration
├── repository.py        # CRUD operations (Repository pattern)
└── vector_store.py      # Vector search utilities
```

## Database Schema

### Tables

#### `assessment_records`
Main table for storing compliance assessments.

**Columns:**
- `id` (PK): Auto-incrementing primary key
- `project_id`: Unique project identifier (UUID)
- `project_name`: Human-readable project name
- `project_description`: Detailed project description
- `ai_type`: Type of AI system (ENUM)
- `sector`: Industry sector
- `risk_level`: AI Act risk classification (ENUM)
- `overall_status`: Overall compliance status (ENUM)
- `compliance_score`: Numeric score (0-100)
- `created_at`, `updated_at`: Timestamps
- `assessment_data`: JSON field for flexible data
- `processes_personal_data`: Boolean flag
- `automated_decision_making`: Boolean flag

**Indexes:**
- `project_id` (unique)
- `(risk_level, overall_status)` (composite)
- `(sector, ai_type)` (composite)
- `created_at`

#### `compliance_checks`
Individual compliance requirements and their evaluation results.

**Columns:**
- `id` (PK): Auto-incrementing primary key
- `assessment_id` (FK): References `assessment_records.id`
- `framework`: Legal framework (ENUM: eu_ai_act, gdpr, etc.)
- `check_type`: Category of the check
- `requirement_id`: Unique requirement identifier
- `article_reference`: Legal article/section reference
- `description`: Human-readable description
- `status`: Compliance status (ENUM)
- `mandatory`: Whether requirement is mandatory
- `result_data`: JSON field for detailed results
- `evidence`: JSON array of evidence
- `recommendations`: JSON array of recommendations
- `created_at`: Timestamp

**Indexes:**
- `assessment_id`
- `(framework, status)` (composite)
- `(assessment_id, framework)` (composite)

#### `user_sessions`
Track user interactions for analytics and audit.

**Columns:**
- `id` (PK): Auto-incrementing primary key
- `session_id`: Unique session identifier
- `user_identifier`: Optional user ID/email
- `ip_address`: Client IP
- `user_agent`: Browser/client info
- `started_at`, `last_activity`: Timestamps
- `assessments_created`: Counter
- `session_data`: JSON field for metadata

**Indexes:**
- `session_id` (unique)
- `user_identifier`
- `started_at`

#### `legal_documents`
Metadata for legal documents stored in Qdrant.

**Columns:**
- `id` (PK): Auto-incrementing primary key
- `document_id`: Unique document identifier (matches Qdrant point ID)
- `title`: Document title
- `document_type`: Type (law, regulation, guideline, etc.)
- `framework`: Related legal framework (ENUM)
- `source`: Publisher/source
- `url`: Document URL
- `publication_date`, `effective_date`: Dates
- `summary`: Brief description
- `tags`: JSON array of tags
- `language`, `country`: Locale information
- `embedding_model`: Model used for embeddings
- `chunk_count`: Number of text chunks embedded
- `created_at`, `updated_at`: Timestamps

**Indexes:**
- `document_id` (unique)
- `(framework, document_type)` (composite)
- `effective_date`
- `(country, language)` (composite)

### Enums

- `ai_system_type`: generative_ai, predictive_ai, classification, recommendation, computer_vision, nlp, robotics, other
- `risk_level`: unacceptable, high, limited, minimal, not_applicable
- `compliance_status`: compliant, partially_compliant, non_compliant, needs_review, pending
- `legal_framework`: eu_ai_act, gdpr, danish_data_act, sector_specific, product_liability, intellectual_property

## Vector Storage (Qdrant)

### Collections

#### `legal_documents`
Stores embeddings of legal documents for semantic search.

**Payload:**
- `text`: Document text
- `title`: Document title
- `framework`: Legal framework
- `article`: Article/section number
- `source`: Document source
- `url`: Document URL
- `publication_date`: Publication date
- `added_at`: Timestamp

#### `compliance_knowledge`
General compliance knowledge base and best practices.

**Configuration:**
- Vector size: 1536 (OpenAI text-embedding-3-small)
- Distance metric: Cosine similarity
- Storage: Persistent volume

## Getting Started

### 1. Configure Environment

Copy `.env.example` to `.env` and set your database credentials:

```bash
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/compliance_db
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_TIMEOUT=30
SQL_ECHO=false

# Embedding Configuration
OPENAI_API_KEY=your_openai_api_key_here
EMBEDDING_MODEL=text-embedding-3-small
```

### 2. Start Database Services

```bash
# Start PostgreSQL and Qdrant using Docker Compose
docker-compose up -d db qdrant

# Verify services are running
docker-compose ps
```

### 3. Run Database Migrations

```bash
# Apply migrations to create tables
alembic upgrade head

# Check migration status
alembic current

# View migration history
alembic history
```

### 4. Initialize Qdrant Collections

```python
from src.database import init_qdrant

# Initialize Qdrant collections
init_qdrant()
```

### 5. Verify Connections

```python
from src.database import check_db_connection, check_qdrant_connection

# Test PostgreSQL connection
if check_db_connection():
    print("PostgreSQL connected!")

# Test Qdrant connection
if check_qdrant_connection():
    print("Qdrant connected!")
```

## Usage Examples

### Creating an Assessment

```python
from src.database import get_db_context, AssessmentRepository
from src.core.models import ProjectInput, ComplianceAssessment

# Create assessment
project = ProjectInput(
    name="Healthcare AI Assistant",
    description="AI chatbot for patient queries",
    ai_type="generative_ai",
    sector="healthcare",
    # ... other fields
)

assessment = ComplianceAssessment(
    project_id="proj_123",
    project_name=project.name,
    risk_level="high",
    overall_status="partially_compliant",
    compliance_score=75.0,
    # ... other fields
)

with get_db_context() as db:
    repo = AssessmentRepository(db)
    record = repo.create_assessment(project, assessment)
    print(f"Created assessment: {record.id}")
```

### Querying Assessments

```python
from src.database import get_db_context, AssessmentRepository
from src.core.models import RiskLevel, ComplianceStatus

with get_db_context() as db:
    repo = AssessmentRepository(db)

    # Get all high-risk assessments
    high_risk = repo.list_assessments(
        risk_level=RiskLevel.HIGH,
        limit=10
    )

    # Get assessment by project ID
    assessment = repo.get_assessment_by_project_id("proj_123")

    # Get statistics
    stats = repo.get_statistics()
    print(f"Total assessments: {stats['total_assessments']}")
    print(f"Risk distribution: {stats['risk_distribution']}")
```

### Vector Search

```python
from src.database import VectorStore
from src.core.models import LegalFramework

# Initialize vector store
store = VectorStore()

# Add a legal document
doc_id = store.add_document(
    text="Article 5 of the EU AI Act prohibits certain AI practices...",
    metadata={
        "title": "EU AI Act - Article 5",
        "framework": "eu_ai_act",
        "article": "5",
        "source": "EUR-Lex",
        "url": "https://...",
    }
)

# Semantic search
results = store.search(
    query="prohibited AI practices",
    limit=5,
    filters={"framework": "eu_ai_act"}
)

for result in results:
    print(f"Score: {result['score']:.2f}")
    print(f"Title: {result['metadata']['title']}")
    print(f"Text: {result['text'][:200]}...")
```

### Using with FastAPI

```python
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from src.database import get_db, AssessmentRepository

app = FastAPI()

@app.get("/assessments")
def list_assessments(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    repo = AssessmentRepository(db)
    assessments = repo.list_assessments(skip=skip, limit=limit)
    return assessments

@app.get("/assessments/{assessment_id}")
def get_assessment(assessment_id: int, db: Session = Depends(get_db)):
    repo = AssessmentRepository(db)
    assessment = repo.get_assessment_by_id(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment
```

## Database Migrations

### Create a New Migration

```bash
# Autogenerate migration based on model changes
alembic revision --autogenerate -m "Add new field to assessments"

# Or create an empty migration
alembic revision -m "Custom migration"
```

### Apply Migrations

```bash
# Upgrade to latest version
alembic upgrade head

# Upgrade to specific version
alembic upgrade +1  # One version forward
alembic upgrade <revision_id>

# Downgrade
alembic downgrade -1  # One version back
alembic downgrade base  # Back to beginning
```

### Migration Commands

```bash
# Show current version
alembic current

# Show migration history
alembic history

# Show pending migrations
alembic heads

# Generate SQL without applying
alembic upgrade head --sql
```

## Database Management

### Reset Database (Development Only)

```python
from src.database import init_db, reset_qdrant

# Drop and recreate all tables (WARNING: destroys data)
from src.database.models import Base
from src.database.connection import engine

Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)

# Reset Qdrant collections (WARNING: destroys data)
reset_qdrant()
```

### Backup and Restore

```bash
# Backup PostgreSQL database
docker exec compliance-db pg_dump -U postgres compliance_db > backup.sql

# Restore from backup
docker exec -i compliance-db psql -U postgres compliance_db < backup.sql

# Backup Qdrant data (copy volume)
docker cp compliance-qdrant:/qdrant/storage ./qdrant_backup
```

## Testing

```python
# Use in-memory SQLite for tests
from src.database.connection import get_test_engine, Base

@pytest.fixture
def test_db():
    engine = get_test_engine()
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
```

## Performance Optimization

### Database Indexes

All frequently queried columns have indexes:
- Primary keys and foreign keys (automatic)
- Unique constraints (project_id, session_id, document_id)
- Composite indexes for common filter combinations
- Timestamp indexes for date-range queries

### Query Optimization Tips

```python
# Use pagination
assessments = repo.list_assessments(skip=0, limit=20)

# Eager load relationships to avoid N+1 queries
from sqlalchemy.orm import joinedload

assessments = db.query(AssessmentRecord)\
    .options(joinedload(AssessmentRecord.checks))\
    .all()

# Use database-level filtering
high_risk = repo.list_assessments(risk_level=RiskLevel.HIGH)
```

### Qdrant Performance

```python
# Batch insert for better performance
documents = [
    ("Article 5 text...", {"title": "Article 5", "framework": "eu_ai_act"}),
    ("Article 6 text...", {"title": "Article 6", "framework": "eu_ai_act"}),
    # ... more documents
]
store.add_documents_batch(documents)

# Use filters to reduce search space
results = store.search(
    query="transparency requirements",
    filters={"framework": "eu_ai_act", "article": "13"}
)
```

## Troubleshooting

### Connection Issues

```python
# Check database connectivity
from src.database import check_db_connection, check_qdrant_connection

if not check_db_connection():
    print("PostgreSQL connection failed. Check DATABASE_URL in .env")

if not check_qdrant_connection():
    print("Qdrant connection failed. Check QDRANT_URL in .env")
```

### Migration Issues

```bash
# If migrations are out of sync
alembic stamp head  # Mark current state as up-to-date

# If migration fails
alembic downgrade -1  # Rollback one version
# Fix the issue
alembic upgrade head  # Try again
```

### Database Lock Issues

```python
# Use connection pooling settings
from src.database.connection import engine

# Increase pool size if needed (in connection.py)
engine = create_engine(
    DATABASE_URL,
    pool_size=10,      # Default: 5
    max_overflow=20,   # Default: 10
)
```

## Next Steps for Integration

1. **Integrate with Compliance Engine**: Update `src/compliance_engine.py` to save assessments to database
2. **Add FastAPI Endpoints**: Create REST API endpoints for database operations
3. **Implement Caching**: Add Redis caching layer for frequently accessed data
4. **Add Monitoring**: Integrate Prometheus metrics for database performance
5. **Implement Batch Processing**: Create background jobs for bulk operations
6. **Add Data Export**: Implement CSV/Excel export functionality
7. **Create Admin Dashboard**: Build UI for database management and monitoring

## References

- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
