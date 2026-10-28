"""Ordinary records remain editable and use normal inventory/cancellation rules."""

import asyncio

import pytest
from sqlalchemy import func, select
from test_admin_api import URL, admin_login, bearer, db, new_admin
from test_admin_api import client as client

from aura_api.infra.models import Payment, Product
from aura_api.infra.seed_records import MEMBER_EMAIL, record_id, seed

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")


def test_records_are_normal_idempotent_and_orders_reserve_stock(client):
    admin_login(client, new_admin()[1])

    async def state(factory):
        async with factory() as session:
            return (
                await session.scalar(select(func.sum(Product.stock))),
                await session.scalar(select(func.count()).select_from(Payment)),
            )

    before_stock, before_payments = db(state)
    first = asyncio.run(seed(URL, "ordinary-member-password-42", execute=True))
    assert first["users"] == 24 and first["recipes"] == 96
    assert first["product_questions"] == 120 and first["partner_inquiries"] == 30
    assert first["orders"] == 72
    assert db(state) == (before_stock - 18, before_payments)
    second = asyncio.run(seed(URL, "different-password-42", execute=True))
    assert all(value == 0 for value in second.values())
    assert db(state) == (before_stock - 18, before_payments)
    auth = bearer(record_id("member", 0))
    response = client.get("/api/v1/orders", headers=auth)
    assert response.status_code == 200
    assert {o["status"] for o in response.json()} == {"received", "cancelled"}
    assert all("isDemo" not in o for o in response.json())
    pending = next(o for o in response.json() if o["status"] == "received")
    assert client.post(f"/api/v1/orders/{pending['id']}/cancel", headers=auth).status_code == 200
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": MEMBER_EMAIL, "password": "ordinary-member-password-42"},
        ).status_code
        == 200
    )
