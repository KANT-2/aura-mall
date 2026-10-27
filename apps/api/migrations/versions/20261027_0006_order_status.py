"""Order status and status change history.

Runs migrations/sql/0006_order_status.sql (the same DDL is merged into
db/schema.sql).

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-27
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCRIPT = Path(__file__).resolve().parents[1] / "sql" / "0006_order_status.sql"


def upgrade() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS order_status_history")
    op.execute(
        "ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check, "
        "DROP COLUMN IF EXISTS status"
    )
