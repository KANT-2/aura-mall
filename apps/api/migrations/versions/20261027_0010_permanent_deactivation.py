"""Permanent member deactivation and email reuse; never delete retained records."""

from alembic import op
from sqlalchemy import text

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE users ADD COLUMN deactivated_at timestamptz")
    # Existing explicitly withdrawn accounts also become non-restorable. Suspended users
    # without a deletion request remain reserved and cannot bypass suspension by registering.
    op.execute(
        "UPDATE users SET deactivated_at = deletion_requested_at "
        "WHERE deletion_requested_at IS NOT NULL AND NOT is_active"
    )
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT users_deactivated_inactive_check "
        "CHECK (deactivated_at IS NULL OR NOT is_active)"
    )
    op.execute("DROP INDEX users_email_lower_key")
    op.execute(
        "CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email)) "
        "WHERE deactivated_at IS NULL"
    )


def downgrade():
    # Never resolve reused addresses by deleting/renaming customer data on rollback.
    retired = (
        op.get_bind()
        .execute(text("SELECT 1 FROM users WHERE deactivated_at IS NOT NULL LIMIT 1"))
        .first()
    )
    if retired:
        raise RuntimeError("Cannot downgrade: permanent withdrawals require reviewed resolution")
    op.execute("DROP INDEX users_email_lower_key")
    op.execute("CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email))")
    op.execute(
        "ALTER TABLE users DROP CONSTRAINT users_deactivated_inactive_check, "
        "DROP COLUMN deactivated_at"
    )
