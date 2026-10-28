"""Add customer product questions and operator answer audit entries."""

from pathlib import Path

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    sql = (Path(__file__).parents[1] / "sql" / "0011_product_questions.sql").read_text()
    for statement in sql.split(";"):
        if statement.strip():
            op.execute(statement)


def downgrade():
    # Answer audit entries must be preserved for operator accountability.
    op.execute("DROP TABLE product_questions")
