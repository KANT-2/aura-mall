"""Alembic environment: async engine from AURA_DATABASE_URL, metadata from aura_api.infra.models."""

import asyncio

from alembic import context
from sqlalchemy.engine import Connection

from aura_api.config import Settings
from aura_api.infra.database import create_engine
from aura_api.infra.models import Base

target_metadata = Base.metadata


def database_url() -> str:
    url = context.config.attributes.get("database_url")
    if url:
        return url
    settings = Settings()
    if settings.database_url is None:
        raise RuntimeError("Set AURA_DATABASE_URL to run migrations")
    return settings.database_url.get_secret_value()


def run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_online() -> None:
    engine = create_engine(database_url())
    async with engine.connect() as connection:
        await connection.run_sync(run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    raise RuntimeError("Offline SQL generation is not supported; use db/schema.sql")

asyncio.run(run_online())
