"""Product creation, visibility, detailed content and shared image storage."""

from pathlib import Path

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    for statement in (
        (Path(__file__).parents[1] / "sql/0013_catalog_management.sql").read_text().split(";")
    ):
        if statement.strip():
            op.execute(statement)


def downgrade():
    op.execute("DROP TABLE media_assets")
    op.execute("ALTER TABLE products DROP COLUMN is_active, DROP COLUMN details")
    # Retain extra variants rather than deleting products to restore the old cardinality.
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM products GROUP BY collection_id,type_id HAVING count(*) > 1)
        THEN ALTER TABLE products ADD CONSTRAINT products_collection_type_key
            UNIQUE (collection_id,type_id);
        END IF;
    END $$""")
