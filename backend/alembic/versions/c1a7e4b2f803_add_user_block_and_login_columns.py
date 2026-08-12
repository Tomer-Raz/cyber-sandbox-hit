"""add user block and login columns

Revision ID: c1a7e4b2f803
Revises: d45a771a31c3
Create Date: 2026-08-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c1a7e4b2f803"
down_revision: Union[str, None] = "d45a771a31c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("blocked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users", sa.Column("blocked_by", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_users_blocked_by_users", "users", "users", ["blocked_by"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_blocked_by_users", "users", type_="foreignkey")
    op.drop_column("users", "blocked_by")
    op.drop_column("users", "blocked_at")
    op.drop_column("users", "last_login_at")
