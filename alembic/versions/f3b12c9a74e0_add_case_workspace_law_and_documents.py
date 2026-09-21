"""Add unified case workspace, legal impacts and document bank.

Revision ID: f3b12c9a74e0
Revises: 8c31a4d6e209
Create Date: 2026-08-31
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3b12c9a74e0"
down_revision: Union[str, None] = "8c31a4d6e209"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _ensure_case_tables() -> None:
    """Backfill case tables that predated Alembic and were created at runtime."""

    if not _has_table("cases"):
        op.create_table(
            "cases",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("case_id", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("last_aggregate_status", sa.String(length=16), nullable=True),
            sa.Column("assigned_to", sa.String(length=64), nullable=True),
            sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "last_reminder_sent_at", sa.DateTime(timezone=True), nullable=True
            ),
            sa.Column("last_assessment_log_id", sa.String(length=36), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_cases_case_id", "cases", ["case_id"])
        op.create_index("ix_cases_status", "cases", ["status"])
        op.create_index("ix_cases_next_review_at", "cases", ["next_review_at"])
        op.create_index("ix_cases_status_review", "cases", ["status", "next_review_at"])
    if not _has_table("case_transitions"):
        op.create_table(
            "case_transitions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("case_db_id", sa.String(length=36), nullable=False),
            sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("from_status", sa.String(length=32), nullable=True),
            sa.Column("to_status", sa.String(length=32), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("changed_by", sa.String(length=64), nullable=True),
            sa.ForeignKeyConstraint(["case_db_id"], ["cases.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_case_transitions_case_db_id", "case_transitions", ["case_db_id"]
        )


def _add_dpia_case_link() -> None:
    if not _has_table("dpia_assessments"):
        return
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("dpia_assessments")}
    foreign_keys = inspector.get_foreign_keys("dpia_assessments")
    indexes = {index["name"] for index in inspector.get_indexes("dpia_assessments")}
    with op.batch_alter_table("dpia_assessments") as batch:
        if "case_db_id" not in columns:
            batch.add_column(
                sa.Column("case_db_id", sa.String(length=36), nullable=True)
            )
        if not any(fk.get("name") == "fk_dpia_assessment_case" for fk in foreign_keys):
            batch.create_foreign_key(
                "fk_dpia_assessment_case",
                "cases",
                ["case_db_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if "ix_dpia_assessments_case_db_id" not in indexes:
            batch.create_index("ix_dpia_assessments_case_db_id", ["case_db_id"])
        if "idx_dpia_case_created" not in indexes:
            batch.create_index("idx_dpia_case_created", ["case_db_id", "created_at"])


def upgrade() -> None:
    _ensure_case_tables()
    _add_dpia_case_link()

    if not _has_table("case_workspace_references"):
        op.create_table(
            "case_workspace_references",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("case_db_id", sa.String(length=36), nullable=False),
            sa.Column("reference_type", sa.String(length=32), nullable=False),
            sa.Column("reference_id", sa.String(length=128), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("source_version", sa.String(length=128), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("created_by", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["case_db_id"], ["cases.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "case_db_id",
                "reference_type",
                "reference_id",
                name="uq_case_workspace_reference",
            ),
        )
        op.create_index(
            "ix_case_workspace_references_case_db_id",
            "case_workspace_references",
            ["case_db_id"],
        )
        op.create_index(
            "ix_workspace_reference_lookup",
            "case_workspace_references",
            ["reference_type", "reference_id"],
        )

    if not _has_table("case_actions"):
        op.create_table(
            "case_actions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("case_db_id", sa.String(length=36), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(length=32), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("priority", sa.String(length=16), nullable=False),
            sa.Column("owner", sa.String(length=128), nullable=True),
            sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("source_reference_type", sa.String(length=32), nullable=True),
            sa.Column("source_reference_id", sa.String(length=128), nullable=True),
            sa.Column("evidence_note", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["case_db_id"], ["cases.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_case_actions_case_db_id", "case_actions", ["case_db_id"])
        op.create_index("ix_case_actions_status", "case_actions", ["status"])
        op.create_index("ix_case_actions_priority", "case_actions", ["priority"])
        op.create_index("ix_case_actions_due_at", "case_actions", ["due_at"])
        op.create_index(
            "ix_case_action_board", "case_actions", ["case_db_id", "status", "priority"]
        )

    if not _has_table("case_approvals"):
        op.create_table(
            "case_approvals",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("case_db_id", sa.String(length=36), nullable=False),
            sa.Column("approval_type", sa.String(length=32), nullable=False),
            sa.Column("subject_reference_type", sa.String(length=32), nullable=True),
            sa.Column("subject_reference_id", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("requested_by", sa.String(length=128), nullable=False),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("decided_by", sa.String(length=128), nullable=True),
            sa.Column("actor_oid", sa.String(length=128), nullable=True),
            sa.Column("auth_mode", sa.String(length=32), nullable=True),
            sa.Column("identity_assurance", sa.String(length=32), nullable=True),
            sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("conditions", sa.JSON(), nullable=True),
            sa.Column("decision_snapshot", sa.JSON(), nullable=True),
            sa.Column("is_identity_verified", sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(["case_db_id"], ["cases.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_case_approvals_case_db_id", "case_approvals", ["case_db_id"]
        )
        op.create_index("ix_case_approvals_status", "case_approvals", ["status"])
        op.create_index("ix_case_approvals_actor_oid", "case_approvals", ["actor_oid"])
        op.create_index(
            "ix_case_approval_status",
            "case_approvals",
            ["case_db_id", "status", "requested_at"],
        )

    if not _has_table("monitored_legal_sources"):
        op.create_table(
            "monitored_legal_sources",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("source_key", sa.String(length=255), nullable=False),
            sa.Column("title", sa.String(length=500), nullable=False),
            sa.Column("authority", sa.String(length=255), nullable=False),
            sa.Column("jurisdiction", sa.String(length=64), nullable=False),
            sa.Column("source_url", sa.Text(), nullable=False),
            sa.Column(
                "current_version_identifier", sa.String(length=128), nullable=True
            ),
            sa.Column("current_content_sha256", sa.String(length=64), nullable=False),
            sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("source_metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("source_key", name="uq_monitored_legal_source_key"),
        )
        op.create_index(
            "ix_monitored_legal_sources_source_key",
            "monitored_legal_sources",
            ["source_key"],
        )

    if not _has_table("legal_source_versions"):
        op.create_table(
            "legal_source_versions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("legal_source_id", sa.String(length=36), nullable=False),
            sa.Column("version_identifier", sa.String(length=128), nullable=True),
            sa.Column("content_sha256", sa.String(length=64), nullable=False),
            sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("change_summary", sa.Text(), nullable=True),
            sa.Column("source_metadata", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(
                ["legal_source_id"], ["monitored_legal_sources.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "legal_source_id", "content_sha256", name="uq_legal_source_content"
            ),
        )
        op.create_index(
            "ix_legal_source_versions_legal_source_id",
            "legal_source_versions",
            ["legal_source_id"],
        )
        op.create_index(
            "ix_legal_source_version_detected",
            "legal_source_versions",
            ["legal_source_id", "detected_at"],
        )

    if not _has_table("case_legal_dependencies"):
        op.create_table(
            "case_legal_dependencies",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("case_db_id", sa.String(length=36), nullable=False),
            sa.Column("legal_source_id", sa.String(length=36), nullable=False),
            sa.Column("article_reference", sa.String(length=255), nullable=False),
            sa.Column("relevance", sa.Text(), nullable=True),
            sa.Column("assessment_reference_type", sa.String(length=32), nullable=True),
            sa.Column("assessment_reference_id", sa.String(length=128), nullable=True),
            sa.Column("linked_source_version_id", sa.String(length=36), nullable=False),
            sa.Column("last_reviewed_version_id", sa.String(length=36), nullable=False),
            sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("linked_by", sa.String(length=128), nullable=True),
            sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["case_db_id"], ["cases.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["legal_source_id"], ["monitored_legal_sources.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["linked_source_version_id"], ["legal_source_versions.id"]
            ),
            sa.ForeignKeyConstraint(
                ["last_reviewed_version_id"], ["legal_source_versions.id"]
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "case_db_id",
                "legal_source_id",
                "article_reference",
                name="uq_case_legal_dependency",
            ),
        )
        op.create_index(
            "ix_case_legal_dependencies_case_db_id",
            "case_legal_dependencies",
            ["case_db_id"],
        )
        op.create_index(
            "ix_case_legal_dependencies_legal_source_id",
            "case_legal_dependencies",
            ["legal_source_id"],
        )
        op.create_index(
            "ix_case_legal_dependencies_status", "case_legal_dependencies", ["status"]
        )
        op.create_index(
            "ix_case_legal_dependency_status",
            "case_legal_dependencies",
            ["case_db_id", "status"],
        )

    if not _has_table("case_reassessments"):
        op.create_table(
            "case_reassessments",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("case_db_id", sa.String(length=36), nullable=False),
            sa.Column("dependency_id", sa.String(length=36), nullable=False),
            sa.Column("legal_source_id", sa.String(length=36), nullable=False),
            sa.Column("previous_version_id", sa.String(length=36), nullable=False),
            sa.Column("new_version_id", sa.String(length=36), nullable=False),
            sa.Column("trigger_type", sa.String(length=32), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("assigned_to", sa.String(length=128), nullable=True),
            sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("resolved_by", sa.String(length=128), nullable=True),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["case_db_id"], ["cases.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["dependency_id"], ["case_legal_dependencies.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["legal_source_id"], ["monitored_legal_sources.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["previous_version_id"], ["legal_source_versions.id"]
            ),
            sa.ForeignKeyConstraint(["new_version_id"], ["legal_source_versions.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "dependency_id", "new_version_id", name="uq_dependency_reassessment"
            ),
        )
        op.create_index(
            "ix_case_reassessments_case_db_id", "case_reassessments", ["case_db_id"]
        )
        op.create_index(
            "ix_case_reassessments_dependency_id",
            "case_reassessments",
            ["dependency_id"],
        )
        op.create_index(
            "ix_case_reassessments_legal_source_id",
            "case_reassessments",
            ["legal_source_id"],
        )
        op.create_index(
            "ix_case_reassessments_status", "case_reassessments", ["status"]
        )
        op.create_index(
            "ix_case_reassessments_due_at", "case_reassessments", ["due_at"]
        )
        op.create_index(
            "ix_case_reassessment_queue",
            "case_reassessments",
            ["status", "due_at", "created_at"],
        )

    if not _has_table("municipal_documents"):
        op.create_table(
            "municipal_documents",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("document_key", sa.String(length=128), nullable=True),
            sa.Column("title", sa.String(length=500), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(length=64), nullable=False),
            sa.Column("owner", sa.String(length=128), nullable=True),
            sa.Column("classification", sa.String(length=64), nullable=True),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_by", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("document_key", name="uq_municipal_document_key"),
        )
        op.create_index(
            "ix_municipal_documents_document_key",
            "municipal_documents",
            ["document_key"],
        )
        op.create_index(
            "ix_municipal_documents_category", "municipal_documents", ["category"]
        )
        op.create_index(
            "ix_municipal_documents_owner", "municipal_documents", ["owner"]
        )
        op.create_index(
            "ix_municipal_documents_is_active", "municipal_documents", ["is_active"]
        )

    if not _has_table("municipal_document_versions"):
        op.create_table(
            "municipal_document_versions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("document_id", sa.String(length=36), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("original_filename", sa.String(length=255), nullable=False),
            sa.Column("media_type", sa.String(length=255), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("content_sha256", sa.String(length=64), nullable=False),
            sa.Column("storage_key", sa.String(length=1000), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False),
            sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
            sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
            sa.Column("review_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("supersedes_id", sa.String(length=36), nullable=True),
            sa.Column("uploaded_by", sa.String(length=128), nullable=True),
            sa.Column("approved_by", sa.String(length=128), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approval_note", sa.Text(), nullable=True),
            sa.Column("version_metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["document_id"], ["municipal_documents.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["supersedes_id"], ["municipal_document_versions.id"]
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("storage_key", name="uq_document_storage_key"),
            sa.UniqueConstraint(
                "document_id", "version_number", name="uq_document_version_number"
            ),
            sa.UniqueConstraint(
                "document_id", "content_sha256", name="uq_document_version_content"
            ),
        )
        op.create_index(
            "ix_municipal_document_versions_document_id",
            "municipal_document_versions",
            ["document_id"],
        )
        op.create_index(
            "ix_municipal_document_versions_status",
            "municipal_document_versions",
            ["status"],
        )
        op.create_index(
            "ix_municipal_document_versions_valid_to",
            "municipal_document_versions",
            ["valid_to"],
        )
        op.create_index(
            "ix_municipal_document_versions_review_at",
            "municipal_document_versions",
            ["review_at"],
        )
        op.create_index(
            "ix_document_version_status",
            "municipal_document_versions",
            ["document_id", "status", "version_number"],
        )

    if not _has_table("case_document_links"):
        op.create_table(
            "case_document_links",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("case_db_id", sa.String(length=36), nullable=False),
            sa.Column("document_id", sa.String(length=36), nullable=False),
            sa.Column("document_version_id", sa.String(length=36), nullable=False),
            sa.Column("link_role", sa.String(length=32), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("linked_by", sa.String(length=128), nullable=True),
            sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["case_db_id"], ["cases.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["document_id"], ["municipal_documents.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["document_version_id"], ["municipal_document_versions.id"]
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "case_db_id",
                "document_version_id",
                "link_role",
                name="uq_case_document_version_role",
            ),
        )
        op.create_index(
            "ix_case_document_links_case_db_id", "case_document_links", ["case_db_id"]
        )
        op.create_index(
            "ix_case_document_links_document_id", "case_document_links", ["document_id"]
        )
        op.create_index(
            "ix_case_document_links_document_version_id",
            "case_document_links",
            ["document_version_id"],
        )
        op.create_index(
            "ix_case_document_linked",
            "case_document_links",
            ["case_db_id", "linked_at"],
        )


def downgrade() -> None:
    for table_name in (
        "case_document_links",
        "municipal_document_versions",
        "municipal_documents",
        "case_reassessments",
        "case_legal_dependencies",
        "legal_source_versions",
        "monitored_legal_sources",
        "case_approvals",
        "case_actions",
        "case_workspace_references",
    ):
        if _has_table(table_name):
            op.drop_table(table_name)

    if _has_table("dpia_assessments"):
        inspector = sa.inspect(op.get_bind())
        columns = {
            column["name"] for column in inspector.get_columns("dpia_assessments")
        }
        if "case_db_id" in columns:
            with op.batch_alter_table("dpia_assessments") as batch:
                indexes = {
                    index["name"] for index in inspector.get_indexes("dpia_assessments")
                }
                if "idx_dpia_case_created" in indexes:
                    batch.drop_index("idx_dpia_case_created")
                if "ix_dpia_assessments_case_db_id" in indexes:
                    batch.drop_index("ix_dpia_assessments_case_db_id")
                foreign_keys = inspector.get_foreign_keys("dpia_assessments")
                if any(
                    fk.get("name") == "fk_dpia_assessment_case" for fk in foreign_keys
                ):
                    batch.drop_constraint("fk_dpia_assessment_case", type_="foreignkey")
                batch.drop_column("case_db_id")

    # `cases` and `case_transitions` are intentionally retained. They predate
    # this revision and some installations already populated them via
    # SQLAlchemy's runtime create_all path.
