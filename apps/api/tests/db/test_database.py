"""Real PostgreSQL checks. Skipped unless AURA_TEST_DATABASE_URL points at a disposable DB.

The test database is wiped: every table is dropped and recreated by the migration.
    AURA_TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:55433/aura_test
"""

import asyncio
import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import (
    Base,
    Ingredient,
    Product,
    Recipe,
    RecipeIngredient,
    User,
)
from aura_api.infra.seed import load_seed

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")

API_DIR = Path(__file__).resolve().parents[2]
# Expression indexes (lower(email)) are not reflected by SQLAlchemy; checked with SQL below.
EXPRESSION_INDEXES = {"users_email_lower_key", "admins_email_lower_key"}


def alembic_config() -> Config:
    config = Config(str(API_DIR / "alembic.ini"))
    config.attributes["database_url"] = URL
    return config


@pytest.fixture(scope="module")
def migrated():
    config = alembic_config()
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    asyncio.run(load_seed(URL))
    yield
    command.downgrade(config, "base")


def run(coro_factory):
    async def wrapper():
        engine = create_engine(URL)
        try:
            return await coro_factory(engine)
        finally:
            await engine.dispose()

    return asyncio.run(wrapper())


def test_orm_models_match_migrated_schema(migrated):
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

    async def check(engine):
        async with engine.connect() as connection:
            return await connection.run_sync(compare)

    assert run(check) == []


def test_expression_indexes_exist(migrated):
    async def check(engine):
        async with engine.connect() as connection:
            rows = await connection.execute(
                text("SELECT indexname FROM pg_indexes WHERE indexname = ANY(:names)"),
                {"names": sorted(EXPRESSION_INDEXES)},
            )
            return {row.indexname for row in rows}

    assert run(check) == EXPRESSION_INDEXES


def test_seed_is_loaded_and_repeatable(migrated):
    asyncio.run(load_seed(URL))

    async def check(engine):
        async with create_sessionmaker(engine)() as session:
            products = await session.scalar(select(func.count()).select_from(Product))
            priced = await session.scalar(select(func.count(Product.price)))
            ingredients = await session.scalar(select(func.count()).select_from(Ingredient))
            hand_cream = await session.get(Product, "fresh-hand-cream")
            return products, priced, ingredients, hand_cream

    products, priced, ingredients, hand_cream = run(check)
    assert (products, priced, ingredients) == (30, 27, 24)
    assert (hand_cream.price, hand_cream.collection_id, hand_cream.type_id) == (
        28_000,
        "fresh",
        "hand-cream",
    )


def test_orm_round_trip_and_constraints(migrated):
    email = f"kim-{uuid.uuid4().hex[:8]}@aura.com"

    async def scenario(engine):
        sessionmaker = create_sessionmaker(engine)
        async with sessionmaker() as session, session.begin():
            user = User(email=email, name="김철수", password_hash="hash")
            session.add(user)
            await session.flush()
            recipe = Recipe(
                user_id=user.id, version=1, name="느린 오후", label="classic", color="#a5ad68"
            )
            session.add(recipe)
            await session.flush()
            session.add(RecipeIngredient(recipe_id=recipe.id, ingredient_id="bergamot", count=3))
        async with sessionmaker() as session:
            saved = await session.scalar(select(Recipe).where(Recipe.user_id == user.id))
            drops = await session.scalar(
                select(RecipeIngredient.count).where(RecipeIngredient.recipe_id == saved.id)
            )
        duplicate_rejected = False
        try:
            async with sessionmaker() as session, session.begin():
                session.add(User(email=email.upper(), name="중복", password_hash="hash"))
        except IntegrityError:
            duplicate_rejected = True
        async with sessionmaker() as session, session.begin():
            moved = await session.execute(
                text("UPDATE products SET stock = stock - 16 WHERE id = :id AND stock >= 16"),
                {"id": "soft-candle"},
            )
        return saved, drops, duplicate_rejected, moved.rowcount

    saved, drops, duplicate_rejected, moved = run(scenario)
    assert (saved.version, saved.label, drops) == (1, "classic", 3)
    assert saved.created_at is not None and isinstance(saved.id, uuid.UUID)
    assert duplicate_rejected
    assert moved == 0  # conditional decrement never oversells (stock is 15)
