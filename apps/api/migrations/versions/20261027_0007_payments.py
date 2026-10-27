"""PG payment attempts per order.

Runs migrations/sql/0007_payments.sql (the same DDL is merged into
db/schema.sql).

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-27
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCRIPT = Path(__file__).resolve().parents[1] / "sql" / "0007_payments.sql"


def upgrade() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS payments")
