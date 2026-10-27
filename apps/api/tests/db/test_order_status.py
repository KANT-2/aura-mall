"""Order status model (migration 0006) on a real PostgreSQL database."""

import asyncio
import uuid

import pytest
from alembic import command
from conftest import alembic_config
from sqlalchemy import select, text
from test_admin_api import URL, admin_login, bearer, db, new_admin, new_customer
from test_admin_api import client as client

from aura_api.domain.errors import Conflict, InvalidInput
from aura_api.infra.models import Order, OrderStatusHistory
from aura_api.infra.repositories import orders as repository
from aura_api.services import orders as order_service

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ADDRESS = {"recipient": "김철수", "address": "서울시 중구 1"}
ORDER = {**ADDRESS, "items": [{"productId": "fresh-hand-cream", "quantity": 1}]}


@pytest.fixture(scope="module")
def admin(client):
    return admin_login(client, new_admin()[1])


def place(member: uuid.UUID) -> uuid.UUID:
    async def work(sessionmaker):
        async with sessionmaker() as session:
            order, _ = await order_service.place_order(session, member, dict(ORDER))
            return order.id

    return db(work)


def history(order_id: uuid.UUID) -> list[tuple]:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            rows = await session.scalars(
                select(OrderStatusHistory)
                .where(OrderStatusHistory.order_id == order_id)
                .order_by(OrderStatusHistory.changed_at, OrderStatusHistory.id)
            )
            return [(r.from_status, r.to_status, r.actor_type, r.actor_id, r.reason) for r in rows]

    return db(read)


def status_of(order_id: uuid.UUID) -> str:
    async def read(sessionmaker):
        async with sessionmaker() as session:
            return await session.scalar(select(Order.status).where(Order.id == order_id))

    return db(read)


def change(order_id, new_status, *, actor="admin", actor_id=None, reason=None, owner=None):
    async def work(sessionmaker):
        async with sessionmaker() as session, session.begin():
            return await repository.change_status(
                session,
                order_id,
                new_status,
                actor_type=actor,
                actor_id=actor_id if actor_id or actor == "system" else uuid.uuid4(),
                reason=reason,
                owner_id=owner,
                # Stands in for the payment service, the only caller allowed to set `paid`.
                payment_verified=new_status == "paid",
            )

    return db(work)


def test_existing_orders_are_migrated_as_received(client):
    """Runs first: steps back to 0005, adds a pre-0006 order, then upgrades again."""
    config = alembic_config()
    command.downgrade(config, "0005")
    member = new_customer()
    order_id = uuid.uuid4()

    async def legacy(sessionmaker):
        async with sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "INSERT INTO orders (id, user_id, recipient, address, items_amount, "
                    "shipping_fee, total, created_at) VALUES (:id, :user, 'Legacy', 'Seoul', "
                    "100, 3000, 3100, '2026-10-01T09:00:00+09:00')"
                ),
                {"id": order_id, "user": member},
            )

    db(legacy)
    command.upgrade(config, "head")
    assert status_of(order_id) == "received"
    assert history(order_id) == [(None, "received", "system", None, "migration 0006")]

    async def migrated_at(sessionmaker):
        async with sessionmaker() as session:
            return (
                await session.execute(
                    text(
                        "SELECT h.changed_at = o.created_at FROM order_status_history h "
                        "JOIN orders o ON o.id = h.order_id WHERE o.id = :id"
                    ),
                    {"id": order_id},
                )
            ).scalar_one()

    assert db(migrated_at) is True


def test_new_orders_start_received_with_member_entry(client, admin):
    member = new_customer()
    response = client.post(
        "/api/v1/orders",
        json={**ADDRESS, "items": [{"productId": "fresh-hand-cream", "quantity": 1}]},
        headers=bearer(member),
    )
    assert response.status_code == 201
    order = response.json()
    assert order["status"] == "received"
    assert client.get("/api/v1/orders", headers=bearer(member)).json()[0]["status"] == "received"
    assert history(uuid.UUID(order["id"])) == [(None, "received", "member", member, None)]

    listed = client.get("/api/v1/admin/orders", headers=admin).json()["items"]
    assert next(item for item in listed if item["id"] == order["id"])["status"] == "received"
    detail = client.get(f"/api/v1/admin/orders/{order['id']}", headers=admin).json()
    assert detail["status"] == "received"
    [entry] = detail["statusHistory"]
    assert entry["fromStatus"] is None and entry["status"] == "received"
    assert entry["actorType"] == "member" and entry["reason"] is None
    assert set(entry) == {"fromStatus", "status", "actorType", "reason", "changed"}


def test_allowed_changes_are_recorded_in_order(client, admin):
    order_id = place(new_customer())
    admin_id = uuid.uuid4()
    assert change(order_id, "paid", actor="system").status == "paid"
    for new_status in ("preparing", "shipped", "delivered"):
        assert change(order_id, new_status, actor_id=admin_id).status == new_status
    assert status_of(order_id) == "delivered"
    assert [row[:2] for row in history(order_id)] == [
        (None, "received"),
        ("received", "paid"),
        ("paid", "preparing"),
        ("preparing", "shipped"),
        ("shipped", "delivered"),
    ]
    detail = client.get(f"/api/v1/admin/orders/{order_id}", headers=admin).json()
    assert [entry["status"] for entry in detail["statusHistory"]] == [
        "received",
        "paid",
        "preparing",
        "shipped",
        "delivered",
    ]


@pytest.mark.parametrize(
    "steps,rejected,error",
    [
        ((), "delivered", Conflict),  # skipping ahead
        (("cancelled",), "received", Conflict),  # terminal
        (("paid", "preparing", "shipped"), "cancelled", Conflict),  # shipped cannot be cancelled
        ((), "preparing", Conflict),  # an unpaid order cannot be prepared
        ((), "refunded", InvalidInput),  # unknown status
        ((), None, InvalidInput),
    ],
)
def test_disallowed_changes_leave_order_and_history_unchanged(steps, rejected, error):
    order_id = place(new_customer())
    for step in steps:
        change(order_id, step)
    before = (status_of(order_id), history(order_id))
    with pytest.raises(error):
        change(order_id, rejected)
    assert (status_of(order_id), history(order_id)) == before


def test_reason_is_trimmed_and_bounded():
    order_id = place(new_customer())
    change(order_id, "cancelled", reason="  고객 요청  ")
    assert history(order_id)[-1][4] == "고객 요청"
    other = place(new_customer())
    with pytest.raises(InvalidInput):
        change(other, "cancelled", reason="x" * 201)
    assert status_of(other) == "received"


def test_owner_scope_hides_other_members_orders():
    owner, stranger = new_customer(), new_customer()
    order_id = place(owner)
    assert change(order_id, "cancelled", actor="member", actor_id=stranger, owner=stranger) is None
    assert status_of(order_id) == "received" and len(history(order_id)) == 1
    changed = change(order_id, "cancelled", actor="member", actor_id=owner, owner=owner)
    assert changed.status == "cancelled"
    assert history(order_id)[-1][2:4] == ("member", owner)


def test_simultaneous_changes_apply_exactly_one():
    order_id = place(new_customer())

    async def race(sessionmaker):
        async def attempt(new_status, delay):
            await asyncio.sleep(delay)
            async with sessionmaker() as session, session.begin():
                await repository.change_status(
                    session,
                    order_id,
                    new_status,
                    actor_type="admin",
                    actor_id=uuid.uuid4(),
                    payment_verified=new_status == "paid",
                )
                await asyncio.sleep(0.3)  # hold the row lock so the other attempt waits
            return new_status

        return await asyncio.gather(
            attempt("cancelled", 0), attempt("paid", 0.05), return_exceptions=True
        )

    first, second = db(race)
    assert first == "cancelled" and isinstance(second, Conflict)
    assert status_of(order_id) == "cancelled"
    assert [row[:2] for row in history(order_id)] == [(None, "received"), ("received", "cancelled")]


def test_lock_rereads_a_status_cached_in_the_same_session():
    order_id = place(new_customer())

    async def work(sessionmaker):
        async with sessionmaker() as session, session.begin():
            cached = await session.get(Order, order_id)  # status 'received' in this session
            async with sessionmaker() as other, other.begin():
                await repository.change_status(
                    other, order_id, "cancelled", actor_type="admin", actor_id=uuid.uuid4()
                )
            assert cached.status == "received"
            with pytest.raises(Conflict):
                await repository.change_status(
                    session, order_id, "preparing", actor_type="admin", actor_id=uuid.uuid4()
                )

    db(work)
    assert status_of(order_id) == "cancelled"


def test_members_and_admins_keep_their_boundaries(client, admin):
    owner, other = new_customer(), new_customer()
    response = client.post(
        "/api/v1/orders",
        json={**ADDRESS, "items": [{"productId": "fresh-hand-cream", "quantity": 1}]},
        headers=bearer(owner),
    )
    order_id = response.json()["id"]
    assert all(
        order["id"] != order_id
        for order in client.get("/api/v1/orders", headers=bearer(other)).json()
    )
    # A member token never reads the admin order detail with its status history.
    assert client.get(f"/api/v1/admin/orders/{order_id}", headers=bearer(owner)).status_code in (
        401,
        403,
    )
    assert "statusHistory" not in client.get("/api/v1/orders", headers=bearer(owner)).json()[0]


def test_downgrade_and_upgrade_keep_orders(client):
    order_id = place(new_customer())
    change(order_id, "cancelled")
    config = alembic_config()
    command.downgrade(config, "0005")
    command.upgrade(config, "head")
    # Status and history are 0006 data: after a round trip every order is 'received' again.
    assert status_of(order_id) == "received"
    assert history(order_id)[0][1:3] == ("received", "system")
