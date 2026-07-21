"""add General transactions and recurring series metadata

Revision ID: 20260720_07
Revises: 20260712_06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260720_07"
down_revision: str | None = "20260712_06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("planned_payments") as batch:
        batch.add_column(sa.Column("end_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("anchor_day", sa.Integer(), nullable=True))

    with op.batch_alter_table("transactions", recreate="always") as batch:
        batch.alter_column("financial_account_id", existing_type=sa.Integer(), nullable=True)
        batch.add_column(sa.Column("planned_payment_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("scheduled_for", sa.Date(), nullable=True))
        batch.create_foreign_key(
            "fk_transactions_planned_payment_id",
            "planned_payments",
            ["planned_payment_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_unique_constraint(
            "uq_transactions_planned_occurrence",
            ["planned_payment_id", "scheduled_for"],
        )
        batch.create_index("ix_transactions_planned_payment_id", ["planned_payment_id"])

    op.create_table(
        "planned_payment_tags",
        sa.Column("planned_payment_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["planned_payment_id"], ["planned_payments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("planned_payment_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("planned_payment_tags")
    with op.batch_alter_table("transactions", recreate="always") as batch:
        batch.drop_index("ix_transactions_planned_payment_id")
        batch.drop_constraint("uq_transactions_planned_occurrence", type_="unique")
        batch.drop_constraint("fk_transactions_planned_payment_id", type_="foreignkey")
        batch.drop_column("scheduled_for")
        batch.drop_column("planned_payment_id")
        batch.alter_column("financial_account_id", existing_type=sa.Integer(), nullable=False)
    with op.batch_alter_table("planned_payments") as batch:
        batch.drop_column("anchor_day")
        batch.drop_column("end_date")
