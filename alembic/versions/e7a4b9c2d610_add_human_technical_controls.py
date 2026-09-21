"""Add version-pinned human control points without changing JEV snapshots.

Revision ID: e7a4b9c2d610
Revises: f3b12c9a74e0
"""

from alembic import op
import sqlalchemy as sa

revision = "e7a4b9c2d610"
down_revision = "f3b12c9a74e0"
branch_labels = None
depends_on = None


def upgrade():
    # Runtime create_all may already have added these tables in a local install.
    if not sa.inspect(op.get_bind()).has_table("technical_control_points"):
        op.create_table(
            "technical_control_points",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "case_db_id", sa.String(36), sa.ForeignKey("cases.id"), nullable=False
            ),
            sa.Column(
                "assessment_id",
                sa.String(36),
                sa.ForeignKey("dpia_assessments.id"),
                nullable=False,
            ),
            sa.Column("original_check_id", sa.String(200), nullable=True),
            sa.Column("question", sa.Text(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=False),
            sa.Column("owner", sa.String(200), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "case_db_id",
                "assessment_id",
                "original_check_id",
                name="uq_human_original_control",
            ),
        )
        op.create_index(
            "ix_technical_control_points_case_db_id",
            "technical_control_points",
            ["case_db_id"],
        )
        op.create_index(
            "ix_technical_control_points_assessment_id",
            "technical_control_points",
            ["assessment_id"],
        )
    if not sa.inspect(op.get_bind()).has_table("technical_control_point_revisions"):
        op.create_table(
            "technical_control_point_revisions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "control_point_id",
                sa.String(36),
                sa.ForeignKey("technical_control_points.id"),
                nullable=False,
            ),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("action", sa.String(24), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False),
            sa.Column("actor_id", sa.String(128), nullable=False),
            sa.Column("actor_name", sa.String(255), nullable=False),
            sa.Column("identity_assurance", sa.String(40), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "control_point_id", "version", name="uq_human_control_revision"
            ),
        )
        op.create_index(
            "ix_technical_control_point_revisions_control_point_id",
            "technical_control_point_revisions",
            ["control_point_id"],
        )


def downgrade():
    for name in ("technical_control_point_revisions", "technical_control_points"):
        if sa.inspect(op.get_bind()).has_table(name):
            op.drop_table(name)
