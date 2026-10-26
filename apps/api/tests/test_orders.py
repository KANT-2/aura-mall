"""Order routes without a database: both need a signed-in member."""

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


@pytest.mark.parametrize(
    ("method", "message"),
    [("get", "로그인이 필요해요."), ("post", "로그인 후 주문할 수 있어요.")],
)
def test_orders_need_a_member(client, method, message):
    kwargs = {"json": {"items": []}} if method == "post" else {}
    response = getattr(client, method)("/api/v1/orders", **kwargs)

    assert response.status_code == 401
    assert response.json() == {"error": {"code": "LOGIN_REQUIRED", "message": message}}
