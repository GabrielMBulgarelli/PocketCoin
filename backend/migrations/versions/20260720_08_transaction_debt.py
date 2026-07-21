"""classify debt payments on transactions

Revision ID: 20260720_08
Revises: 20260720_07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260720_08"
down_revision: str | None = "20260720_07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("transactions", recreate="always") as batch:
        batch.add_column(
            sa.Column(
                "is_debt_payment",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.create_check_constraint(
            "ck_transactions_debt_expense_only",
            "is_debt_payment = 0 OR kind = 'EXPENSE'",
        )
    op.execute(
        "UPDATE transactions SET is_debt_payment = 1 "
        "WHERE kind = 'EXPENSE' AND planned_payment_id IN "
        "(SELECT id FROM planned_payments WHERE is_debt_payment = 1)"
    )


def downgrade() -> None:
    with op.batch_alter_table("transactions", recreate="always") as batch:
        batch.drop_constraint("ck_transactions_debt_expense_only", type_="check")
        batch.drop_column("is_debt_payment")
