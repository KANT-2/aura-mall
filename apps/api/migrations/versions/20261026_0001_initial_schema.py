"""Initial schema: the 21 tables of db/schema.sql as of PR #33.

Runs migrations/sql/0001_initial_schema.sql, a frozen copy of that schema.sql, so later
edits to db/schema.sql never change what this revision creates. tests/db checks the ORM
models and db/schema.sql against the migrated result.

Revision ID: 0001
Revises:
Create Date: 2026-10-26
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = Path(__file__).resolve().parents[1] / "sql" / "0001_initial_schema.sql"

# Reverse dependency order for downgrade.
TABLES = [
    "admin_audit_logs",
    "stock_adjustments",
    "partner_inquiries",
    "order_item_selections",
    "order_items",
    "orders",
    "atelier_drafts",
    "recipe_ingredients",
    "recipes",
    "promotions",
    "suggested_names",
    "scent_family_ingredients",
    "scent_families",
    "ingredients",
    "products",
    "product_types",
    "collections",
    "revoked_tokens",
    "admins",
    "user_coupons",
    "users",
]


def schema_script() -> str:
    """The SQL without its own BEGIN/COMMIT: Alembic owns the transaction."""
    lines = [
        line
        for line in SCHEMA.read_text(encoding="utf-8").splitlines()
        if line.strip() not in ("BEGIN;", "COMMIT;")
    ]
    return "\n".join(lines)


def upgrade() -> None:
    script = schema_script()
    # asyncpg runs a multi-statement script only outside prepared statements.
    op.get_bind().connection.dbapi_connection.run_async(lambda conn: conn.execute(script))


def downgrade() -> None:
    for table in TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
