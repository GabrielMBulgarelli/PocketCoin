"""add planned payments

Revision ID: 20260712_05
Revises: 20260712_04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260712_05"
down_revision: str | None = "20260712_04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "planned_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("financial_account_id", sa.Integer(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(250), nullable=False),
        sa.Column("direction", sa.Enum("INCOME", "EXPENSE", native_enum=False), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column(
            "status", sa.Enum("PENDING", "PAID", "CANCELLED", native_enum=False), nullable=False
        ),
        sa.Column(
            "recurrence",
            sa.Enum("NONE", "WEEKLY", "MONTHLY", "YEARLY", native_enum=False),
            nullable=False,
        ),
        sa.Column("is_debt_payment", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.String(2000), nullable=True),
        sa.Column("last_paid_due_date", sa.Date(), nullable=True),
        sa.Column("last_transaction_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_minor > 0"),
        sa.ForeignKeyConstraint(
            ["financial_account_id"], ["financial_accounts.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["last_transaction_id"], ["transactions.id"], ondelete="SET NULL"),
    )
    for column in ("financial_account_id", "category_id", "due_date", "status"):
        op.create_index(f"ix_planned_payments_{column}", "planned_payments", [column])


def downgrade() -> None:
    op.drop_table("planned_payments")
