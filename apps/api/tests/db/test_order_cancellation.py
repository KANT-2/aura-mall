"""Cancelling unpaid orders (migration 0008): stock, coupon, payment slot and history together."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from alembic import command
from conftest import alembic_config
from sqlalchemy import select, text
from test_admin_api import URL, admin_login, bearer, db, insert, new_admin, new_customer, set_stock
from test_admin_api import client as client
from test_payments_api import confirm, order_status, payment_row, start
from test_payments_api import pg as pg

from aura_api.infra.models import OrderStatusHistory, Product, UserCoupon
from aura_api.services import orders as order_service

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
GIFT = {
    "productId": "warm-gift-set",
    "quantity": 2,
    "selection": ["warm-hand-cream", "warm-candle", "warm-diffuser"],
}
ITEMS = [GIFT, {"productId": "warm-hand-cream", "quantity": 3}]
# Singles and Gift Set contents (and the Gift Set product itself) draw on stock.
TAKEN = {
    "warm-gift-set": 2,
    "warm-hand-cream": 3 + 2,
    "warm-candle": 2,
    "warm-diffuser": 2,
}


@pytest.fixture(autouse=True)
def stocked():
    for product_id in TAKEN:
        set_stock(product_id, 500)
    set_stock("fresh-hand-cream", 500)


def stock() -> dict[str, int]:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            rows = await session.execute(
                select(Product.id, Product.stock).where(Product.id.in_(list(TAKEN)))
            )
            return dict(rows.all())

    return db(read)


def member_with_coupon() -> tuple[uuid.UUID, uuid.UUID]:
    member = new_customer()
    return member, insert(UserCoupon(user_id=member, type="FREE_SHIPPING"))


def coupon_state(coupon_id) -> tuple:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            coupon = await session.get(UserCoupon, coupon_id)
            return coupon.status, coupon.used_order_id, coupon.used_at

    return db(read)


def history(order_id) -> list[tuple]:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            rows = await session.scalars(
                select(OrderStatusHistory)
                .where(OrderStatusHistory.order_id == order_id)
                .order_by(OrderStatusHistory.changed_at, OrderStatusHistory.id)
            )
            return [(r.from_status, r.to_status, r.actor_type, r.actor_id, r.reason) for r in rows]

    return db(read)


def order(client, member, *, coupon=False, items=ITEMS):
    response = client.post(
        "/api/v1/orders",
        json={"recipient": "김철수", "address": "서울시 중구 1", "coupon": coupon, "items": items},
        headers=bearer(member),
    )
    assert response.status_code == 201, response.text
    return response.json()


def cancel(client, member, order_id):
    return client.post(f"/api/v1/orders/{order_id}/cancel", headers=bearer(member))


def age(order_id, hours=2):
    async def write(sessionmaker):
        async with sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE orders SET created_at = now() - make_interval(hours => :h) "
                    "WHERE id = :id"
                ),
                {"h": hours, "id": order_id},
            )

    db(write)


def expire(execute=True, hours=1):
    async def work(sessionmaker):
        async with sessionmaker() as session:
            return await order_service.expire_unpaid_orders(
                session, older_than=timedelta(hours=hours), execute=execute
            )

    return db(work)


def test_member_cancel_restores_stock_and_coupon_in_one_step(client):
    member, coupon_id = member_with_coupon()
    before = stock()
    placed = order(client, member, coupon=True)
    assert {key: before[key] - stock()[key] for key in TAKEN} == TAKEN
    assert coupon_state(coupon_id)[:2] == ("USED", uuid.UUID(placed["id"]))

    response = cancel(client, member, placed["id"])
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled" and response.json()["id"] == placed["id"]
    assert stock() == before
    assert coupon_state(coupon_id) == ("AVAILABLE", None, None)
    assert history(uuid.UUID(placed["id"]))[-1] == (
        "received",
        "cancelled",
        "member",
        member,
        "member request",
    )
    # The coupon works again on a new order.
    assert order(client, member, coupon=True)["total"] == placed["total"]


def test_cancelling_again_restores_nothing_twice(client):
    member = new_customer()
    placed = order(client, member)
    before_cancel = stock()
    assert cancel(client, member, placed["id"]).status_code == 200
    restored = stock()
    again = cancel(client, member, placed["id"])
    assert again.status_code == 200 and again.json()["status"] == "cancelled"
    assert stock() == restored
    assert {key: restored[key] - before_cancel[key] for key in TAKEN} == TAKEN
    assert [row[1] for row in history(uuid.UUID(placed["id"]))] == ["received", "cancelled"]


def test_simultaneous_cancels_restore_once(client):
    member = new_customer()
    placed = order(client, member)
    before_cancel = stock()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: cancel(client, member, placed["id"]), range(4)))
    assert {response.status_code for response in results} == {200}
    assert {key: stock()[key] - before_cancel[key] for key in TAKEN} == TAKEN
    assert [row[1] for row in history(uuid.UUID(placed["id"]))] == ["received", "cancelled"]


def test_only_the_owner_can_cancel(client):
    owner, stranger = new_customer(), new_customer()
    placed = order(client, owner)
    before = stock()
    assert cancel(client, stranger, placed["id"]).status_code == 404
    assert cancel(client, stranger, "not-a-uuid").status_code == 404
    assert client.post(f"/api/v1/orders/{placed['id']}/cancel").status_code == 401
    admin = admin_login(client, new_admin()[1])
    assert client.post(f"/api/v1/orders/{placed['id']}/cancel", headers=admin).status_code == 401
    assert stock() == before and order_status(uuid.UUID(placed["id"])) == "received"


def test_paid_orders_are_refunded_not_cancelled_like_unpaid_ones(client, pg):
    member = new_customer()
    placed = order(client, member)
    payment = start(client, member, placed["id"]).json()
    assert confirm(client, member, payment).json()["status"] == "DONE"
    response = cancel(client, member, placed["id"])
    # The PG refund comes first (see test_refunds.py); only then is the order cancelled.
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    assert pg.refund_count == 1 and order_status(uuid.UUID(placed["id"])) == "cancelled"


def test_cancel_closes_an_unused_payment_attempt(client, pg):
    member = new_customer()
    placed = order(client, member)
    payment = start(client, member, placed["id"]).json()
    assert cancel(client, member, placed["id"]).status_code == 200
    row = payment_row(payment["id"])
    assert (row.status, row.failure_code, row.payment_key) == ("CANCELED", "ORDER_CANCELLED", None)
    late = confirm(client, member, payment)
    assert late.status_code == 409 and late.json()["error"]["code"] == "PAYMENT_CLOSED"
    again = start(client, member, placed["id"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "ORDER_NOT_PAYABLE"
    assert pg.calls == []


def test_payment_in_progress_blocks_cancel(client, pg):
    member = new_customer()
    placed = order(client, member)
    payment = start(client, member, placed["id"]).json()
    key = "pk_" + uuid.UUID(payment["id"]).hex
    pg.behavior[key] = "down"
    assert confirm(client, member, payment).status_code == 202
    before = stock()
    response = cancel(client, member, placed["id"])
    assert response.status_code == 409 and response.json()["error"]["code"] == "PAYMENT_IN_PROGRESS"
    assert stock() == before and order_status(uuid.UUID(placed["id"])) == "received"
    pg.behavior[key] = "approve"
    assert confirm(client, member, payment).json()["status"] == "DONE"
    assert order_status(uuid.UUID(placed["id"])) == "paid"


@pytest.mark.parametrize("round_", range(4))
def test_cancel_racing_payment_confirmation_keeps_one_outcome(client, pg, round_):
    member = new_customer()
    placed = order(client, member)
    order_id = uuid.UUID(placed["id"])
    payment = start(client, member, placed["id"]).json()
    before = stock()
    pg.delay = 0.3
    with ThreadPoolExecutor(max_workers=2) as pool:
        tasks = [pool.submit(confirm, client, member, payment)]
        tasks.append(pool.submit(cancel, client, member, placed["id"]))
        paid, cancelled = (task.result(timeout=30) for task in tasks)
    final = order_status(order_id)
    if final == "cancelled" and pg.approvals == 1:
        # The payment finished before the cancel looked: the paid order was refunded in full.
        assert paid.json()["status"] == "DONE" and cancelled.status_code == 200
        assert pg.refund_count == 1
    elif final == "paid":
        assert paid.json()["status"] == "DONE" and cancelled.status_code == 409
        assert pg.approvals == 1
        assert {key: before[key] - stock()[key] for key in TAKEN} == {key: 0 for key in TAKEN}
    else:
        assert final == "cancelled" and cancelled.status_code == 200
        assert paid.status_code == 409 and pg.approvals == 0
        assert payment_row(payment["id"]).status == "CANCELED"
        assert {key: stock()[key] - before[key] for key in TAKEN} == TAKEN


def test_expiry_cancels_only_old_unpaid_orders(client, pg):
    member, coupon_id = member_with_coupon()
    old = order(client, member, coupon=True)
    recent = order(client, new_customer())
    ready_owner = new_customer()
    old_ready = order(client, ready_owner)
    ready_payment = start(client, ready_owner, old_ready["id"]).json()
    owner = new_customer()
    pending = order(client, owner)
    pending_payment = start(client, owner, pending["id"]).json()
    pg.behavior["pk_" + uuid.UUID(pending_payment["id"]).hex] = "down"
    assert confirm(client, owner, pending_payment).status_code == 202
    for placed in (old, old_ready, pending):
        age(placed["id"])
    before = stock()

    dry = expire(execute=False)
    assert order_status(uuid.UUID(old["id"])) == "received" and stock() == before

    result = expire()
    # The dry run predicts the run: same candidates, same cancel/skip split.
    assert dry == result
    assert result["cancelled"] >= 2 and result["skipped"] == 0
    assert order_status(uuid.UUID(old["id"])) == "cancelled"
    assert order_status(uuid.UUID(old_ready["id"])) == "cancelled"
    assert order_status(uuid.UUID(recent["id"])) == "received"
    assert payment_row(ready_payment["id"]).status == "CANCELED"
    assert order_status(uuid.UUID(pending["id"])) == "received"  # payment result unknown
    assert payment_row(pending_payment["id"]).status == "IN_PROGRESS"
    assert coupon_state(coupon_id)[0] == "AVAILABLE"
    assert {key: stock()[key] - before[key] for key in TAKEN} == {
        key: value * 2 for key, value in TAKEN.items()
    }
    assert history(uuid.UUID(old["id"]))[-1][1:] == (
        "cancelled",
        "system",
        None,
        "unpaid order expired",
    )
    rerun = expire()
    assert rerun["cancelled"] == 0
    assert {key: stock()[key] - before[key] for key in TAKEN} == {
        key: value * 2 for key, value in TAKEN.items()
    }


def test_expiry_closes_the_ready_attempt(client, pg):
    member = new_customer()
    placed = order(client, member)
    payment = start(client, member, placed["id"]).json()
    age(placed["id"])
    expire()
    assert payment_row(payment["id"]).status == "CANCELED"
    assert order_status(uuid.UUID(placed["id"])) == "cancelled"


def test_downgrade_drops_only_canceled_attempts(client, pg):
    member = new_customer()
    placed = order(client, member)
    start(client, member, placed["id"])
    cancel(client, member, placed["id"])
    config = alembic_config()
    command.downgrade(config, "0007")
    command.upgrade(config, "head")
    assert order_status(uuid.UUID(placed["id"])) == "cancelled"
