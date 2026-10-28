"""PostgreSQL access: declarative base, async engine and one session per request.

Application services own the transaction (``async with session.begin()``); repositories
never commit on their own.
"""

from collections.abc import AsyncIterator
from socket import gaierror
from ssl import TLSVersion, create_default_context

from fastapi import Request
from sqlalchemy import MetaData, event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from aura_api.infra.database_errors import DatabaseUnavailable

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
    url = make_url(database_url).set(drivername="postgresql+asyncpg")
    connect_args = {"timeout": 3}
    # libpq URL options are not keyword arguments accepted by SQLAlchemy's asyncpg dialect.
    # Keep the same verify-full URL usable by psycopg, asyncpg seed and migration tools.
    if "sslmode" in url.query:
        if url.query["sslmode"] != "verify-full" or not url.query.get("sslrootcert"):
            raise ValueError("Database TLS requires sslmode=verify-full and sslrootcert")
        context = create_default_context(cafile=url.query["sslrootcert"])
        context.minimum_version = TLSVersion.TLSv1_2
        connect_args["ssl"] = context
        url = url.difference_update_query(["sslmode", "sslrootcert"])
    engine = create_async_engine(url, connect_args=connect_args, pool_pre_ping=True)

    @event.listens_for(engine.sync_engine, "do_connect")
    def connect(dialect, record, args, kwargs):
        try:
            return dialect.connect(*args, **kwargs)
        except (ConnectionError, TimeoutError, gaierror):
            # These exceptions are not DBAPI.Error and bypass SQLAlchemy handle_error.
            raise DatabaseUnavailable("Database connection is unavailable") from None

    @event.listens_for(engine.sync_engine, "handle_error")
    def connection_error(context):
        # asyncpg can raise raw socket/DNS/timeouts outside its DBAPI wrapper.
        # Normalize only errors from SQLAlchemy, never unrelated service/network calls.
        if isinstance(context.original_exception, (ConnectionError, TimeoutError, gaierror)):
            raise DatabaseUnavailable("Database connection is unavailable") from None

    return engine


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: objects stay readable after commit without lazy I/O.
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency. Fails closed when no database is configured."""
    runtime = getattr(request.app.state, "database_runtime", None)
    if runtime is not None:
        async with runtime.lease() as generation, generation.sessions() as session:
            yield session
        return
    sessionmaker: async_sessionmaker[AsyncSession] | None = getattr(
        request.app.state, "sessionmaker", None
    )
    if sessionmaker is None:
        raise RuntimeError("Database is not configured (set AURA_DATABASE_URL)")
    async with sessionmaker() as session:
        yield session
