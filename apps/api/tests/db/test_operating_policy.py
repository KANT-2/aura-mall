"""Confirmed operating policies on a disposable PostgreSQL database."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update
from test_admin_api import URL, db, new_customer
from test_admin_api import client as client
from test_order_cancellation import cancel, order
from test_payments_api import confirm, order_status, start
from test_payments_api import pg as pg

from aura_api.config import Settings
from aura_api.infra.models import Order
from aura_api.infra.repositories import admin as admin_repository
from aura_api.services import orders as order_service

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ITEMS = [{"productId": "fresh-hand-cream", "quantity": 1}]


def test_expiry_boundary_at_exactly_ten_minutes(client, pg, monkeypatch):
    now = datetime.now(UTC)
    ids = [uuid.UUID(order(client, new_customer(), items=ITEMS)["id"]) for _ in range(3)]

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now

    monkeypatch.setattr(order_service, "datetime", Clock)

    async def run(maker):
        async with maker() as session:
            async with session.begin():
                for target, seconds in zip(ids, (599, 600, 601), strict=True):
                    await session.execute(
                        update(Order)
                        .where(Order.id == target)
                        .values(created_at=now - timedelta(seconds=seconds))
                    )
            ttl = timedelta(minutes=Settings(_env_file=None).unpaid_order_ttl_minutes)
            assert ttl == timedelta(minutes=10)
            dry = await order_service.expire_unpaid_orders(session, older_than=ttl)
            result = await order_service.expire_unpaid_orders(session, older_than=ttl, execute=True)
            assert dry == result

    db(run)
    assert [order_status(target) for target in ids] == ["received", "cancelled", "cancelled"]


def test_revenue_excludes_only_confirmed_cancel_and_preserves_order_counts(client, pg):
    member = new_customer()
    placed = order(client, member, items=ITEMS)
    payment = start(client, member, placed["id"]).json()
    assert confirm(client, member, payment).status_code == 200
    key = "pk_" + uuid.UUID(payment["id"]).hex

    async def counts(maker):
        async with maker() as session:
            return await admin_repository.overview_counts(
                session, datetime.now(UTC) - timedelta(days=1)
            )

    before = db(counts)
    pg.refund_behavior[key] = "down"
    assert cancel(client, member, placed["id"]).status_code == 202
    pending = db(counts)
    assert pending.recent_revenue == before.recent_revenue
    pg.refund_behavior[key] = "refund"
    assert cancel(client, member, placed["id"]).status_code == 200
    after = db(counts)
    assert after.recent_revenue == before.recent_revenue - placed["total"]
    assert (after.orders, after.recent_orders) == (before.orders, before.recent_orders)
    assert cancel(client, member, placed["id"]).status_code == 200
    assert db(counts).recent_revenue == after.recent_revenue
