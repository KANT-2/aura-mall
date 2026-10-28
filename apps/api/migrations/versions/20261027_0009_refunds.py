"""Refund attempts for paid orders.

Runs migrations/sql/0009_refunds.sql (the same DDL is merged into db/schema.sql).

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-27
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCRIPT = Path(__file__).resolve().parents[1] / "sql" / "0009_refunds.sql"


def upgrade() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    # Refund records are the only trace of money returned through the PG: back up first.
    op.execute("DROP TABLE refunds")
