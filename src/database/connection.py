"""
Database connection management using SQLAlchemy.

This module handles PostgreSQL connection setup, session management,
and database initialization.
"""

import os
from typing import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, Engine, text
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.pool import StaticPool
from dotenv import load_dotenv
from loguru import logger

# Load environment variables
load_dotenv()

# Database URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/compliance_db"
)

# SQLAlchemy engine configuration
engine_kwargs = {
    "echo": os.getenv("SQL_ECHO", "false").lower() == "true",
    "pool_pre_ping": True,  # Verify connections before using
    "pool_recycle": 3600,  # Recycle connections after 1 hour
    "pool_size": 5,
    "max_overflow": 10,
}

# Create engine
engine = create_engine(DATABASE_URL, **engine_kwargs)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Base class for ORM models
Base = declarative_base()


# Event listener for connection pool debugging
@event.listens_for(Engine, "connect")
def receive_connect(dbapi_conn, connection_record):
    """Log database connections."""
    logger.debug(f"Database connection established: {connection_record}")


@event.listens_for(Engine, "close")
def receive_close(dbapi_conn, connection_record):
    """Log database disconnections."""
    logger.debug(f"Database connection closed: {connection_record}")


def get_db() -> Generator[Session, None, None]:
    """
    Dependency for FastAPI to get database session.

    Yields:
        Session: SQLAlchemy database session

    Example:
        ```python
        from fastapi import Depends
        from src.database import get_db

        @app.get("/assessments")
        def list_assessments(db: Session = Depends(get_db)):
            assessments = db.query(AssessmentRecord).all()
            return assessments
        ```
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for database sessions outside of FastAPI.

    Yields:
        Session: SQLAlchemy database session

    Example:
        ```python
        from src.database import get_db_context

        with get_db_context() as db:
            assessment = AssessmentRecord(project_name="Test")
            db.add(assessment)
            db.commit()
        ```
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        logger.error(f"Database context error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """
    Initialize database tables.

    Creates all tables defined in ORM models. This should be called
    once during application startup or use Alembic migrations instead.

    Note:
        In production, use Alembic migrations instead of this function.

    Example:
        ```python
        from src.database import init_db

        # During app startup
        init_db()
        ```
    """
    from .models import Base  # Import here to avoid circular imports

    try:
        logger.info("Initializing database tables...")
        Base.metadata.create_all(bind=engine)
        _ensure_runtime_columns()
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


def _ensure_runtime_columns() -> None:
    """Add columns introduced after the initial schema, idempotently.

    Why: SQLAlchemy's create_all only creates missing tables — it never alters
    existing ones. When a new column is added to an ORM model, older databases
    keep the old shape and SELECT/UPDATE fails on the column. Running ALTER
    TABLE ... ADD COLUMN here at startup keeps dev SQLite databases in sync
    without needing an Alembic step for trivial additive migrations.
    """
    from sqlalchemy import inspect

    inspector = inspect(engine)
    additive_columns = [
        # (table, column, ddl-fragment)
        ("cases", "last_reminder_sent_at", "TIMESTAMP NULL"),
        ("rule_freshness", "verification_method", "VARCHAR(16) NULL"),
        # Historic DPIA snapshots remain unlinked. New assessments can be
        # attached to the durable case workspace after this additive upgrade.
        ("dpia_assessments", "case_db_id", "VARCHAR(36) NULL"),
    ]

    for table, column, ddl in additive_columns:
        if not inspector.has_table(table):
            continue
        existing = {col["name"] for col in inspector.get_columns(table)}
        if column in existing:
            continue
        try:
            with engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {ddl}'))
            logger.info(f"Added column {table}.{column}")
        except Exception as exc:
            logger.error(f"Failed to add column {table}.{column}: {exc}")


def check_db_connection() -> bool:
    """
    Check if database connection is working.

    Returns:
        bool: True if connection successful, False otherwise

    Example:
        ```python
        from src.database import check_db_connection

        if check_db_connection():
            print("Database is ready")
        else:
            print("Database connection failed")
        ```
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection successful")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False


def get_test_engine():
    """
    Create a test database engine using SQLite in-memory.

    Returns:
        Engine: SQLAlchemy engine for testing

    Example:
        ```python
        # In tests/conftest.py
        from src.database.connection import get_test_engine, Base

        @pytest.fixture
        def test_db():
            engine = get_test_engine()
            Base.metadata.create_all(engine)
            yield engine
            Base.metadata.drop_all(engine)
        ```
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    return engine
