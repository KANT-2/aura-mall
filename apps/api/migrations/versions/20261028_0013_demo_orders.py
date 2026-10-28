"""Mark synthetic presentation orders and protect them from PG and expiry operations."""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE orders ADD COLUMN is_demo boolean NOT NULL DEFAULT false")
    op.execute("""CREATE FUNCTION aura_demo_order_readonly() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.is_demo AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Synthetic presentation orders are read only';
    END IF;
    RETURN NEW;
END;
$$""")
    op.execute(
        "CREATE TRIGGER aura_demo_order_readonly BEFORE UPDATE ON orders "
        "FOR EACH ROW EXECUTE FUNCTION aura_demo_order_readonly()"
    )


def downgrade():
    op.execute("DROP TRIGGER aura_demo_order_readonly ON orders")
    op.execute("DROP FUNCTION aura_demo_order_readonly()")
    op.execute("ALTER TABLE orders DROP COLUMN is_demo")
