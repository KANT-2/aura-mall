"""Refunding paid orders (migration 0009): the PG refund comes first, then order, stock, coupon."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import anyio
import pytest
from alembic import command
from conftest import alembic_config
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from test_admin_api import URL, admin_login, db, new_admin, new_customer, set_stock
from test_admin_api import client as client
from test_order_cancellation import (
    ITEMS,
    TAKEN,
    cancel,
    coupon_state,
    history,
    member_with_coupon,
    order,
    stock,
)
from test_payments_api import change, confirm, order_status, payment_row, start
from test_payments_api import pg as pg

from aura_api.infra.models import Refund
from aura_api.infra.repositories import orders as order_repository
from aura_api.services import orders as order_service
from aura_api.services import refunds as refund_service

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")


@pytest.fixture(autouse=True)
def stocked():
    for product_id in TAKEN:
        set_stock(product_id, 500)
    set_stock("fresh-hand-cream", 500)


def pay(client, member, *, coupon=False):
    """A paid order: placed, a payment issued and approved by the fake PG."""
    placed = order(client, member, coupon=coupon, items=ITEMS)
    payment = start(client, member, placed["id"]).json()
    assert confirm(client, member, payment).json()["status"] == "DONE"
    assert order_status(uuid.UUID(placed["id"])) == "paid"
    return placed, payment, "pk_" + uuid.UUID(payment["id"]).hex


def refunds_of(order_id) -> list[Refund]:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            rows = await session.scalars(
                select(Refund).where(Refund.order_id == order_id).order_by(Refund.requested_at)
            )
            return list(rows)

    return db(read)


def cancelled_entries(order_id) -> list[tuple]:
    return [row for row in history(order_id) if row[1] == "cancelled"]


def error_code(response) -> str:
    return response.json()["error"]["code"]


def test_refund_cancels_the_paid_order_and_gives_everything_back(client, pg):
    member, coupon_id = member_with_coupon()
    before = stock()
    placed, payment, key = pay(client, member, coupon=True)
    order_id = uuid.UUID(placed["id"])
    assert {k: before[k] - stock()[k] for k in TAKEN} == TAKEN
    assert coupon_state(coupon_id)[0] == "USED"

    response = cancel(client, member, placed["id"])
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled" and response.json()["id"] == placed["id"]
    assert order_status(order_id) == "cancelled"
    assert stock() == before
    assert coupon_state(coupon_id) == ("AVAILABLE", None, None)
    assert cancelled_entries(order_id) == [
        ("paid", "cancelled", "member", member, "member request")
    ]

    [refund] = refunds_of(order_id)
    assert (refund.status, refund.amount, refund.payment_id) == (
        "DONE",
        placed["total"],
        uuid.UUID(payment["id"]),
    )
    assert refund.transaction_key and refund.refunded_at and refund.review_reason is None
    assert payment_row(payment["id"]).status == "DONE"  # the approval itself is history
    # The PG got the refund ID as the idempotency key, the stored payment amount and no client data.
    assert pg.refund_calls == [
        {
            "payment_key": key,
            "amount": placed["total"],
            "reason": "member request",
            "key": str(refund.id),
        }
    ]
    assert pg.refund_count == 1
    # The coupon works again, and a refunded order cannot be paid again.
    assert order(client, member, coupon=True)["total"] == placed["total"]
    again = start(client, member, placed["id"])
    assert again.status_code == 409 and error_code(again) == "ORDER_NOT_PAYABLE"


def test_cancelling_a_refunded_order_again_refunds_nothing_twice(client, pg):
    member = new_customer()
    placed, _, _ = pay(client, member)
    assert cancel(client, member, placed["id"]).status_code == 200
    restored, calls = stock(), len(pg.refund_calls)
    again = cancel(client, member, placed["id"])
    assert again.status_code == 200 and again.json()["status"] == "cancelled"
    assert stock() == restored and len(pg.refund_calls) == calls and pg.refund_count == 1
    assert len(refunds_of(uuid.UUID(placed["id"]))) == 1
    assert len(cancelled_entries(uuid.UUID(placed["id"]))) == 1


def test_simultaneous_cancels_refund_once(client, pg):
    member = new_customer()
    before = stock()
    placed, _, _ = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    pg.delay = 0.4
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: cancel(client, member, placed["id"]), range(4)))
    assert {response.status_code for response in results} <= {200, 202}
    assert 200 in {response.status_code for response in results}
    # A request that arrived while the PG was still working may have seen "unknown": resend it.
    assert cancel(client, member, placed["id"]).status_code == 200
    assert pg.refund_count == 1
    assert len(refunds_of(order_id)) == 1 and refunds_of(order_id)[0].status == "DONE"
    assert len(cancelled_entries(order_id)) == 1
    assert stock() == before
    # Every PG call used the same idempotency key.
    assert {call["key"] for call in pg.refund_calls} == {str(refunds_of(order_id)[0].id)}


@pytest.mark.parametrize("state", ["paid", "preparing"])
def test_no_database_lock_is_held_while_the_pg_is_called(client, pg, state):
    member = new_customer()
    placed, payment, _ = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    if state == "preparing":
        change(order_id, state)
    seen = {}

    async def probe(sessionmaker):
        async with sessionmaker() as session, session.begin():
            # NOWAIT fails at once if the refund request still holds any of these row locks.
            await session.execute(text("SET LOCAL lock_timeout = '300ms'"))
            for table, column, value in (
                ("orders", "id", order_id),
                ("payments", "order_id", order_id),
                ("refunds", "order_id", order_id),
            ):
                rows = await session.execute(
                    text(f"SELECT status FROM {table} WHERE {column} = :v FOR UPDATE NOWAIT"),
                    {"v": value},
                )
                seen[table] = [row[0] for row in rows]
        return True

    async def hook():
        seen["locked"] = await anyio.to_thread.run_sync(lambda: db(probe))

    pg.cancel_hook = hook
    assert cancel(client, member, placed["id"]).status_code == 200
    assert seen["locked"] is True
    # The claim was already committed when the PG was asked, and the order was still paid.
    assert seen["refunds"] == ["IN_PROGRESS"] and seen["orders"] == [state]


def test_pg_unreachable_leaves_the_order_paid_and_a_resend_finishes_it(client, pg):
    member, coupon_id = member_with_coupon()
    placed, _, key = pay(client, member, coupon=True)
    order_id = uuid.UUID(placed["id"])
    before = stock()
    pg.refund_behavior[key] = "down"
    first = cancel(client, member, placed["id"])
    assert first.status_code == 202 and first.json()["status"] == "paid"
    assert order_status(order_id) == "paid" and stock() == before
    assert coupon_state(coupon_id)[0] == "USED"
    [pending] = refunds_of(order_id)
    assert pending.status == "IN_PROGRESS" and pg.refund_count == 0

    pg.refund_behavior[key] = "refund"
    done = cancel(client, member, placed["id"])
    assert done.status_code == 200 and done.json()["status"] == "cancelled"
    [refund] = refunds_of(order_id)
    assert refund.id == pending.id and refund.status == "DONE"  # the same attempt
    assert pg.refund_count == 1
    assert coupon_state(coupon_id)[0] == "AVAILABLE"
    assert {k: stock()[k] - before[k] for k in TAKEN} == TAKEN


def test_a_lost_pg_answer_never_refunds_twice(client, pg):
    member = new_customer()
    placed, _, key = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    pg.refund_behavior[key] = "lost"  # refunded at the PG, the answer never arrives
    first = cancel(client, member, placed["id"])
    assert first.status_code == 202 and order_status(order_id) == "paid"
    assert pg.refund_count == 1
    done = cancel(client, member, placed["id"])
    assert done.status_code == 200 and order_status(order_id) == "cancelled"
    assert pg.refund_count == 1
    assert len({call["key"] for call in pg.refund_calls}) == 1


def test_reconciliation_finishes_a_refund_whose_answer_was_lost(client, pg):
    member = new_customer()
    placed, _, key = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    pg.refund_behavior[key] = "lost"
    assert cancel(client, member, placed["id"]).status_code == 202

    async def reconcile(sessionmaker):
        async with sessionmaker() as session:
            return await refund_service.reconcile_refunds(session, pg, older_than=timedelta(0))

    counts = db(reconcile)
    assert counts["done"] >= 1 and counts["failed"] == 0
    assert order_status(order_id) == "cancelled" and pg.refund_count == 1
    assert refunds_of(order_id)[0].status == "DONE"
    again = db(reconcile)
    assert again["checked"] == 0 or again["done"] == 0
    assert pg.refund_count == 1


def test_database_error_after_the_pg_refunded_is_recovered_by_the_resend(client, pg, monkeypatch):
    member = new_customer()
    before = stock()
    placed, _, _ = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    taken = stock()
    real = order_repository.change_status
    failures = []

    async def failing(*args, **kwargs):
        if not failures:
            failures.append(True)
            raise SQLAlchemyError("simulated write failure")
        return await real(*args, **kwargs)

    monkeypatch.setattr(order_repository, "change_status", failing)
    first = cancel(client, member, placed["id"])
    assert first.status_code == 202 and order_status(order_id) == "paid"
    assert refunds_of(order_id)[0].status == "IN_PROGRESS"  # rolled back as a whole
    assert pg.refund_count == 1 and stock() == taken  # nothing half-applied
    done = cancel(client, member, placed["id"])
    assert done.status_code == 200 and order_status(order_id) == "cancelled"
    assert pg.refund_count == 1 and stock() == before
    assert len(cancelled_entries(order_id)) == 1


def test_a_rejected_refund_keeps_the_order_paid_and_can_be_retried(client, pg):
    member, coupon_id = member_with_coupon()
    placed, _, key = pay(client, member, coupon=True)
    order_id = uuid.UUID(placed["id"])
    before = stock()
    pg.refund_behavior[key] = "reject"
    rejected = cancel(client, member, placed["id"])
    assert rejected.status_code == 409 and error_code(rejected) == "REFUND_FAILED"
    assert "NOT_CANCELABLE" not in rejected.text  # PG detail stays out of the response
    assert order_status(order_id) == "paid" and stock() == before
    assert coupon_state(coupon_id)[0] == "USED"
    [failed] = refunds_of(order_id)
    assert failed.status == "FAILED" and failed.failure_code == "NOT_CANCELABLE_PAYMENT"

    pg.refund_behavior[key] = "refund"
    retry = cancel(client, member, placed["id"])
    assert retry.status_code == 200 and order_status(order_id) == "cancelled"
    rows = refunds_of(order_id)
    assert [row.status for row in rows] == ["FAILED", "DONE"] and rows[0].id != rows[1].id
    assert pg.refund_count == 1 and coupon_state(coupon_id)[0] == "AVAILABLE"


def test_a_pg_amount_that_differs_needs_review_and_changes_nothing(client, pg):
    member = new_customer()
    placed, _, key = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    before = stock()
    pg.refund_behavior[key] = "mismatch"
    response = cancel(client, member, placed["id"])
    assert response.status_code == 202 and order_status(order_id) == "paid"
    [refund] = refunds_of(order_id)
    assert refund.status == "IN_PROGRESS" and refund.review_reason == "REFUND_AMOUNT_MISMATCH"
    assert stock() == before


def test_the_order_status_cannot_change_while_a_refund_is_pending(client, pg):
    member = new_customer()
    placed, _, key = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    pg.refund_behavior[key] = "down"
    assert cancel(client, member, placed["id"]).status_code == 202
    with pytest.raises(Exception) as error:
        change(order_id, "preparing")
    assert getattr(error.value, "code", None) == "REFUND_IN_PROGRESS"
    assert order_status(order_id) == "paid"
    pg.refund_behavior[key] = "refund"
    assert cancel(client, member, placed["id"]).status_code == 200
    change_after = refunds_of(order_id)[0]
    assert change_after.status == "DONE"


@pytest.mark.parametrize("state", ["shipped", "delivered"])
def test_orders_past_payment_are_not_refunded(client, pg, state):
    member = new_customer()
    placed, _, _ = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    for step in ("preparing", "shipped", "delivered"):
        change(order_id, step)
        if step == state:
            break
    before = stock()
    response = cancel(client, member, placed["id"])
    assert response.status_code == 409 and error_code(response) == "ORDER_NOT_CANCELLABLE"
    assert order_status(order_id) == state and stock() == before
    assert pg.refund_calls == [] and refunds_of(order_id) == []


def test_preparing_order_refunds_and_restores_coupon_once(client, pg):
    member, coupon_id = member_with_coupon()
    before = stock()
    placed, _, key = pay(client, member, coupon=True)
    order_id = uuid.UUID(placed["id"])
    change(order_id, "preparing")
    pg.refund_behavior[key] = "down"
    response = cancel(client, member, placed["id"])
    assert response.status_code == 202 and response.json()["status"] == "preparing"
    assert coupon_state(coupon_id)[0] == "USED"
    with pytest.raises(Exception) as error:
        change(order_id, "shipped")
    assert getattr(error.value, "code", None) == "REFUND_IN_PROGRESS"
    pg.refund_behavior[key] = "refund"
    assert cancel(client, member, placed["id"]).json()["status"] == "cancelled"
    assert stock() == before and coupon_state(coupon_id)[0] == "AVAILABLE"
    assert cancelled_entries(order_id)[0][0] == "preparing"
    assert cancel(client, member, placed["id"]).status_code == 200
    assert stock() == before and pg.refund_count == 1


@pytest.mark.parametrize("round_", range(4))
def test_shipping_racing_preparing_refund_has_one_safe_outcome(client, pg, round_):
    member = new_customer()
    placed, _, _ = pay(client, member)
    order_id = uuid.UUID(placed["id"])
    change(order_id, "preparing")
    before = stock()
    pg.delay = 0.1

    def ship():
        try:
            change(order_id, "shipped")
            return "shipped"
        except Exception as error:
            return getattr(error, "code", None)

    with ThreadPoolExecutor(max_workers=2) as pool:
        shipping = pool.submit(ship)
        refunding = pool.submit(cancel, client, member, placed["id"])
        shipping_result, response = shipping.result(timeout=30), refunding.result(timeout=30)
    final = order_status(order_id)
    if final == "shipped":
        assert shipping_result == "shipped" and response.status_code == 409
        assert pg.refund_count == 0 and stock() == before
    else:
        assert final == "cancelled" and response.status_code == 200
        assert shipping_result in ("REFUND_IN_PROGRESS", "ORDER_STATUS_CONFLICT")
        assert pg.refund_count == 1
        assert {k: stock()[k] - before[k] for k in TAKEN} == TAKEN


def test_only_the_owner_can_refund(client, pg):
    owner, stranger = new_customer(), new_customer()
    placed, _, _ = pay(client, owner)
    assert cancel(client, stranger, placed["id"]).status_code == 404
    assert client.post(f"/api/v1/orders/{placed['id']}/cancel").status_code == 401
    admin = admin_login(client, new_admin()[1])
    assert client.post(f"/api/v1/orders/{placed['id']}/cancel", headers=admin).status_code == 401
    assert order_status(uuid.UUID(placed["id"])) == "paid" and pg.refund_calls == []


def test_unpaid_orders_still_cancel_without_the_pg_but_paid_ones_need_it(client, pg):
    member = new_customer()
    unpaid = order(client, member, items=ITEMS)
    paid, _, _ = pay(client, member)
    client.app.state.payment_gateway = None
    assert cancel(client, member, unpaid["id"]).status_code == 200
    before = stock()
    response = cancel(client, member, paid["id"])
    assert response.status_code == 503
    assert order_status(uuid.UUID(paid["id"])) == "paid" and stock() == before
    assert refunds_of(uuid.UUID(paid["id"])) == []


def test_a_cancelled_order_with_an_unpaid_attempt_is_untouched_by_refunds(client, pg):
    member = new_customer()
    placed = order(client, member, items=ITEMS)
    payment = start(client, member, placed["id"]).json()
    assert cancel(client, member, placed["id"]).status_code == 200
    assert payment_row(payment["id"]).status == "CANCELED"
    assert pg.refund_calls == [] and refunds_of(uuid.UUID(placed["id"])) == []


def test_unpaid_cancel_and_refund_service_agree_on_a_member_cancelling_twice(client, pg):
    member = new_customer()
    placed = order(client, member, items=ITEMS)

    async def twice(sessionmaker):
        async with sessionmaker() as session:
            first = await refund_service.cancel_order(session, pg, member, placed["id"])
            second = await order_service.cancel_order(session, member, placed["id"])
            return first[1], second.status

    assert db(twice) == (True, "cancelled")


def test_a_second_active_refund_for_one_payment_is_impossible(client, pg):
    member = new_customer()
    placed, payment, _ = pay(client, member)

    async def duplicate(sessionmaker):
        async with sessionmaker() as session, session.begin():
            for _ in range(2):
                session.add(
                    Refund(
                        payment_id=uuid.UUID(payment["id"]),
                        order_id=uuid.UUID(placed["id"]),
                        amount=placed["total"],
                        reason="x",
                        actor_type="system",
                    )
                )
                await session.flush()

    with pytest.raises(Exception) as error:
        db(duplicate)
    assert "refunds_payment_active_key" in str(error.value)


def test_downgrade_drops_only_the_refunds_table(client, pg):
    member = new_customer()
    placed, _, _ = pay(client, member)
    assert cancel(client, member, placed["id"]).status_code == 200
    config = alembic_config()
    command.downgrade(config, "0008")
    command.upgrade(config, "head")
    assert order_status(uuid.UUID(placed["id"])) == "cancelled"
    assert refunds_of(uuid.UUID(placed["id"])) == []
