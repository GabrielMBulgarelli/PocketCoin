"""add budgets

Revision ID: 20260712_04
Revises: 20260712_03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260712_04"
down_revision: str | None = "20260712_03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("limit_minor", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("limit_minor > 0"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_budgets_category_id", "budgets", ["category_id"])
    op.create_index("ix_budgets_month", "budgets", ["month"])
    op.create_index("uq_budgets_category_month", "budgets", ["category_id", "month"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_budgets_category_month", table_name="budgets")
    op.drop_index("ix_budgets_month", table_name="budgets")
    op.drop_index("ix_budgets_category_id", table_name="budgets")
    op.drop_table("budgets")
