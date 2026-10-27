"""Cancelled payment attempts and the unpaid order index.

Runs migrations/sql/0008_order_cancellation.sql (the same DDL is merged into
db/schema.sql).

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-27
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCRIPT = Path(__file__).resolve().parents[1] / "sql" / "0008_order_cancellation.sql"


def upgrade() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS orders_unpaid_created_idx")
    # CANCELED attempts never reached the PG and have no 0007 form (no paymentKey): drop them.
    op.execute("DELETE FROM payments WHERE status = 'CANCELED'")
    op.execute(
        "ALTER TABLE payments DROP CONSTRAINT payments_status_check, "
        "DROP CONSTRAINT payments_claimed_check, "
        "ADD CONSTRAINT payments_status_check "
        "CHECK (status IN ('READY', 'IN_PROGRESS', 'DONE', 'FAILED')), "
        "ADD CONSTRAINT payments_claimed_check CHECK (status = 'READY' "
        "OR (payment_key IS NOT NULL AND confirm_started_at IS NOT NULL))"
    )
