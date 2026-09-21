"""Initial database schema

Revision ID: 5df7504ce7f5
Revises:
Create Date: 2025-10-08 18:00:55.377940

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '5df7504ce7f5'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create ENUM types
    op.execute("CREATE TYPE ai_system_type AS ENUM ('generative_ai', 'predictive_ai', 'classification', 'recommendation', 'computer_vision', 'nlp', 'robotics', 'other')")
    op.execute("CREATE TYPE risk_level AS ENUM ('unacceptable', 'high', 'limited', 'minimal', 'not_applicable')")
    op.execute("CREATE TYPE compliance_status AS ENUM ('compliant', 'partially_compliant', 'non_compliant', 'needs_review', 'pending')")
    op.execute("CREATE TYPE legal_framework AS ENUM ('eu_ai_act', 'gdpr', 'danish_data_act', 'sector_specific', 'product_liability', 'intellectual_property')")

    # Create assessment_records table
    op.create_table(
        'assessment_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.String(length=255), nullable=False),
        sa.Column('project_name', sa.String(length=500), nullable=False),
        sa.Column('project_description', sa.Text(), nullable=True),
        sa.Column('ai_type', postgresql.ENUM(name='ai_system_type'), nullable=False),
        sa.Column('sector', sa.String(length=255), nullable=False),
        sa.Column('risk_level', postgresql.ENUM(name='risk_level'), nullable=False),
        sa.Column('overall_status', postgresql.ENUM(name='compliance_status'), nullable=False),
        sa.Column('compliance_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('assessment_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('processes_personal_data', sa.Boolean(), server_default='false'),
        sa.Column('automated_decision_making', sa.Boolean(), server_default='false'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for assessment_records
    op.create_index('idx_created_at', 'assessment_records', ['created_at'])
    op.create_index('idx_risk_status', 'assessment_records', ['risk_level', 'overall_status'])
    op.create_index('idx_sector_ai_type', 'assessment_records', ['sector', 'ai_type'])
    op.create_index(op.f('ix_assessment_records_id'), 'assessment_records', ['id'])
    op.create_index(op.f('ix_assessment_records_project_id'), 'assessment_records', ['project_id'], unique=True)

    # Create compliance_checks table
    op.create_table(
        'compliance_checks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('assessment_id', sa.Integer(), nullable=False),
        sa.Column('framework', postgresql.ENUM(name='legal_framework'), nullable=False),
        sa.Column('check_type', sa.String(length=255), nullable=False),
        sa.Column('requirement_id', sa.String(length=255), nullable=False),
        sa.Column('article_reference', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('status', postgresql.ENUM(name='compliance_status'), nullable=False),
        sa.Column('mandatory', sa.Boolean(), server_default='true'),
        sa.Column('result_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('evidence', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('recommendations', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['assessment_id'], ['assessment_records.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for compliance_checks
    op.create_index('idx_assessment_framework', 'compliance_checks', ['assessment_id', 'framework'])
    op.create_index('idx_framework_status', 'compliance_checks', ['framework', 'status'])
    op.create_index(op.f('ix_compliance_checks_assessment_id'), 'compliance_checks', ['assessment_id'])
    op.create_index(op.f('ix_compliance_checks_id'), 'compliance_checks', ['id'])

    # Create user_sessions table
    op.create_table(
        'user_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.String(length=255), nullable=False),
        sa.Column('user_identifier', sa.String(length=255), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_activity', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('assessments_created', sa.Integer(), server_default='0'),
        sa.Column('session_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for user_sessions
    op.create_index('idx_started_at', 'user_sessions', ['started_at'])
    op.create_index('idx_user_identifier', 'user_sessions', ['user_identifier'])
    op.create_index(op.f('ix_user_sessions_id'), 'user_sessions', ['id'])
    op.create_index(op.f('ix_user_sessions_session_id'), 'user_sessions', ['session_id'], unique=True)

    # Create legal_documents table
    op.create_table(
        'legal_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.String(length=255), nullable=False),
        sa.Column('title', sa.String(length=1000), nullable=False),
        sa.Column('document_type', sa.String(length=100), nullable=False),
        sa.Column('framework', postgresql.ENUM(name='legal_framework'), nullable=True),
        sa.Column('source', sa.String(length=255), nullable=False),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('publication_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('effective_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('language', sa.String(length=10), server_default='en'),
        sa.Column('country', sa.String(length=50), server_default='EU'),
        sa.Column('embedding_model', sa.String(length=255), nullable=True),
        sa.Column('chunk_count', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for legal_documents
    op.create_index('idx_country_language', 'legal_documents', ['country', 'language'])
    op.create_index('idx_effective_date', 'legal_documents', ['effective_date'])
    op.create_index('idx_framework_type', 'legal_documents', ['framework', 'document_type'])
    op.create_index(op.f('ix_legal_documents_document_id'), 'legal_documents', ['document_id'], unique=True)
    op.create_index(op.f('ix_legal_documents_id'), 'legal_documents', ['id'])


def downgrade() -> None:
    # Drop tables
    op.drop_index(op.f('ix_legal_documents_id'), table_name='legal_documents')
    op.drop_index(op.f('ix_legal_documents_document_id'), table_name='legal_documents')
    op.drop_index('idx_framework_type', table_name='legal_documents')
    op.drop_index('idx_effective_date', table_name='legal_documents')
    op.drop_index('idx_country_language', table_name='legal_documents')
    op.drop_table('legal_documents')

    op.drop_index(op.f('ix_user_sessions_session_id'), table_name='user_sessions')
    op.drop_index(op.f('ix_user_sessions_id'), table_name='user_sessions')
    op.drop_index('idx_user_identifier', table_name='user_sessions')
    op.drop_index('idx_started_at', table_name='user_sessions')
    op.drop_table('user_sessions')

    op.drop_index(op.f('ix_compliance_checks_id'), table_name='compliance_checks')
    op.drop_index(op.f('ix_compliance_checks_assessment_id'), table_name='compliance_checks')
    op.drop_index('idx_framework_status', table_name='compliance_checks')
    op.drop_index('idx_assessment_framework', table_name='compliance_checks')
    op.drop_table('compliance_checks')

    op.drop_index(op.f('ix_assessment_records_project_id'), table_name='assessment_records')
    op.drop_index(op.f('ix_assessment_records_id'), table_name='assessment_records')
    op.drop_index('idx_sector_ai_type', table_name='assessment_records')
    op.drop_index('idx_risk_status', table_name='assessment_records')
    op.drop_index('idx_created_at', table_name='assessment_records')
    op.drop_table('assessment_records')

    # Drop ENUM types
    op.execute("DROP TYPE legal_framework")
    op.execute("DROP TYPE compliance_status")
    op.execute("DROP TYPE risk_level")
    op.execute("DROP TYPE ai_system_type")
