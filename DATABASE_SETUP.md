# Database Setup Guide

Quick reference guide for setting up and managing the Judge Dredd database infrastructure.

## Quick Start

### 1. Start Database Services

```bash
# Start PostgreSQL and Qdrant containers
docker-compose up -d db qdrant

# Verify services are running
docker-compose ps

# Expected output:
# NAME                  STATUS
# compliance-db         Up
# compliance-qdrant     Up
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update if needed:

```bash
cp .env.example .env

# Default database connection (works with docker-compose):
DATABASE_URL=postgresql://postgres:password@localhost:5432/compliance_db
QDRANT_URL=http://localhost:6333

# Set your OpenAI API key for embeddings:
OPENAI_API_KEY=your_actual_key_here
```

### 3. Run Database Migrations

```bash
# Apply all migrations to create tables
alembic upgrade head

# You should see output like:
# INFO  [alembic.runtime.migration] Running upgrade  -> 5df7504ce7f5, Initial database schema
```

### 4. Initialize Qdrant Collections

```python
# Run this Python script or in a Python shell
from src.database import init_qdrant

init_qdrant()
# Expected output:
# INFO: Connecting to Qdrant at http://localhost:6333
# INFO: Creating collection: legal_documents
# INFO: Collection created successfully: legal_documents
# INFO: Creating collection: compliance_knowledge
# INFO: Collection created successfully: compliance_knowledge
```

### 5. Verify Setup

```python
from src.database import check_db_connection, check_qdrant_connection

# Test PostgreSQL
if check_db_connection():
    print("✓ PostgreSQL is ready!")
else:
    print("✗ PostgreSQL connection failed")

# Test Qdrant
if check_qdrant_connection():
    print("✓ Qdrant is ready!")
else:
    print("✗ Qdrant connection failed")
```

## Database Services

### PostgreSQL

**Container:** `compliance-db`
**Port:** 5432
**Database:** `compliance_db`
**User:** `postgres`
**Password:** `password` (change in production!)

#### Access Database Shell

```bash
# Access PostgreSQL shell
docker exec -it compliance-db psql -U postgres -d compliance_db

# List tables
\dt

# Describe a table
\d assessment_records

# Run a query
SELECT COUNT(*) FROM assessment_records;

# Exit
\q
```

#### Connection Info

- **From host:** `postgresql://postgres:password@localhost:5432/compliance_db`
- **From container:** `postgresql://postgres:password@db:5432/compliance_db`

### Qdrant

**Container:** `compliance-qdrant`
**Port:** 6333 (HTTP API)
**Web UI:** http://localhost:6333/dashboard

#### Access Qdrant Dashboard

Open browser: http://localhost:6333/dashboard

You can browse collections, view vectors, and test searches.

#### Connection Info

- **From host:** `http://localhost:6333`
- **From container:** `http://qdrant:6333`

## Common Operations

### Check Service Status

```bash
# Check if services are running
docker-compose ps db qdrant

# View logs
docker-compose logs db
docker-compose logs qdrant

# Follow logs in real-time
docker-compose logs -f db
```

### Stop/Start Services

```bash
# Stop all services
docker-compose stop

# Start all services
docker-compose start

# Restart specific service
docker-compose restart db
docker-compose restart qdrant

# Stop and remove containers (data persists in volumes)
docker-compose down

# Remove containers AND volumes (destroys data!)
docker-compose down -v
```

### Database Migrations

```bash
# Check current migration version
alembic current

# View migration history
alembic history --verbose

# Upgrade to latest
alembic upgrade head

# Upgrade one version at a time
alembic upgrade +1

# Downgrade one version
alembic downgrade -1

# Show SQL without executing
alembic upgrade head --sql

# Create new migration
alembic revision -m "Description of changes"
```

### Backup and Restore

#### PostgreSQL Backup

```bash
# Create backup
docker exec compliance-db pg_dump -U postgres compliance_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
docker exec -i compliance-db psql -U postgres compliance_db < backup_20251008_180000.sql

# Backup specific table
docker exec compliance-db pg_dump -U postgres -t assessment_records compliance_db > assessments_backup.sql
```

#### Qdrant Backup

```bash
# Qdrant data is stored in Docker volume: qdrant_data
# To backup, copy the volume data:

# Create backup directory
mkdir -p qdrant_backup

# Copy data from container
docker cp compliance-qdrant:/qdrant/storage ./qdrant_backup/

# To restore, copy data back
docker cp ./qdrant_backup/storage compliance-qdrant:/qdrant/
docker-compose restart qdrant
```

### Reset Everything (Development Only)

```bash
# WARNING: This destroys ALL data!

# Stop services
docker-compose down

# Remove volumes
docker volume rm judge_dredd_postgres_data judge_dredd_qdrant_data

# Recreate and start
docker-compose up -d db qdrant

# Run migrations
alembic upgrade head

# Reinitialize Qdrant
python -c "from src.database import init_qdrant; init_qdrant()"
```

## Troubleshooting

### PostgreSQL Issues

#### Connection Refused

```bash
# Check if container is running
docker-compose ps db

# Check logs for errors
docker-compose logs db

# Restart the service
docker-compose restart db

# If port 5432 is already in use
# Either stop the conflicting service or change port in docker-compose.yml:
#   ports:
#     - "5433:5432"  # Use 5433 on host instead
```

#### Authentication Failed

```bash
# Verify credentials in .env match docker-compose.yml
# Default: postgres/password

# If you changed credentials, recreate the database:
docker-compose down -v
docker-compose up -d db
```

#### Migration Errors

```bash
# If migration fails due to existing tables:
alembic stamp head  # Mark current state as up-to-date

# If migration is partially applied:
# 1. Check what was created
docker exec -it compliance-db psql -U postgres -d compliance_db -c "\dt"

# 2. Manually rollback or fix the issue
# 3. Try migration again
alembic upgrade head
```

### Qdrant Issues

#### Connection Refused

```bash
# Check if container is running
docker-compose ps qdrant

# Check logs
docker-compose logs qdrant

# Restart
docker-compose restart qdrant

# Test connection
curl http://localhost:6333/health
```

#### Collection Not Found

```python
# Reinitialize collections
from src.database import init_qdrant
init_qdrant(recreate=False)  # Only create missing collections

# Or recreate all (WARNING: destroys data)
init_qdrant(recreate=True)
```

#### Embedding Generation Fails

```bash
# Check OpenAI API key
echo $OPENAI_API_KEY

# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# If key is invalid, update .env and restart
```

### General Issues

#### Docker Daemon Not Running

```bash
# Check Docker status
docker ps

# If Docker is not running:
# macOS: Open Docker Desktop
# Linux: sudo systemctl start docker
```

#### Port Conflicts

```bash
# Check what's using port 5432
lsof -i :5432

# Check what's using port 6333
lsof -i :6333

# Change ports in docker-compose.yml if needed
```

#### Disk Space Issues

```bash
# Check Docker disk usage
docker system df

# Clean up unused images and containers
docker system prune

# Clean up volumes (careful!)
docker volume prune
```

## Health Checks

### Quick Health Check Script

```python
#!/usr/bin/env python3
"""Check database health."""

from src.database import (
    check_db_connection,
    check_qdrant_connection,
    get_db_context,
    AssessmentRepository,
    get_qdrant_client
)

def main():
    print("=== Database Health Check ===\n")

    # PostgreSQL
    print("PostgreSQL:")
    if check_db_connection():
        print("  ✓ Connection successful")

        # Check statistics
        with get_db_context() as db:
            repo = AssessmentRepository(db)
            stats = repo.get_statistics()
            print(f"  ✓ Total assessments: {stats['total_assessments']}")
    else:
        print("  ✗ Connection failed")

    # Qdrant
    print("\nQdrant:")
    if check_qdrant_connection():
        print("  ✓ Connection successful")

        # Check collections
        client = get_qdrant_client()
        collections = client.get_collections()
        print(f"  ✓ Collections: {len(collections.collections)}")
        for col in collections.collections:
            print(f"    - {col.name}: {col.points_count} vectors")
    else:
        print("  ✗ Connection failed")

if __name__ == "__main__":
    main()
```

Save as `check_db_health.py` and run:

```bash
python check_db_health.py
```

## Performance Monitoring

### PostgreSQL Performance

```bash
# Connect to database
docker exec -it compliance-db psql -U postgres -d compliance_db

# Check table sizes
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Check slow queries (if logging is enabled)
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

# Check active connections
SELECT * FROM pg_stat_activity;
```

### Qdrant Performance

```bash
# Check collection info via API
curl http://localhost:6333/collections/legal_documents

# Response includes:
# - vectors_count
# - points_count
# - status
# - config (vector size, distance metric)
```

## Development Tips

### VS Code Database Extension

Install "PostgreSQL" extension for VS Code:

1. Install extension: `ms-ossdata.vscode-postgresql`
2. Add connection:
   - Host: localhost
   - Port: 5432
   - Database: compliance_db
   - User: postgres
   - Password: password

### Database GUI Tools

- **pgAdmin**: Full-featured PostgreSQL GUI
  ```bash
  docker run -p 5050:80 -e PGADMIN_DEFAULT_EMAIL=admin@admin.com -e PGADMIN_DEFAULT_PASSWORD=admin dpage/pgadmin4
  ```
  Access: http://localhost:5050

- **DBeaver**: Universal database tool (supports PostgreSQL)
  Download: https://dbeaver.io/

### Qdrant Python Client

```python
from qdrant_client import QdrantClient

client = QdrantClient(url="http://localhost:6333")

# List collections
collections = client.get_collections()
print(collections)

# Get collection info
info = client.get_collection("legal_documents")
print(f"Vectors: {info.vectors_count}")

# Browse points
points, next_offset = client.scroll(
    collection_name="legal_documents",
    limit=10
)
for point in points:
    print(f"ID: {point.id}")
    print(f"Payload: {point.payload}")
```

## Production Considerations

When deploying to production, consider:

1. **Change default passwords** in docker-compose.yml
2. **Use environment-specific .env files**
3. **Enable SSL/TLS** for database connections
4. **Set up automated backups**
5. **Configure monitoring** (Prometheus, Grafana)
6. **Use connection pooling** (PgBouncer for PostgreSQL)
7. **Set up read replicas** for scaling reads
8. **Configure proper resource limits** in Docker
9. **Use managed databases** (AWS RDS, DigitalOcean Managed Databases)
10. **Implement proper security groups/firewall rules**

## Support

For issues or questions:

1. Check logs: `docker-compose logs db qdrant`
2. Review documentation: `/src/database/README.md`
3. Verify configuration: `.env` file
4. Test connections: `python -c "from src.database import check_db_connection; print(check_db_connection())"`

---

**Last Updated:** October 8, 2025
