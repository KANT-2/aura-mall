"""Load db/seed.sql (catalog data) into the database at AURA_DATABASE_URL.

    uv run --directory apps/api python -m aura_api.infra.seed

Safe to repeat: existing rows are kept. Creates no accounts.
"""

import asyncio
from pathlib import Path

import asyncpg

from aura_api.config import Settings

SEED = Path(__file__).resolve().parents[2] / "db" / "seed.sql"


async def load_seed(database_url: str) -> None:
    # asyncpg wants the plain postgresql:// scheme; SQLAlchemy's +asyncpg marker is dropped.
    connection = await asyncpg.connect(
        database_url.replace("postgresql+asyncpg://", "postgresql://")
    )
    try:
        await connection.execute(SEED.read_text(encoding="utf-8"))
    finally:
        await connection.close()


def main() -> None:
    settings = Settings()
    if settings.database_url is None:
        raise SystemExit("Set AURA_DATABASE_URL to load seed data")
    asyncio.run(load_seed(settings.database_url.get_secret_value()))
    print(f"loaded {SEED.name}")


if __name__ == "__main__":
    main()
