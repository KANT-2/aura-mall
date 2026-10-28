"""Preserve shipping contact, instructions and fulfillment tracking."""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    for name, size in (
        ("recipient_phone", 30),
        ("delivery_note", 300),
        ("courier", 100),
        ("tracking_number", 100),
    ):
        op.execute(f"ALTER TABLE orders ADD COLUMN {name} varchar({size}) NOT NULL DEFAULT ''")


def downgrade():
    for name in ("recipient_phone", "delivery_note", "courier", "tracking_number"):
        op.execute(f"ALTER TABLE orders DROP COLUMN {name}")
