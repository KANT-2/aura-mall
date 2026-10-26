"""JWT refresh tokens: auth_token_families, refresh_tokens and users.is_active.

Runs migrations/sql/0002_auth_tokens.sql (the same DDL is merged into db/schema.sql).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-26
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCRIPT = Path(__file__).resolve().parents[1] / "sql" / "0002_auth_tokens.sql"


def upgrade() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    # asyncpg runs a multi-statement script only outside prepared statements.
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS refresh_tokens")
    op.execute("DROP TABLE IF EXISTS auth_token_families")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_active")
