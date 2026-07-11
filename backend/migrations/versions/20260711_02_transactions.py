"""Create transactions and transaction tags.

Revision ID: 20260711_02
Revises: 20260711_01
Create Date: 2026-07-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260711_02"
down_revision: str | Sequence[str] | None = "20260711_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("financial_account_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("income", "expense", "transfer_in", "transfer_out", native_enum=False),
            nullable=False,
        ),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=250), nullable=False),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("transfer_group_id", sa.String(length=36), nullable=True),
        sa.Column("external_id", sa.String(length=250), nullable=True),
        sa.Column("import_fingerprint", sa.String(length=128), nullable=True),
        sa.Column("import_batch_id", sa.String(length=36), nullable=True),
        sa.Column(
            "source",
            sa.Enum("manual", "csv_import", "planned_payment", native_enum=False),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["financial_account_id"], ["financial_accounts.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.CheckConstraint("amount_minor > 0"),
    )
    op.create_index("ix_transactions_date_id", "transactions", ["transaction_date", "id"])
    op.create_index("ix_transactions_transfer_group", "transactions", ["transfer_group_id"])
    op.create_table(
        "transaction_tags",
        sa.Column("transaction_id", sa.Integer(), primary_key=True),
        sa.Column("tag_id", sa.Integer(), primary_key=True),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"]),
    )


def downgrade() -> None:
    op.drop_table("transaction_tags")
    op.drop_index("ix_transactions_transfer_group", table_name="transactions")
    op.drop_index("ix_transactions_date_id", table_name="transactions")
    op.drop_table("transactions")
