"""QA regressions: disposable PostgreSQL and a fake PG, never the real PG."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from test_admin_api import URL, db, new_customer
from test_admin_api import client as client
from test_order_cancellation import age, order
from test_payments_api import confirm, order_status, payment_row, start
from test_payments_api import pg as pg

from aura_api.services import orders as order_service
from aura_api.services import payments as payment_service

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")


def test_expiry_limit_is_not_consumed_by_unknown_payments(client, pg):
    owner = new_customer()
    blocked = order(client, owner, items=[{"productId": "fresh-hand-cream", "quantity": 1}])
    payment = start(client, owner, blocked["id"]).json()
    pg.behavior["pk_" + uuid.UUID(payment["id"]).hex] = "down"
    assert confirm(client, owner, payment).status_code == 202
    eligible = order(
        client, new_customer(), items=[{"productId": "fresh-hand-cream", "quantity": 1}]
    )
    age(blocked["id"], hours=100)
    age(eligible["id"], hours=99)

    async def expire(sessionmaker, execute):
        async with sessionmaker() as session:
            return await order_service.expire_unpaid_orders(
                session, older_than=timedelta(minutes=10), limit=1, execute=execute
            )

    dry = db(lambda maker: expire(maker, False))
    result = db(lambda maker: expire(maker, True))
    assert dry == result == {"due": 1, "cancelled": 1, "skipped": 0}
    assert order_status(uuid.UUID(eligible["id"])) == "cancelled"
    assert order_status(uuid.UUID(blocked["id"])) == "received"
    assert payment_row(payment["id"]).status == "IN_PROGRESS"


def test_reconciliation_continues_after_one_database_write_error(client, pg, monkeypatch):
    attempts = []
    for _ in range(2):
        owner = new_customer()
        placed = order(client, owner, items=[{"productId": "fresh-hand-cream", "quantity": 1}])
        payment = start(client, owner, placed["id"]).json()
        key = "pk_" + uuid.UUID(payment["id"]).hex
        pg.behavior[key] = "down"
        assert confirm(client, owner, payment).status_code == 202
        pg.behavior[key] = "approve"
        attempts.append(payment)
    failed_id = uuid.UUID(attempts[0]["id"])
    original = payment_service.record_result

    async def broken(session, payment_id, result):
        if payment_id == failed_id:
            # Fail inside a transaction so rollback is needed before the next item.
            async with session.begin():
                await session.execute(text("SELECT 1"))
                raise OperationalError("UPDATE payments", {}, Exception("private-db-detail"))
        return await original(session, payment_id, result)

    monkeypatch.setattr(payment_service, "record_result", broken)

    async def reconcile(maker):
        async with maker() as session:
            return await payment_service.reconcile_payments(session, pg, older_than=timedelta(0))

    counts = db(reconcile)
    assert counts["pending"] >= 1 and counts["done"] >= 1
    assert payment_row(attempts[0]["id"]).status == "IN_PROGRESS"
    assert payment_row(attempts[1]["id"]).status == "DONE"
