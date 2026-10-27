"""Partner inquiry rate-limit lookup index.

Runs migrations/sql/0004_partner_inquiry_rate_limit.sql (the same index is merged into
db/schema.sql).

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-27
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCRIPT = Path(__file__).resolve().parents[1] / "sql" / "0004_partner_inquiry_rate_limit.sql"


def upgrade() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS partner_inquiries_email_created_idx")
