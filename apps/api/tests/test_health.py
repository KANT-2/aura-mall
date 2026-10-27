import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from aura_api.config import Settings
from aura_api.main import create_app


@pytest.fixture
def client():
    settings = Settings(_env_file=None, app_name="AURA test API", api_prefix="/api/v1")
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.mark.parametrize("path", ["/health", "/api/v1/health"])
def test_health(client, path):
    response = client.get(path)

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_exposes_versioned_routes(client):
    schema = client.get("/openapi.json").json()

    assert schema["info"]["title"] == "AURA test API"
    assert set(schema["paths"]) == {
        "/api/v1/health",
        "/api/v1/catalog",
        "/api/v1/catalog/products/{product_id}",
        "/api/v1/partner",
        "/api/v1/recipes",
        "/api/v1/recipes/{recipe_id}",
        "/api/v1/orders",
        "/api/v1/admin/overview",
        "/api/v1/admin/products",
        "/api/v1/admin/products/{product_id}",
        "/api/v1/admin/products/{product_id}/stock-adjustments",
        "/api/v1/admin/orders",
        "/api/v1/admin/orders/{order_id}",
        "/api/v1/admin/inquiries",
        "/api/v1/admin/inquiries/{inquiry_id}",
    }


def test_api_prefix_is_configurable():
    settings = Settings(_env_file=None, api_prefix="/api/v2")
    with TestClient(create_app(settings)) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/v2/health").status_code == 200
        assert client.get("/api/v1/health").status_code == 404


def test_routes_do_not_redirect(client):
    assert client.get("/api/v1/health/", follow_redirects=False).status_code == 404


@pytest.mark.parametrize("prefix", ["api/v1", "/api/v1/", "//api", "/api?query=1"])
def test_invalid_prefix_is_rejected(prefix):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, api_prefix=prefix)
