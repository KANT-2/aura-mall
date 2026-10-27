"""Payments (migration 0007) through the API on a real PostgreSQL database with a fake PG."""

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from alembic import command
from conftest import alembic_config
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from test_admin_api import URL, admin_login, bearer, db, new_admin, new_customer, set_stock
from test_admin_api import client as client

from aura_api.domain.errors import Conflict
from aura_api.infra.models import Order, OrderStatusHistory, Payment
from aura_api.infra.repositories import orders as order_repository
from aura_api.services import orders as order_service
from aura_api.services import payments as payment_service
from tests.fixtures.fake_payment_gateway import FakePaymentGateway

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ORDER = {
    "recipient": "김철수",
    "address": "서울시 중구 1",
    "items": [{"productId": "fresh-hand-cream", "quantity": 1}],
}
TOTAL = 28_000 + 3_000
RUN = uuid.uuid4().hex[:8]  # paymentKeys stay unique when the module DB is reused


@pytest.fixture
def pg(client):
    set_stock("fresh-hand-cream", 999)
    fake = FakePaymentGateway()
    client.app.state.payment_gateway = fake
    yield fake
    client.app.state.payment_gateway = None


def place(member: uuid.UUID) -> uuid.UUID:
    async def work(sessionmaker):
        async with sessionmaker() as session:
            order, _ = await order_service.place_order(session, member, dict(ORDER))
            return order.id

    return db(work)


def order_status(order_id) -> str:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            return await session.scalar(select(Order.status).where(Order.id == order_id))

    return db(read)


def payment_row(payment_id) -> Payment:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            return await session.get(Payment, uuid.UUID(str(payment_id)))

    return db(read)


def paid_entries(order_id) -> list[tuple]:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            rows = await session.scalars(
                select(OrderStatusHistory).where(
                    OrderStatusHistory.order_id == order_id, OrderStatusHistory.to_status == "paid"
                )
            )
            return [(row.from_status, row.actor_type, row.actor_id, row.reason) for row in rows]

    return db(read)


def change(order_id, new_status, **options):
    async def work(sessionmaker):
        async with sessionmaker() as session, session.begin():
            return await order_repository.change_status(
                session, order_id, new_status, actor_type="admin", actor_id=uuid.uuid4(), **options
            )

    return db(work)


def start(client, member, order_id):
    return client.post("/api/v1/payments", json={"orderId": str(order_id)}, headers=bearer(member))


def confirm(client, member, payment, key=None, amount=None):
    # paymentKey is unique across all payments, so each attempt gets its own default key.
    key = key or "pk_" + uuid.UUID(payment["id"]).hex
    return client.post(
        "/api/v1/payments/confirm",
        json={
            "paymentKey": key,
            "orderId": payment["pgOrderId"],
            "amount": payment["amount"] if amount is None else amount,
        },
        headers=bearer(member),
    )


def new_payment(client, pg):
    member = new_customer()
    order_id = place(member)
    response = start(client, member, order_id)
    assert response.status_code == 201, response.text
    return member, order_id, response.json()


def test_payment_uses_the_stored_total_and_marks_the_order_paid(client, pg):
    member, order_id, payment = new_payment(client, pg)
    assert payment["amount"] == TOTAL and payment["status"] == "READY"
    assert payment["pgOrderId"] == "aura-" + uuid.UUID(payment["id"]).hex
    assert payment["orderName"]  # first item's name at order time
    again = start(client, member, order_id)
    assert again.status_code == 200 and again.json()["id"] == payment["id"]

    response = confirm(client, member, payment)
    assert response.status_code == 200, response.text
    done = response.json()
    assert done["status"] == "DONE" and done["method"] == "카드" and done["approved"]
    assert order_status(order_id) == "paid"
    assert paid_entries(order_id) == [("received", "system", None, f"payment {payment['id']}")]
    [call] = pg.calls
    assert call == {
        "payment_key": "pk_" + uuid.UUID(payment["id"]).hex,
        "order_id": payment["pgOrderId"],
        "amount": TOTAL,
        "key": payment["id"],
    }
    assert client.get(f"/api/v1/payments/{payment['id']}", headers=bearer(member)).json() == done
    assert client.get("/api/v1/orders", headers=bearer(member)).json()[0]["status"] == "paid"

    # The same approval sent again answers from the record without a second PG call.
    assert confirm(client, member, payment).json() == done
    assert len(pg.calls) == 1 and pg.approvals == 1


def test_client_amounts_are_never_trusted(client, pg):
    member, order_id, payment = new_payment(client, pg)
    forged = client.post(
        "/api/v1/payments",
        json={"orderId": str(order_id), "amount": 100},
        headers=bearer(member),
    )
    assert forged.status_code == 422
    for amount in (100, TOTAL - 1, TOTAL + 1):
        response = confirm(client, member, payment, amount=amount)
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "PAYMENT_AMOUNT_MISMATCH"
    for amount in (0, -1, "31000", 31000.0, True):
        assert confirm(client, member, payment, amount=amount).status_code == 400
    assert pg.calls == [] and payment_row(payment["id"]).status == "READY"
    assert order_status(order_id) == "received"


def test_other_members_cannot_see_or_pay(client, pg):
    owner, order_id, payment = new_payment(client, pg)
    stranger = new_customer()
    assert start(client, stranger, order_id).status_code == 404
    assert confirm(client, stranger, payment).status_code == 404
    assert (
        client.get(f"/api/v1/payments/{payment['id']}", headers=bearer(stranger)).status_code == 404
    )
    assert client.post("/api/v1/payments", json={"orderId": str(order_id)}).status_code == 401
    assert pg.calls == [] and order_status(order_id) == "received"


def test_admin_tokens_cannot_pay_but_see_the_paid_order(client, pg):
    member, order_id, payment = new_payment(client, pg)
    admin = admin_login(client, new_admin()[1])
    response = client.post(
        "/api/v1/payments/confirm",
        json={"paymentKey": f"pk_admin_{RUN}", "orderId": payment["pgOrderId"], "amount": TOTAL},
        headers=admin,
    )
    assert response.status_code == 401
    assert confirm(client, member, payment).status_code == 200
    detail = client.get(f"/api/v1/admin/orders/{order_id}", headers=admin).json()
    assert detail["status"] == "paid"
    assert [entry["status"] for entry in detail["statusHistory"]] == ["received", "paid"]


def test_a_paid_order_cannot_be_paid_again(client, pg):
    member, order_id, payment = new_payment(client, pg)
    assert confirm(client, member, payment).status_code == 200
    again = start(client, member, order_id)
    assert again.status_code == 409 and again.json()["error"]["code"] == "ORDER_ALREADY_PAID"
    other = confirm(client, member, payment, key=f"pk_test_other_{RUN}")
    assert other.status_code == 409
    assert pg.approvals == 1 and len(paid_entries(order_id)) == 1


def test_simultaneous_confirmations_approve_once(client, pg):
    member, order_id, payment = new_payment(client, pg)
    pg.delay = 0.5
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: confirm(client, member, payment), range(2)))
    assert sorted(response.status_code for response in results) in ([200, 202], [200, 200])
    assert pg.approvals == 1 and len(paid_entries(order_id)) == 1
    assert order_status(order_id) == "paid"


def test_simultaneous_different_keys_claim_once(client, pg):
    member, order_id, payment = new_payment(client, pg)
    pg.delay = 0.5
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda key: confirm(client, member, payment, key=key),
                [f"pk_a_1_{RUN}", f"pk_b_1_{RUN}"],
            )
        )
    codes = sorted(response.status_code for response in results)
    assert codes == [200, 409]
    assert pg.approvals == 1 and len(paid_entries(order_id)) == 1


def test_rejected_payment_leaves_order_received_and_allows_a_new_attempt(client, pg):
    member, order_id, payment = new_payment(client, pg)
    pg.behavior[f"pk_rejected_{RUN}"] = "reject"
    failed = confirm(client, member, payment, key=f"pk_rejected_{RUN}")
    assert failed.status_code == 200
    body = failed.json()
    assert body["status"] == "FAILED" and body["failureCode"] == "REJECT_CARD_PAYMENT"
    assert order_status(order_id) == "received" and paid_entries(order_id) == []
    closed = confirm(client, member, payment, key=f"pk_rejected_{RUN}")
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "PAYMENT_CLOSED"

    retry = start(client, member, order_id)
    assert retry.status_code == 201 and retry.json()["id"] != payment["id"]
    assert confirm(client, member, retry.json(), key=f"pk_second_{RUN}").json()["status"] == "DONE"
    assert order_status(order_id) == "paid"


def test_timeout_before_the_pg_keeps_the_result_open(client, pg):
    member, order_id, payment = new_payment(client, pg)
    pg.behavior[f"pk_slow_{RUN}"] = "down"
    pending = confirm(client, member, payment, key=f"pk_slow_{RUN}")
    assert pending.status_code == 202 and pending.json()["status"] == "IN_PROGRESS"
    assert order_status(order_id) == "received"
    blocked = start(client, member, order_id)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "PAYMENT_IN_PROGRESS"
    pg.behavior[f"pk_slow_{RUN}"] = "approve"
    assert confirm(client, member, payment, key=f"pk_slow_{RUN}").json()["status"] == "DONE"
    assert pg.approvals == 1 and order_status(order_id) == "paid"


def test_lost_approval_response_is_recovered_without_charging_twice(client, pg):
    member, order_id, payment = new_payment(client, pg)
    pg.behavior[f"pk_lost_{RUN}"] = "lost"
    assert confirm(client, member, payment, key=f"pk_lost_{RUN}").status_code == 202
    assert order_status(order_id) == "received" and pg.approvals == 1
    done = confirm(client, member, payment, key=f"pk_lost_{RUN}")
    assert done.status_code == 200 and done.json()["status"] == "DONE"
    assert pg.approvals == 1 and len(paid_entries(order_id)) == 1
    assert {call["key"] for call in pg.calls} == {payment["id"]}


def test_db_failure_after_approval_is_reconciled(client, pg, monkeypatch):
    member, order_id, payment = new_payment(client, pg)
    original = payment_service.order_repository.change_status
    failures = []

    async def broken(*args, **kwargs):
        if not failures:
            failures.append(1)
            raise OperationalError("UPDATE orders", {}, Exception("connection lost"))
        return await original(*args, **kwargs)

    monkeypatch.setattr(payment_service.order_repository, "change_status", broken)
    response = confirm(client, member, payment)
    assert response.status_code == 202 and "connection lost" not in response.text
    row = payment_row(payment["id"])
    assert (row.status, row.payment_key) == ("IN_PROGRESS", "pk_" + row.id.hex)
    assert order_status(order_id) == "received" and pg.approvals == 1

    async def reconcile(sessionmaker):
        async with sessionmaker() as session:
            return await payment_service.reconcile_payments(
                session, pg, older_than=__import__("datetime").timedelta(0)
            )

    assert db(reconcile)["done"] == 1
    assert payment_row(payment["id"]).status == "DONE" and order_status(order_id) == "paid"
    assert pg.approvals == 1 and len(paid_entries(order_id)) == 1


def test_approval_for_an_order_that_left_received_needs_review(client, pg):
    member, order_id, payment = new_payment(client, pg)
    pg.behavior[f"pk_late_{RUN}"] = "down"
    assert confirm(client, member, payment, key=f"pk_late_{RUN}").status_code == 202
    change(order_id, "cancelled")
    pg.behavior[f"pk_late_{RUN}"] = "approve"
    done = confirm(client, member, payment, key=f"pk_late_{RUN}")
    assert done.json()["status"] == "DONE"
    assert payment_row(payment["id"]).review_reason == "ORDER_NOT_PAYABLE"
    assert order_status(order_id) == "cancelled" and paid_entries(order_id) == []


def test_unpaid_orders_cannot_reach_preparing_or_paid_by_hand(client, pg):
    order_id = place(new_customer())
    with pytest.raises(Conflict) as skipped:
        change(order_id, "preparing")
    assert skipped.value.code == "ORDER_STATUS_CONFLICT"
    with pytest.raises(Conflict) as manual:
        change(order_id, "paid")
    assert manual.value.code == "ORDER_PAYMENT_REQUIRED"
    assert order_status(order_id) == "received"


def test_cancelled_orders_cannot_start_a_payment(client, pg):
    member = new_customer()
    order_id = place(member)
    change(order_id, "cancelled")
    response = start(client, member, order_id)
    assert response.status_code == 409 and response.json()["error"]["code"] == "ORDER_NOT_PAYABLE"


def test_without_a_configured_pg_payments_are_unavailable(client):
    client.app.state.payment_gateway = None
    member = new_customer()
    assert start(client, member, place(member)).status_code == 503


def test_payment_rows_enforce_one_open_attempt_per_order(client, pg):
    member, order_id, payment = new_payment(client, pg)

    async def second(sessionmaker):
        async with sessionmaker() as session, session.begin():
            session.add(
                Payment(order_id=order_id, provider="toss", pg_order_id="aura-dup-1", amount=1)
            )

    with pytest.raises(Exception, match="payments_order_open_key"):
        db(second)


def test_downgrade_and_upgrade_keep_orders(client, pg):
    member, order_id, payment = new_payment(client, pg)
    config = alembic_config()
    command.downgrade(config, "0006")
    command.upgrade(config, "head")
    assert order_status(order_id) == "received"
