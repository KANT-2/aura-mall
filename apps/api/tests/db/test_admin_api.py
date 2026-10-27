"""Admin routes against PostgreSQL with real signed JWTs (revocation lookup stubbed)."""

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from aura_api.config import Settings
from aura_api.core.revocation import get_token_revocation_store
from aura_api.identity.service import PASSWORD_HASHER
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import Admin, Product, StockAdjustment, User
from aura_api.main import create_app
from aura_api.services import orders as order_service
from aura_api.services import partner as partner_service

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ORIGIN = "http://localhost:3000"
KEY = "a" * 48


class NothingRevoked:
    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        return False


def bearer(subject: uuid.UUID) -> dict[str, str]:
    now = datetime.now(UTC)
    claims = {
        "sub": str(subject),
        "jti": str(uuid.uuid4()),
        "iss": "aura",
        "aud": "web",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    return {"Authorization": f"Bearer {jwt.encode(claims, KEY, algorithm='HS256')}"}


def db(work):
    async def run():
        engine = create_engine(URL)
        try:
            return await work(create_sessionmaker(engine))
        finally:
            await engine.dispose()

    return asyncio.run(run())


def insert(row):
    async def write(sessionmaker):
        async with sessionmaker() as session, session.begin():
            session.add(row)
            await session.flush()
            return row.id

    return db(write)


ADMIN_PASSWORD = "admin-password-1"
ADMIN_HASH = PASSWORD_HASHER.hash(ADMIN_PASSWORD)


def new_admin(status: str = "active") -> tuple[uuid.UUID, str]:
    email = f"{uuid.uuid4().hex}@aura.com"
    admin_id = insert(Admin(email=email, name="운영자", password_hash=ADMIN_HASH, status=status))
    return admin_id, email


def admin_login(client, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/admin/auth/login", json={"email": email, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def new_customer() -> uuid.UUID:
    return insert(User(email=f"{uuid.uuid4().hex}@aura.com", name="김고객", password_hash="x"))


def set_stock(product_id: str, stock: int) -> None:
    async def write(sessionmaker):
        async with sessionmaker() as session, session.begin():
            await session.execute(
                update(Product).where(Product.id == product_id).values(stock=stock)
            )

    db(write)


@pytest.fixture(scope="module")
def client(migrated):
    settings = Settings(
        _env_file=None,
        database_url=URL,
        csrf_allowed_origins=[ORIGIN],
        jwt_algorithm="HS256",
        jwt_signing_key=KEY,
        jwt_issuer="aura",
        jwt_audience="web",
    )
    app = create_app(settings)
    app.dependency_overrides[get_token_revocation_store] = NothingRevoked
    with TestClient(app, headers={"Origin": ORIGIN}) as client:
        yield client


@pytest.fixture(scope="module")
def admin(client):
    return admin_login(client, new_admin()[1])


def test_only_active_admins_get_in(client):
    assert client.get("/api/v1/admin/overview").status_code == 401
    customer = client.get("/api/v1/admin/overview", headers=bearer(new_customer()))
    assert customer.status_code == 403
    assert customer.json()["error"] == {
        "code": "ADMIN_REQUIRED",
        "message": "관리자 권한이 필요해요.",
    }
    assert (
        client.get("/api/v1/admin/overview", headers=bearer(new_admin("disabled")[0])).status_code
        == 401
    )
    assert client.get("/api/v1/admin/overview", headers=bearer(uuid.uuid4())).status_code == 401


def test_product_list_filters_and_pages(client, admin):
    first = client.get("/api/v1/admin/products", headers=admin).json()
    second = client.get("/api/v1/admin/products?page=2", headers=admin).json()

    assert (first["total"], first["page"], first["pageSize"], len(first["items"])) == (
        30,
        1,
        20,
        20,
    )
    assert len(second["items"]) == 10
    item = first["items"][0]
    assert {"version", "updated", "typeName", "englishName", "isNew"} <= set(item)
    assert "noteImages" not in item  # admin DTO is separate from the catalog DTO

    search = client.get("/api/v1/admin/products?q=CANDLE&collection=warm", headers=admin).json()
    assert [row["id"] for row in search["items"]] == ["warm-candle"]

    set_stock("soft-hair-mist", 0)
    out = client.get("/api/v1/admin/products?stock=out", headers=admin).json()
    assert "soft-hair-mist" in [row["id"] for row in out["items"]]


def test_product_edit_uses_version_and_records_history(client, admin):
    detail = client.get("/api/v1/admin/products/fresh-hair-mist", headers=admin).json()
    assert detail["history"] == [] and detail["image"] in detail["imageOptions"]

    edited = client.patch(
        "/api/v1/admin/products/fresh-hair-mist",
        json={"version": detail["version"], "name": " 새 헤어 미스트 ", "isNew": True},
        headers=admin,
    )
    assert edited.status_code == 200
    body = edited.json()
    assert (body["name"], body["isNew"], body["version"]) == (
        "새 헤어 미스트",
        True,
        detail["version"] + 1,
    )
    assert body["updated"] is not None
    [entry] = body["history"]
    assert (entry["action"], entry["actor"]) == ("product.update", "운영자")
    assert {change["field"] for change in entry["changes"]} == {"name", "isNew"}
    assert "reason" not in entry

    stale = client.patch(
        "/api/v1/admin/products/fresh-hair-mist",
        json={"version": detail["version"], "name": "늦은 수정"},
        headers=admin,
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "VERSION_CONFLICT"

    same = client.patch(
        "/api/v1/admin/products/fresh-hair-mist",
        json={"version": body["version"], "name": "새 헤어 미스트"},
        headers=admin,
    )
    assert same.json()["version"] == body["version"]  # nothing changed, no new version

    for change in ({"price": -1}, {"image": "/not/registered.webp"}, {"featured": "yes"}):
        bad = client.patch(
            "/api/v1/admin/products/fresh-hair-mist",
            json={"version": body["version"], **change},
            headers=admin,
        )
        assert bad.status_code == 400
    missing = client.get("/api/v1/admin/products/nope", headers=admin)
    assert missing.status_code == 404


def test_stock_adjustment_applies_once_per_key(client, admin):
    detail = client.get("/api/v1/admin/products/fresh-body-wash", headers=admin).json()
    request = {"version": detail["version"], "delta": 5, "reason": "입고", "key": "stock-key-0001"}

    first = client.post(
        "/api/v1/admin/products/fresh-body-wash/stock-adjustments", json=request, headers=admin
    )
    again = client.post(
        "/api/v1/admin/products/fresh-body-wash/stock-adjustments", json=request, headers=admin
    )
    reused = client.post(
        "/api/v1/admin/products/fresh-body-wash/stock-adjustments",
        json={**request, "delta": 6},
        headers=admin,
    )

    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["stock"] == again.json()["stock"] == detail["stock"] + 5
    assert first.json()["history"][0]["reason"] == "입고"
    assert reused.status_code == 409

    async def rows(sessionmaker):
        async with sessionmaker() as session:
            return list(
                await session.scalars(
                    select(StockAdjustment).where(StockAdjustment.request_key == "stock-key-0001")
                )
            )

    [row] = db(rows)
    assert (row.stock_before, row.stock_after, row.delta) == (
        detail["stock"],
        detail["stock"] + 5,
        5,
    )

    version = first.json()["version"]
    for body, status in [
        ({"version": version, "delta": -999, "reason": "파손", "key": "stock-key-0002"}, 400),
        ({"version": version, "delta": 0, "reason": "파손", "key": "stock-key-0003"}, 400),
        ({"version": version - 1, "delta": 1, "reason": "파손", "key": "stock-key-0004"}, 409),
        ({"version": version, "delta": 1, "reason": "", "key": "stock-key-0005"}, 400),
    ]:
        response = client.post(
            "/api/v1/admin/products/fresh-body-wash/stock-adjustments", json=body, headers=admin
        )
        assert response.status_code == status


def test_orders_show_customer_snapshot_and_options(client, admin):
    member = new_customer()

    async def place(sessionmaker):
        async with sessionmaker() as session:
            return await order_service.place_order(
                session,
                member,
                {
                    "recipient": "김철수",
                    "address": "서울시 중구 1",
                    "items": [
                        {
                            "productId": "warm-gift-set",
                            "quantity": 1,
                            "selection": ["warm-hand-cream", "warm-candle", "warm-diffuser"],
                        },
                        {"productId": "warm-body-wash", "quantity": 2},
                    ],
                },
            )

    order, _ = db(place)
    listed = client.get("/api/v1/admin/orders", headers=admin).json()
    summary = next(item for item in listed["items"] if item["id"] == str(order.id))
    assert summary["customer"]["name"] == "김고객"
    assert summary["title"].endswith(" 외 1건") and summary["itemCount"] == 3

    detail = client.get(f"/api/v1/admin/orders/{order.id}", headers=admin).json()
    gift, wash = detail["items"]
    names = {
        product["id"]: product["name"]
        for product in client.get("/api/v1/catalog").json()["products"]
    }
    chosen = sorted(["warm-hand-cream", "warm-candle", "warm-diffuser"])  # stored sorted
    assert gift["option"] == ", ".join(names[product_id] for product_id in chosen)
    assert gift["unitPrice"] == 28_000 + 62_000 + 68_000
    assert wash["option"] is None and wash["unitPrice"] == 36_000
    assert detail["address"] == "서울시 중구 1"

    future = client.get("/api/v1/admin/orders?from=2099-01-01", headers=admin).json()
    assert future["items"] == [] and future["total"] == 0
    assert client.get("/api/v1/admin/orders?from=2026-13-01", headers=admin).status_code == 400
    assert (
        client.get("/api/v1/admin/orders?from=2026-10-02&to=2026-10-01", headers=admin).status_code
        == 400
    )
    assert client.get(f"/api/v1/admin/orders/{uuid.uuid4()}", headers=admin).status_code == 404


def test_inquiry_handling_and_overview(client, admin):
    async def submit(sessionmaker):
        async with sessionmaker() as session:
            return await partner_service.submit_inquiry(
                session,
                {
                    "brand": "오브제",
                    "name": "김담당",
                    "email": "partner@brand.com",
                    "introduction": "소개",
                    "message": "문의",
                    "type": "향수",
                    "consent": "on",
                },
            )

    inquiry_id = db(submit)
    detail = client.get(f"/api/v1/admin/inquiries/{inquiry_id}", headers=admin).json()
    assert (detail["status"], detail["memo"], detail["website"], detail["version"]) == (
        "received",
        "",
        "",
        1,
    )

    handled = client.patch(
        f"/api/v1/admin/inquiries/{inquiry_id}",
        json={"version": 1, "status": "reviewing", "memo": " 샘플 요청 "},
        headers=admin,
    ).json()
    assert (handled["status"], handled["memo"], handled["version"]) == ("reviewing", "샘플 요청", 2)
    assert handled["updated"] is not None
    assert handled["history"][0]["action"] == "inquiry.update"

    for body, status in [
        ({"version": 1, "status": "done"}, 409),
        ({"version": 2, "status": "closed"}, 400),
        ({"version": 2, "memo": "가" * 2001}, 400),
    ]:
        response = client.patch(f"/api/v1/admin/inquiries/{inquiry_id}", json=body, headers=admin)
        assert response.status_code == status

    reviewing = client.get("/api/v1/admin/inquiries?status=reviewing", headers=admin).json()
    assert str(inquiry_id) in [item["id"] for item in reviewing["items"]]

    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert overview["products"]["total"] == 30
    assert overview["inquiries"]["reviewing"] >= 1
    assert overview["orders"]["recent"] >= 1 and overview["orders"]["recentRevenue"] > 0
    assert len(overview["recentOrders"]) <= 5 and len(overview["recentInquiries"]) <= 5
    stocks = [item["stock"] for item in overview["lowStockProducts"]]
    assert stocks == sorted(stocks) and all(stock <= 5 for stock in stocks)
