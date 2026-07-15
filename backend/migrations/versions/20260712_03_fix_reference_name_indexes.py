"""Fix case-insensitive reference-data indexes.

Revision ID: 20260712_03
Revises: 20260711_02
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260712_03"
down_revision: str | Sequence[str] | None = "20260711_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("uq_categories_active_name_direction", table_name="categories")
    op.drop_index("uq_tags_active_name", table_name="tags")
    op.create_index(
        "uq_categories_active_name_direction",
        "categories",
        [sa.text("lower(name)"), "direction"],
        unique=True,
        sqlite_where=sa.text("is_active = 1"),
    )
    op.create_index(
        "uq_tags_active_name",
        "tags",
        [sa.text("lower(name)")],
        unique=True,
        sqlite_where=sa.text("is_active = 1"),
    )


def downgrade() -> None:
    op.drop_index("uq_tags_active_name", table_name="tags")
    op.drop_index("uq_categories_active_name_direction", table_name="categories")
    op.create_index(
        "uq_categories_active_name_direction",
        "categories",
        [sa.text("lower('name')"), "direction"],
        unique=True,
        sqlite_where=sa.text("is_active = 1"),
    )
    op.create_index(
        "uq_tags_active_name",
        "tags",
        [sa.text("lower('name')")],
        unique=True,
        sqlite_where=sa.text("is_active = 1"),
    )
