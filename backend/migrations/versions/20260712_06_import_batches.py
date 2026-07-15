"""add CSV import batches

Revision ID: 20260712_06
Revises: 20260712_05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260712_06"
down_revision: str | None = "20260712_05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_fingerprint", sa.String(64), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "COMMITTED", "EXPIRED", native_enum=False),
            nullable=False,
        ),
        sa.Column("imported_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_import_batches_file_fingerprint", "import_batches", ["file_fingerprint"])
    op.create_index("ix_import_batches_status", "import_batches", ["status"])


def downgrade() -> None:
    op.drop_table("import_batches")
