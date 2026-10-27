"""Personal E2E (심우섭): one member and one admin go through the whole backend on a real DB.

API → services → domain rules → PostgreSQL → API, with the production JWT login (#42),
revocation store and admin login. No repository, store or dependency is replaced.

    catalog → member login → save recipe → order (product + custom, coupon) → order history
    → first admin (CLI) → admin login → admin order list/detail/overview → DB stock & coupon
    → both log out and their tokens stop working
"""

import asyncio
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from aura_api.config import Settings
from aura_api.identity.service import PASSWORD_HASHER
from aura_api.infra.create_admin import create_first_admin
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import Product, User, UserCoupon
from aura_api.main import create_app

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ORIGIN = "http://localhost:3000"
MEMBER_PASSWORD = "member-password-1"
ADMIN_PASSWORD = "admin-password-1"


def db(work):
    async def run():
        engine = create_engine(URL)
        try:
            return await work(create_sessionmaker(engine))
        finally:
            await engine.dispose()

    return asyncio.run(run())


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def client(migrated):
    settings = Settings(
        _env_file=None,
        database_url=URL,
        csrf_allowed_origins=[ORIGIN],
        jwt_algorithm="HS256",
        jwt_signing_key="e" * 48,
        jwt_issuer="aura",
        jwt_audience="web",
    )
    with TestClient(create_app(settings), headers={"Origin": ORIGIN}) as client:
        yield client


def test_member_order_reaches_the_admin_screens(client):
    # A member with the new-member free-shipping coupon (registration API is not built yet).
    email = f"{uuid.uuid4().hex}@aura.com"

    async def seed_member(sessionmaker):
        async with sessionmaker() as session, session.begin():
            user = User(
                email=email, name="김여정", password_hash=PASSWORD_HASHER.hash(MEMBER_PASSWORD)
            )
            session.add(user)
            await session.flush()
            session.add(UserCoupon(user_id=user.id, type="FREE_SHIPPING"))
            stock = await session.scalar(
                select(Product.stock).where(Product.id == "soft-hand-cream")
            )
            return user.id, stock

    member_id, stock_before = db(seed_member)

    # 1. Catalog: the product the member will buy, as the shop page shows it.
    catalog = client.get("/api/v1/catalog").json()
    cream = next(item for item in catalog["products"] if item["id"] == "soft-hand-cream")
    assert cream["price"] == 28_000

    # 2. Member login with the production JWT lifecycle (#42).
    login = client.post("/api/v1/auth/login", json={"email": email, "password": MEMBER_PASSWORD})
    assert login.status_code == 200
    member = bearer(login.json()["accessToken"])

    # 3. Save a recipe in the atelier and see it in "my recipes".
    recipe = client.post(
        "/api/v1/recipes",
        json={"name": "비 오는 오후", "label": "paper", "counts": {"rose": 3, "bergamot": 2}},
        headers=member,
    )
    assert recipe.status_code == 201
    assert [item["id"] for item in client.get("/api/v1/recipes", headers=member).json()] == [
        recipe.json()["id"]
    ]

    # 4. Order the hand cream and the saved composition, using the coupon.
    order = client.post(
        "/api/v1/orders",
        json={
            "recipient": "김여정",
            "address": "서울시 성동구 1",
            "coupon": True,
            "items": [
                {"productId": "soft-hand-cream", "quantity": 1, "price": 1},
                {
                    "custom": {
                        "name": recipe.json()["name"],
                        "label": recipe.json()["label"],
                        "counts": recipe.json()["counts"],
                    },
                    "quantity": 1,
                },
            ],
        },
        headers=member,
    )
    assert order.status_code == 201
    placed = order.json()
    assert placed["total"] == 28_000 + 98_000  # server prices; free shipping (coupon and ≥ 50,000)
    assert client.get("/api/v1/orders", headers=member).json()[0]["id"] == placed["id"]

    # 5. The first admin is created with the CLI and signs in.
    asyncio.run(create_first_admin(URL, "ops@aura.com", "운영자", ADMIN_PASSWORD))
    admin_login = client.post(
        "/api/v1/admin/auth/login", json={"email": "ops@aura.com", "password": ADMIN_PASSWORD}
    )
    assert admin_login.status_code == 200
    admin = bearer(admin_login.json()["accessToken"])

    # 6. The order shows up on the admin screens with the customer and the composition.
    listed = client.get("/api/v1/admin/orders", headers=admin).json()
    summary = next(item for item in listed["items"] if item["id"] == placed["id"])
    assert summary["customer"] == {"id": str(member_id), "name": "김여정", "email": email}
    assert summary["title"].endswith(" 외 1건") and summary["itemCount"] == 2
    detail = client.get(f"/api/v1/admin/orders/{placed['id']}", headers=admin).json()
    assert [item["option"] for item in detail["items"]] == [None, "맞춤 조향 · paper"]
    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert placed["id"] in [item["id"] for item in overview["recentOrders"]]

    # 7. The database agrees: stock went down once and the coupon is used by this order.
    async def check(sessionmaker):
        async with sessionmaker() as session:
            stock = await session.scalar(
                select(Product.stock).where(Product.id == "soft-hand-cream")
            )
            coupon = await session.scalar(select(UserCoupon).where(UserCoupon.user_id == member_id))
            return stock, coupon

    stock_after, coupon = db(check)
    assert stock_after == stock_before - 1
    assert (coupon.status, str(coupon.used_order_id)) == ("USED", placed["id"])

    # 8. Each side stays on its own side, and logging out ends the session.
    assert client.get("/api/v1/admin/overview", headers=member).status_code == 403
    assert client.get("/api/v1/orders", headers=admin).status_code == 401
    assert client.post("/api/v1/auth/logout", headers=member).status_code == 204
    assert client.get("/api/v1/recipes", headers=member).status_code == 401
    assert client.post("/api/v1/admin/auth/logout", headers=admin).status_code == 204
    assert client.get("/api/v1/admin/session", headers=admin).status_code == 401
