"""Presentation fixtures are idempotent and can never reach a PG or mutate real inventory."""

import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import DBAPIError
from test_admin_api import URL, admin_login, bearer, db, new_admin
from test_admin_api import client as client
from test_payments_api import pg as pg

from aura_api.infra.models import Order, Payment, Product
from aura_api.infra.seed_demo import DEMO_EMAIL, demo_id, seed
from aura_api.services.orders import expire_unpaid_orders
from aura_api.services.payments import reconcile_payments
from aura_api.services.refunds import reconcile_refunds

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")


def test_demo_seed_is_repeatable_and_guarded(client, pg):
    _, email = new_admin()
    admin = admin_login(client, email)

    async def stock(factory):
        async with factory() as session:
            return list(
                (
                    await session.execute(select(Product.id, Product.stock).order_by(Product.id))
                ).all()
            )

    before = db(stock)
    password = "demo-fixture-password-42"
    first = asyncio.run(seed(URL, password, execute=True))
    assert first["users"] == 24 and first["orders"] == 72
    assert first["recipes"] == 96 and first["partner_inquiries"] == 30
    assert first["product_questions"] == 120
    assert all(
        value == 0 for value in asyncio.run(seed(URL, "other-password-42", execute=True)).values()
    )
    assert db(stock) == before
    auth = bearer(demo_id("member", 0))
    orders = client.get("/api/v1/orders", headers=auth).json()
    assert {o["status"] for o in orders} == {
        "received",
        "paid",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
    }
    assert all(order["isDemo"] for order in orders)
    for order in orders:
        assert client.post(f"/api/v1/orders/{order['id']}/cancel", headers=auth).status_code == 409
        assert (
            client.post("/api/v1/payments", json={"orderId": order["id"]}, headers=auth).status_code
            == 409
        )
        assert (
            client.patch(
                f"/api/v1/admin/orders/{order['id']}/fulfillment",
                json={"expectedStatus": "paid", "status": "preparing", "reason": "test"},
                headers=admin,
            ).status_code
            == 409
        )

    async def payment_of(factory):
        async with factory() as session:
            return await session.scalar(
                select(Payment).where(Payment.order_id == demo_id("order", 0))
            )

    payment = db(payment_of)
    confirmation = client.post(
        "/api/v1/payments/confirm",
        json={
            "paymentKey": "demo-supplied",
            "orderId": payment.pg_order_id,
            "amount": payment.amount,
        },
        headers=auth,
    )
    assert confirmation.status_code == 409
    assert pg.calls == [] and pg.refund_calls == []

    async def maintenance(factory):
        async with factory() as session:
            a = await reconcile_payments(session, pg, older_than=timedelta(seconds=0))
            b = await reconcile_refunds(session, pg, older_than=timedelta(seconds=0))
            c = await expire_unpaid_orders(session, older_than=timedelta(seconds=0), execute=True)
            return a, b, c

    a, b, c = db(maintenance)
    assert a["checked"] == 0 and b["checked"] == 0 and c["due"] == 0
    assert pg.calls == [] and pg.refund_calls == []
    login = client.post("/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": password})
    assert login.status_code == 200
    assert db(stock) == before
    review = client.get("/api/v1/admin/payments/review", headers=admin).json()
    assert review["total"] > 0 and all(item["isDemo"] for item in review["items"])

    async def mutate_sample(factory):
        async with factory() as session, session.begin():
            await session.execute(
                update(Order).where(Order.id == demo_id("order", 0)).values(status="cancelled")
            )

    with pytest.raises(DBAPIError):
        db(mutate_sample)
    assert db(stock) == before

    forged = client.post(
        "/api/v1/orders",
        json={
            "recipient": "실제 주문",
            "address": "검증 주소",
            "isDemo": True,
            "items": [{"productId": "fresh-hand-cream", "quantity": 1}],
        },
        headers=auth,
    )
    assert forged.status_code == 201 and forged.json()["isDemo"] is False
