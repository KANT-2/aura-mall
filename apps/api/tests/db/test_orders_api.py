"""Order routes against PostgreSQL with real signed JWTs (revocation lookup stubbed)."""

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
from aura_api.domain.errors import Conflict, InvalidInput
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import Order, Product, User, UserCoupon
from aura_api.main import create_app
from aura_api.services import orders as service

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ORIGIN = "http://localhost:3000"
KEY = "o" * 48
ADDRESS = {"recipient": "김철수", "address": "서울시 중구 1"}


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


def create_member(coupon: bool = False) -> uuid.UUID:
    async def insert(sessionmaker):
        async with sessionmaker() as session, session.begin():
            user = User(email=f"{uuid.uuid4().hex}@aura.com", name="회원", password_hash="x")
            session.add(user)
            await session.flush()
            if coupon:
                session.add(UserCoupon(user_id=user.id, type="FREE_SHIPPING"))
            return user.id

    return db(insert)


def stock_of(product_id: str) -> int:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            return await session.scalar(select(Product.stock).where(Product.id == product_id))

    return db(read)


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


def test_product_order_is_priced_by_the_server_and_takes_stock(client):
    member = bearer(create_member())
    before = stock_of("fresh-hand-cream")
    response = client.post(
        "/api/v1/orders",
        json={
            **ADDRESS,
            "items": [
                # Client price, product object and total are ignored.
                {"productId": "fresh-hand-cream", "quantity": 1, "price": 1, "unitPrice": 1},
                {"productId": "fresh-hand-cream", "quantity": 1},
            ],
            "total": 10,
        },
        headers=member,
    )

    assert response.status_code == 201
    order = response.json()
    [item] = order["items"]  # same line merged
    assert (item["quantity"], item["unitPrice"], item["selection"]) == (2, 28_000, [])
    assert item["key"] == "fresh-hand-cream:" and "custom" not in item
    assert item["product"]["id"] == "fresh-hand-cream" and item["product"]["price"] == 28_000
    assert order["total"] == 56_000 + 0  # 50,000원 이상 무료 배송
    assert (order["recipient"], order["address"]) == ("김철수", "서울시 중구 1")
    assert stock_of("fresh-hand-cream") == before - 2

    listed = client.get("/api/v1/orders", headers=member).json()
    assert listed == [order]


def test_gift_set_and_custom_lines(client):
    member = bearer(create_member())
    selection = ["soft-candle", "soft-hand-cream", "soft-diffuser"]
    before = {product_id: stock_of(product_id) for product_id in [*selection, "soft-gift-set"]}
    response = client.post(
        "/api/v1/orders",
        json={
            **ADDRESS,
            "items": [
                {"productId": "soft-gift-set", "quantity": 1, "selection": selection},
                {
                    "custom": {
                        "name": "느린 오후",
                        "label": "paper",
                        "color": "#000000",
                        "counts": {"bergamot": 3, "rose": 2},
                    },
                    "quantity": 1,
                },
            ],
        },
        headers=member,
    )

    assert response.status_code == 201
    gift, custom = response.json()["items"]
    assert gift["unitPrice"] == 62_000 + 28_000 + 68_000
    assert gift["selection"] == sorted(selection)
    assert custom["unitPrice"] == 98_000  # first eau de parfum
    assert custom["product"]["id"] == "custom-atelier"
    assert custom["custom"]["name"] == "느린 오후" and custom["custom"]["color"] != "#000000"
    assert custom["custom"]["productType"] == "eau-de-parfum"
    for product_id, stock in before.items():
        assert stock_of(product_id) == stock - 1  # contents and the set itself
    assert client.get("/api/v1/orders", headers=member).json()[0]["items"][0] == gift


def test_coupon_makes_shipping_free_once(client):
    member_id = create_member(coupon=True)
    small = {**ADDRESS, "coupon": True, "items": [{"productId": "warm-hand-cream", "quantity": 1}]}

    first = client.post("/api/v1/orders", json=small, headers=bearer(member_id))
    second = client.post("/api/v1/orders", json=small, headers=bearer(member_id))
    without = client.post(
        "/api/v1/orders", json={**small, "coupon": False}, headers=bearer(member_id)
    )

    assert first.status_code == 201 and first.json()["total"] == 28_000
    assert second.status_code == 400
    assert second.json()["error"] == {
        "code": "COUPON_UNAVAILABLE",
        "message": "사용할 수 없는 쿠폰이에요.",
    }
    assert without.json()["total"] == 28_000 + 3_000

    async def coupon_row(sessionmaker):
        async with sessionmaker() as session:
            return await session.scalar(select(UserCoupon).where(UserCoupon.user_id == member_id))

    coupon = db(coupon_row)
    assert coupon.status == "USED" and str(coupon.used_order_id) == first.json()["id"]


@pytest.mark.parametrize(
    ("items", "code"),
    [
        ([], "ITEMS_REQUIRED"),
        ([{"productId": "warm-candle", "quantity": 16}], "QUANTITY_INVALID"),
        (
            [{"productId": "warm-gift-set", "quantity": 1, "selection": ["warm-candle"]}],
            "GIFT_SET_INVALID",
        ),
        ([{"productId": "no-such-product", "quantity": 1}], "PRODUCT_UNAVAILABLE"),
        ([{"productId": "warm-candle", "quantity": 1, "custom": {"name": "x"}}], "ITEM_INVALID"),
    ],
)
def test_invalid_orders_change_nothing(client, items, code):
    member = bearer(create_member())
    before = stock_of("warm-candle")

    response = client.post("/api/v1/orders", json={**ADDRESS, "items": items}, headers=member)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == code
    assert stock_of("warm-candle") == before
    assert client.get("/api/v1/orders", headers=member).json() == []


def test_more_than_stock_is_rejected(client):
    set_stock("warm-hair-mist", 2)
    response = client.post(
        "/api/v1/orders",
        json={**ADDRESS, "items": [{"productId": "warm-hair-mist", "quantity": 3}]},
        headers=bearer(create_member()),
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "상품 재고를 확인해 주세요."
    assert stock_of("warm-hair-mist") == 2


def test_orders_are_private_and_need_a_member(client):
    owner = bearer(create_member())
    client.post(
        "/api/v1/orders",
        json={**ADDRESS, "items": [{"productId": "fresh-candle", "quantity": 1}]},
        headers=owner,
    )

    assert client.get("/api/v1/orders", headers=bearer(create_member())).json() == []
    visitor = bearer(uuid.uuid4())
    assert client.get("/api/v1/orders", headers=visitor).status_code == 401
    rejected = client.post(
        "/api/v1/orders",
        json={**ADDRESS, "items": [{"productId": "fresh-candle", "quantity": 1}]},
        headers=visitor,
    )
    assert rejected.status_code == 401
    assert rejected.json()["error"]["message"] == "로그인 후 주문할 수 있어요."


def test_last_item_goes_to_exactly_one_of_two_simultaneous_orders(migrated, monkeypatch):
    set_stock("warm-diffuser", 1)
    buyers = [create_member(), create_member()]
    body = {**ADDRESS, "items": [{"productId": "warm-diffuser", "quantity": 1}]}

    async def race(sessionmaker):
        # Both requests must see the last item before racing the conditional stock UPDATE.
        # Otherwise the second may legitimately fail earlier with PRODUCT_UNAVAILABLE.
        barrier = asyncio.Barrier(2)
        original = service.repository.take_stock

        async def take_stock(*args, **kwargs):
            await asyncio.wait_for(barrier.wait(), timeout=10)
            return await original(*args, **kwargs)

        monkeypatch.setattr(service.repository, "take_stock", take_stock)

        async def buy(member_id):
            async with sessionmaker() as session:
                try:
                    await service.place_order(session, member_id, body)
                    return "ok"
                except (Conflict, InvalidInput) as error:
                    return error.code

        return await asyncio.gather(*(buy(member_id) for member_id in buyers))

    results = db(race)

    async def orders_for_buyers(sessionmaker):
        async with sessionmaker() as session:
            return len(list(await session.scalars(select(Order).where(Order.user_id.in_(buyers)))))

    assert sorted(results) == ["OUT_OF_STOCK", "ok"]
    assert stock_of("warm-diffuser") == 0
    assert db(orders_for_buyers) == 1


def test_same_idempotency_key_returns_the_first_order_once(client):
    member_id = create_member()
    before = stock_of("fresh-perfume-oil")
    body = {**ADDRESS, "items": [{"productId": "fresh-perfume-oil", "quantity": 1}]}
    key = {"Idempotency-Key": "order-key-0001"}

    first = client.post("/api/v1/orders", json=body, headers={**bearer(member_id), **key})
    again = client.post("/api/v1/orders", json=body, headers={**bearer(member_id), **key})
    other_member = client.post(
        "/api/v1/orders", json=body, headers={**bearer(create_member()), **key}
    )
    bad = client.post(
        "/api/v1/orders", json=body, headers={**bearer(member_id), "Idempotency-Key": "short"}
    )

    assert first.status_code == 201 and again.status_code == 200
    assert again.json() == first.json()
    assert other_member.status_code == 201  # keys are per member
    assert other_member.json()["id"] != first.json()["id"]
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "IDEMPOTENCY_KEY_INVALID"
    assert stock_of("fresh-perfume-oil") == before - 2  # once per member, not per request
    assert len(client.get("/api/v1/orders", headers=bearer(member_id)).json()) == 1


def test_simultaneous_resends_create_one_order(migrated):
    member_id = create_member()
    body = {**ADDRESS, "items": [{"productId": "soft-body-lotion", "quantity": 1}]}

    async def resend(sessionmaker):
        async def place():
            async with sessionmaker() as session:
                order, created = await service.place_order(
                    session, member_id, body, "order-key-race"
                )
                return order.id, created

        return await asyncio.gather(place(), place())

    (first_id, first_new), (second_id, second_new) = db(resend)

    async def count(sessionmaker):
        async with sessionmaker() as session:
            return len(list(await session.scalars(select(Order).where(Order.user_id == member_id))))

    assert first_id == second_id
    assert sorted([first_new, second_new]) == [False, True]
    assert db(count) == 1
