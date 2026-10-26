"""GET /catalog against the migrated, seeded database must equal the Mock's catalog.json."""

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
from aura_api.main import create_app

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")

APPS_DIR = Path(__file__).resolve().parents[3]
FIXTURE = APPS_DIR / "web" / "mock-server" / "fixtures" / "catalog.json"


@pytest.fixture(scope="module")
def client(migrated):
    with TestClient(create_app(Settings(_env_file=None, database_url=URL))) as client:
        yield client


def test_catalog_equals_mock_fixture(client):
    response = client.get("/api/v1/catalog")

    assert response.status_code == 200
    assert response.json() == json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_product_lookup_matches_catalog_entry(client):
    expected = next(
        item
        for item in json.loads(FIXTURE.read_text(encoding="utf-8"))["products"]
        if item["id"] == "warm-eau-de-parfum"
    )

    assert client.get("/api/v1/catalog/products/warm-eau-de-parfum").json() == expected
    assert client.get("/api/v1/catalog/products/amber-dusk").json() == expected
    assert client.get("/api/v1/catalog/products/nope").status_code == 404
