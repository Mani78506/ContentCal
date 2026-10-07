"""Initial schema: users, workspaces, members, accounts, content, media,
scheduled posts, publishing jobs, publishing attempts.

This baseline materializes Base.metadata so the schema always matches the
ORM models. Subsequent changes should be generated with
`alembic revision --autogenerate -m "..."`.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-07
"""

from alembic import op

from contentcal.models import Base

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
