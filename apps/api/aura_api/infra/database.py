"""PostgreSQL access: declarative base, async engine and one session per request.

Application services own the transaction (``async with session.begin()``); repositories
never commit on their own.
"""

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# Matches the constraint and index names in db/schema.sql so Alembic comparisons stay clean.
NAMING_CONVENTION = {
    "ix": "%(table_name)s_%(column_0_name)s_idx",
    "uq": "%(table_name)s_%(column_0_name)s_key",
    "ck": "%(table_name)s_%(constraint_name)s_check",
    "fk": "%(table_name)s_%(column_0_name)s_fkey",
    "pk": "%(table_name)s_pkey",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def create_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(database_url, pool_pre_ping=True)


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: objects stay readable after commit without lazy I/O.
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency. Fails closed when no database is configured."""
    sessionmaker: async_sessionmaker[AsyncSession] | None = getattr(
        request.app.state, "sessionmaker", None
    )
    if sessionmaker is None:
        raise RuntimeError("Database is not configured (set AURA_DATABASE_URL)")
    async with sessionmaker() as session:
        yield session
