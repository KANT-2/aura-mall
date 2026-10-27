"""Shared fixtures for real PostgreSQL tests (skipped unless AURA_TEST_DATABASE_URL is set).

The test database is wiped: every table is dropped and recreated by the migration.
"""

import asyncio
import os
import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from aura_api.infra.seed import load_seed

URL = os.environ.get("AURA_TEST_DATABASE_URL")

if sys.platform == "win32":
    # psycopg (JWT auth storage) cannot run async on the default Proactor loop on Windows.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
API_DIR = Path(__file__).resolve().parents[2]


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
