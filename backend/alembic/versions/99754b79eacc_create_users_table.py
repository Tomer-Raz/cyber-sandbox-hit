"""create users table

Revision ID: 99754b79eacc
Revises:
Create Date: 2026-07-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "99754b79eacc"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("google_sub", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_table("users")
