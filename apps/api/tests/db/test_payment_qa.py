"""QA regressions: disposable PostgreSQL and a fake PG, never the real PG."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession
from test_admin_api import URL, db, insert, new_customer
from test_admin_api import client as client
from test_order_cancellation import age, order
from test_payments_api import confirm, order_status, payment_row, start
from test_payments_api import pg as pg

from aura_api.core.revocation import get_token_revocation_store
from aura_api.identity.service import PASSWORD_HASHER
from aura_api.infra.models import Payment, User
from aura_api.infra.payment_gateway import TossPaymentsGateway
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


@pytest.mark.parametrize("phase", ["read", "write"])
def test_reconciliation_continues_after_one_database_error(client, pg, monkeypatch, phase):
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
    original_get = AsyncSession.get

    async def broken_get(session, model, identity, **kwargs):
        if phase == "read" and model is Payment and identity == failed_id:
            raise OperationalError("SELECT payments", {}, Exception("private-db-detail"))
        return await original_get(session, model, identity, **kwargs)

    async def broken(session, payment_id, result):
        if phase == "write" and payment_id == failed_id:
            # Fail inside a transaction so rollback is needed before the next item.
            async with session.begin():
                await session.execute(text("SELECT 1"))
                raise OperationalError("UPDATE payments", {}, Exception("private-db-detail"))
        return await original(session, payment_id, result)

    monkeypatch.setattr(payment_service, "record_result", broken)
    with monkeypatch.context() as patch:
        patch.setattr(AsyncSession, "get", broken_get)

        async def reconcile(maker):
            async with maker() as session:
                return await payment_service.reconcile_payments(
                    session, pg, older_than=timedelta(0)
                )

        counts = db(reconcile)
    assert counts["pending"] >= 1 and counts["done"] >= 1
    assert payment_row(attempts[0]["id"]).status == "IN_PROGRESS"
    assert payment_row(attempts[1]["id"]).status == "DONE"


def test_pg_authentication_error_keeps_attempt_open_and_blocks_new_payment(client, pg, caplog):
    owner = new_customer()
    placed = order(client, owner, items=[{"productId": "fresh-hand-cream", "quantity": 1}])
    payment = start(client, owner, placed["id"]).json()
    secret = "FAKE_SECRET_NOT_FOR_RESPONSE"
    gateway = TossPaymentsGateway(secret, "https://api.tosspayments.com", 1)

    async def auth_error(*args, **kwargs):
        return 401, {"code": "UNAUTHORIZED_KEY", "message": secret}

    gateway._call = auth_error
    client.app.state.payment_gateway = gateway
    response = confirm(client, owner, payment)
    assert response.status_code == 202 and response.json()["status"] == "IN_PROGRESS"
    assert secret not in response.text and secret not in caplog.text
    assert payment_row(payment["id"]).status == "IN_PROGRESS"
    assert start(client, owner, placed["id"]).status_code == 409


def test_logged_out_jwt_cannot_read_pay_or_cancel_orders(client, pg, monkeypatch):
    # Use the real database revocation store, not the other tests' signed-JWT substitute.
    monkeypatch.delitem(client.app.dependency_overrides, get_token_revocation_store)
    password = "fake-member-password-123"
    email = f"{uuid.uuid4().hex}@aura.com"
    insert(User(email=email, name="QA member", password_hash=PASSWORD_HASHER.hash(password)))
    pair = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert pair.status_code == 200
    headers = {"Authorization": "Bearer " + pair.json()["accessToken"]}
    placed = client.post(
        "/api/v1/orders",
        headers=headers,
        json={
            "recipient": "QA member",
            "address": "QA address",
            "items": [{"productId": "fresh-hand-cream", "quantity": 1}],
        },
    )
    assert placed.status_code == 201
    payment = client.post(
        "/api/v1/payments", headers=headers, json={"orderId": placed.json()["id"]}
    )
    assert payment.status_code == 201
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert (
        client.get(f"/api/v1/payments/{payment.json()['id']}", headers=headers).status_code == 401
    )
    assert (
        client.post(
            "/api/v1/payments", headers=headers, json={"orderId": placed.json()["id"]}
        ).status_code
        == 401
    )
    assert (
        client.post(f"/api/v1/orders/{placed.json()['id']}/cancel", headers=headers).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/payments/confirm",
            headers=headers,
            json={
                "paymentKey": "pk_" + uuid.UUID(payment.json()["id"]).hex,
                "orderId": payment.json()["pgOrderId"],
                "amount": payment.json()["amount"],
            },
        ).status_code
        == 401
    )
    assert pg.calls == [] and pg.refund_calls == []
