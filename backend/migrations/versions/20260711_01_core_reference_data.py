"""Create core reference data.

Revision ID: 20260711_01
Revises:
Create Date: 2026-07-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260711_01"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    account_kind = sa.Enum(
        "cash", "checking", "savings", "credit_card", "overdraft", "loan", native_enum=False
    )
    direction = sa.Enum("income", "expense", native_enum=False)
    theme = sa.Enum("system", "light", "dark", native_enum=False)
    op.create_table(
        "financial_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("kind", account_kind, nullable=False),
        sa.Column("opening_balance_minor", sa.Integer(), nullable=False),
        sa.Column("opening_balance_date", sa.Date(), nullable=False),
        sa.Column("credit_limit_minor", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("opening_balance_minor >= 0"),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("direction", direction, nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "uq_categories_active_name_direction",
        "categories",
        [sa.text("lower(name)"), "direction"],
        unique=True,
        sqlite_where=sa.text("is_active = 1"),
    )
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "uq_tags_active_name",
        "tags",
        [sa.text("lower(name)")],
        unique=True,
        sqlite_where=sa.text("is_active = 1"),
    )
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("base_currency", sa.String(length=3), nullable=False),
        sa.Column("locale", sa.String(length=35), nullable=False),
        sa.Column("first_day_of_week", sa.String(length=9), nullable=False),
        sa.Column("theme", theme, nullable=False),
        sa.CheckConstraint("id = 1"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_index("uq_tags_active_name", table_name="tags")
    op.drop_table("tags")
    op.drop_index("uq_categories_active_name_direction", table_name="categories")
    op.drop_table("categories")
    op.drop_table("financial_accounts")
