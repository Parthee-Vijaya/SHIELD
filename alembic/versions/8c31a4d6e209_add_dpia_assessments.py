"""Add durable DPIA assessments.

Revision ID: 8c31a4d6e209
Revises: 5df7504ce7f5
Create Date: 2026-08-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8c31a4d6e209"
down_revision: Union[str, None] = "5df7504ce7f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dpia_assessments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("project_name", sa.String(length=500), nullable=False),
        sa.Column("organisation", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("risk_level", sa.String(length=32), nullable=False),
        sa.Column("template_version", sa.String(length=64), nullable=False),
        sa.Column("request_payload", sa.JSON(), nullable=False),
        sa.Column("result_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_dpia_created_at", "dpia_assessments", ["created_at"])
    op.create_index("idx_dpia_project_name", "dpia_assessments", ["project_name"])
    op.create_index(
        "idx_dpia_status_risk", "dpia_assessments", ["status", "risk_level"]
    )


def downgrade() -> None:
    op.drop_index("idx_dpia_status_risk", table_name="dpia_assessments")
    op.drop_index("idx_dpia_project_name", table_name="dpia_assessments")
    op.drop_index("idx_dpia_created_at", table_name="dpia_assessments")
    op.drop_table("dpia_assessments")
