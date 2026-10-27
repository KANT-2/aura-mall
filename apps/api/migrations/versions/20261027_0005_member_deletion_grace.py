"""Member deletion grace period, login failure limits and purge run records.

Runs migrations/sql/0005_member_deletion_grace.sql (the same DDL is merged into
db/schema.sql).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-27
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCRIPT = Path(__file__).resolve().parents[1] / "sql" / "0005_member_deletion_grace.sql"


def upgrade() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS member_deletion_runs")
    op.execute("DROP TABLE IF EXISTS login_failures")
    op.execute("DROP INDEX IF EXISTS users_deletion_due_idx")
    op.execute(
        "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_deletion_inactive_check, "
        "DROP CONSTRAINT IF EXISTS users_deletion_schedule_check, "
        "DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS deletion_scheduled_at, "
        "DROP COLUMN IF EXISTS deletion_requested_at"
    )
