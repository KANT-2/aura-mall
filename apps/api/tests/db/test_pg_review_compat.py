"""Run against PR #82 in a separate worktree; absent review APIs are explicitly skipped."""

import uuid

import pytest
from sqlalchemy import text
from test_admin_api import URL, admin_login, db, new_admin, new_customer
from test_admin_api import client as client
from test_order_cancellation import cancel, order
from test_payments_api import confirm, start
from test_payments_api import pg as pg

from aura_api.infra.payment_gateway import TossPaymentsGateway

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")


@pytest.mark.parametrize("kind", ["payments", "refunds"])
def test_pg_authentication_errors_remain_in_admin_review(client, pg, kind):
    path = f"/api/v1/admin/{kind}/review"
    if path not in client.app.openapi()["paths"]:
        pytest.skip("PR #82 review endpoints are not merged into this branch")
    owner = new_customer()
    placed = order(client, owner, items=[{"productId": "fresh-hand-cream", "quantity": 1}])
    payment = start(client, owner, placed["id"]).json()
    if kind == "refunds":
        assert confirm(client, owner, payment).status_code == 200
    secret = "FAKE_PG_AUTH_DETAIL"
    gateway = TossPaymentsGateway(secret, "https://api.tosspayments.com", 1)

    async def denied(*args, **kwargs):
        return 401, {"code": "UNAUTHORIZED_KEY", "message": secret}

    gateway._call = denied
    client.app.state.payment_gateway = gateway
    response = (
        confirm(client, owner, payment)
        if kind == "payments"
        else cancel(client, owner, placed["id"])
    )
    assert response.status_code == 202 and secret not in response.text

    async def age(maker):
        async with maker() as session, session.begin():
            # Identifiers below are fixed by the test, never request input.
            column = "confirm_started_at" if kind == "payments" else "requested_at"
            await session.execute(
                text(
                    f"UPDATE {kind} SET {column} = now() - interval '10 minutes' "
                    "WHERE order_id = :id"
                ),
                {"id": uuid.UUID(placed["id"])},
            )

    db(age)
    headers = admin_login(client, new_admin()[1])
    reviewed = client.get(path, headers=headers)
    assert reviewed.status_code == 200 and secret not in reviewed.text
    row = next(item for item in reviewed.json()["items"] if item["orderId"] == placed["id"])
    assert row["status"] == "IN_PROGRESS" and row["unresolved"] is True
    assert row["failureCode"] is None and row["failureMessage"] is None
