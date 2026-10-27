"""Migration 0002 (refresh tokens) and the latest db/schema.sql against real PostgreSQL."""

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import asyncpg
import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import AuthTokenFamily, Base, RefreshToken, User

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
API_DIR = Path(__file__).resolve().parents[2]
EXPRESSION_INDEXES = {"users_email_lower_key", "admins_email_lower_key"}


def alembic_config() -> Config:
    config = Config(str(API_DIR / "alembic.ini"))
    config.attributes["database_url"] = URL
    return config


def orm_differences(url: str) -> list:
    def compare(connection):
        context = MigrationContext.configure(
            connection,
            opts={
                "compare_type": True,
                "include_object": lambda obj, name, type_, reflected, compare_to: (
                    name not in EXPRESSION_INDEXES
                ),
            },
        )
        return compare_metadata(context, Base.metadata)

    async def check():
        engine = create_engine(url)
        try:
            async with engine.connect() as connection:
                return await connection.run_sync(compare)
        finally:
            await engine.dispose()

    return asyncio.run(check())


def plain(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


def test_schema_sql_builds_the_same_tables_as_the_migrations(migrated):
    """db/schema.sql applied directly must equal 0001 + 0002 (both are compared to the ORM)."""
    fresh = f"aura_schema_{uuid.uuid4().hex[:8]}"
    fresh_url = make_url(URL).set(database=fresh).render_as_string(hide_password=False)

    async def create():
        admin = await asyncpg.connect(plain(URL))
        try:
            await admin.execute(f'CREATE DATABASE "{fresh}"')
        except asyncpg.InsufficientPrivilegeError:
            pytest.skip("test user cannot create databases")
        finally:
            await admin.close()
        connection = await asyncpg.connect(plain(fresh_url))
        try:
            await connection.execute((API_DIR / "db" / "schema.sql").read_text(encoding="utf-8"))
        finally:
            await connection.close()

    async def drop():
        admin = await asyncpg.connect(plain(URL))
        try:
            await admin.execute(f'DROP DATABASE IF EXISTS "{fresh}"')
        finally:
            await admin.close()

    asyncio.run(create())
    try:
        assert orm_differences(fresh_url) == []
        assert orm_differences(URL) == []
    finally:
        asyncio.run(drop())


def test_0002_downgrades_and_upgrades_cleanly(migrated):
    async def tables():
        engine = create_engine(URL)
        try:
            async with engine.connect() as connection:
                names = await connection.scalars(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_name = ANY(:n)"
                    ),
                    {"n": ["refresh_tokens", "auth_token_families"]},
                )
                column = await connection.scalar(
                    text(
                        "SELECT count(*) FROM information_schema.columns "
                        "WHERE table_name = 'users' AND column_name = 'is_active'"
                    )
                )
                return set(names), column
        finally:
            await engine.dispose()

    config = alembic_config()
    command.downgrade(config, "0001")
    assert asyncio.run(tables()) == (set(), 0)
    command.upgrade(config, "head")
    assert asyncio.run(tables()) == ({"refresh_tokens", "auth_token_families"}, 1)


def test_refresh_token_constraints(migrated):
    now = datetime.now(UTC)

    def token(user_id, family_id, **values) -> RefreshToken:
        fields = dict(
            user_id=user_id,
            family_id=family_id,
            token_hash=uuid.uuid4().hex + uuid.uuid4().hex,
            expires_at=now + timedelta(days=7),
            access_jti=uuid.uuid4(),
            access_expires_at=now + timedelta(minutes=15),
        )
        fields.update(values)
        return RefreshToken(**fields)

    async def rejected(sessionmaker, *rows) -> bool:
        try:
            async with sessionmaker() as session, session.begin():
                session.add_all(rows)
        except IntegrityError:
            return True
        return False

    async def scenario():
        engine = create_engine(URL)
        try:
            sessionmaker = create_sessionmaker(engine)
            async with sessionmaker() as session, session.begin():
                user = User(email=f"{uuid.uuid4().hex}@aura.com", name="회원", password_hash="x")
                session.add(user)
                await session.flush()
                family = AuthTokenFamily(user_id=user.id)
                session.add(family)
                await session.flush()
                first = token(user.id, family.id)
                session.add(first)
            results = {
                "active": user.is_active,
                "second_active": await rejected(sessionmaker, token(user.id, family.id)),
                "bad_hash": await rejected(
                    sessionmaker, token(user.id, family.id, token_hash="NOT-HEX", consumed_at=now)
                ),
                "other_user": await rejected(
                    sessionmaker, token(uuid.uuid4(), family.id, consumed_at=now)
                ),
            }
            async with sessionmaker() as session, session.begin():
                await session.execute(
                    RefreshToken.__table__.update()
                    .where(RefreshToken.id == first.id)
                    .values(consumed_at=now)
                )
                session.add(token(user.id, family.id))  # rotation: one usable again
            async with sessionmaker() as session, session.begin():
                await session.delete(await session.get(User, user.id))
            async with sessionmaker() as session:
                results["left"] = await session.scalar(
                    select(func.count())
                    .select_from(RefreshToken)
                    .where(RefreshToken.user_id == user.id)
                )
            return results
        finally:
            await engine.dispose()

    results = asyncio.run(scenario())
    assert results == {
        "active": True,
        "second_active": True,
        "bad_hash": True,
        "other_user": True,
        "left": 0,
    }
