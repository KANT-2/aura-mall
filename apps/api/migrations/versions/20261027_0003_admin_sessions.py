"""Admin access tokens: admin_sessions.

Runs migrations/sql/0003_admin_sessions.sql (the same DDL is merged into db/schema.sql).

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-27
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCRIPT = Path(__file__).resolve().parents[1] / "sql" / "0003_admin_sessions.sql"


def upgrade() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    # asyncpg runs a multi-statement script only outside prepared statements.
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_sessions")
