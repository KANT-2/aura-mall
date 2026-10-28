"""Recipe routes without a database: who may call them, before any data is touched."""

import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
from aura_api.infra.database import get_session
from aura_api.main import create_app

ORIGIN = "http://localhost:3000"


@pytest.fixture
def client():
    async def no_session():
        yield None

    app = create_app(Settings(_env_file=None, csrf_allowed_origins=[ORIGIN]))
    app.dependency_overrides[get_session] = no_session
    with TestClient(app, headers={"Origin": ORIGIN}) as client:
        yield client


def test_visitor_without_token_sees_no_recipes(client):
    response = client.get("/api/v1/recipes")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize(
    ("method", "path", "message"),
    [
        ("post", "/api/v1/recipes", "로그인 후 향을 저장할 수 있어요."),
        ("delete", "/api/v1/recipes/00000000-0000-0000-0000-000000000000", "로그인이 필요해요."),
    ],
)
def test_changes_need_a_member(client, method, path, message):
    kwargs = {"json": {"name": "느린 오후", "counts": {"bergamot": 3}}} if method == "post" else {}
    response = getattr(client, method)(path, **kwargs)

    assert response.status_code == 401
    assert response.json() == {"error": {"code": "LOGIN_REQUIRED", "message": message}}


def test_invalid_token_is_401_even_for_listing(client):
    response = client.get("/api/v1/recipes", headers={"Authorization": "Bearer not.a.jwt"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
