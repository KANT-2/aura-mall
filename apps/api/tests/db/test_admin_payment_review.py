"""Admin review lists for payments and refunds, on a real PostgreSQL database with a fake PG."""

import uuid

import pytest
from sqlalchemy import text
from test_admin_api import URL, admin_login, bearer, db, new_admin, new_customer, set_stock
from test_admin_api import client as client
from test_order_cancellation import TAKEN, cancel
from test_payments_api import confirm, place, start
from test_payments_api import pg as pg
from test_refunds import pay, refunds_of

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")


@pytest.fixture(autouse=True)
def stocked():
    for product_id in TAKEN:
        set_stock(product_id, 500)
    set_stock("fresh-hand-cream", 500)


@pytest.fixture(scope="module")
def admin(client):
    return admin_login(client, new_admin()[1])


def sql(statement: str, **params) -> None:
    async def write(sessionmaker):
        async with sessionmaker() as session, session.begin():
            await session.execute(text(statement), params)

    db(write)


def age_payment(payment_id, minutes=10) -> None:
    sql(
        "UPDATE payments SET confirm_started_at = now() - make_interval(mins => :m) WHERE id = :id",
        m=minutes,
        id=uuid.UUID(str(payment_id)),
    )


def age_refund(refund_id, minutes=10) -> None:
    sql(
        "UPDATE refunds SET requested_at = now() - make_interval(mins => :m) WHERE id = :id",
        m=minutes,
        id=refund_id,
    )


def flag(payment_id, reason="PG_RESULT_MISMATCH") -> None:
    sql(
        "UPDATE payments SET review_reason = :r WHERE id = :id",
        r=reason,
        id=uuid.UUID(str(payment_id)),
    )


def review(client, admin, kind, **params):
    return client.get(f"/api/v1/admin/{kind}/review", params=params, headers=admin)


def ids(response) -> set[str]:
    assert response.status_code == 200, response.text
    return {item["id"] for item in response.json()["items"]}


def stuck_payment(client, pg):
    """A payment whose PG answer never came: IN_PROGRESS until the threshold passes."""
    member = new_customer()
    order_id = place(member)
    payment = start(client, member, order_id).json()
    pg.behavior["pk_" + uuid.UUID(payment["id"]).hex] = "down"
    assert confirm(client, member, payment).status_code == 202
    return member, order_id, payment


def test_only_admins_can_read_the_review_lists(client, admin):
    member = new_customer()
    for kind in ("payments", "refunds"):
        url = f"/api/v1/admin/{kind}/review"
        assert client.get(url).status_code == 401
        assert client.get(url, headers=bearer(member)).status_code in (401, 403)
        assert client.get(url, headers=admin).status_code == 200


def test_payments_list_shows_only_those_needing_review(client, admin, pg):
    member, order_id, stuck = stuck_payment(client, pg)
    assert stuck["id"] not in ids(review(client, admin, "payments"))  # within the threshold
    age_payment(stuck["id"])
    _, done_payment, _ = pay(client, new_customer())
    _, flagged, _ = pay(client, new_customer())
    flag(flagged["id"])
    other = new_customer()
    ready = start(client, other, place(other)).json()  # an unrelated READY attempt

    response = review(client, admin, "payments")
    listed = ids(response)
    assert stuck["id"] in listed and flagged["id"] in listed
    assert done_payment["id"] not in listed and ready["id"] not in listed

    by_id = {item["id"]: item for item in response.json()["items"]}
    unresolved, mismatch = by_id[stuck["id"]], by_id[flagged["id"]]
    assert unresolved["status"] == "IN_PROGRESS" and unresolved["unresolved"] is True
    assert unresolved["reviewReason"] is None and unresolved["orderId"] == str(order_id)
    assert unresolved["orderStatus"] == "received" and unresolved["amount"] == stuck["amount"]
    assert unresolved["customer"]["id"] == str(member)
    assert mismatch["reviewReason"] == "PG_RESULT_MISMATCH" and mismatch["unresolved"] is False
    assert mismatch["status"] == "DONE" and mismatch["orderStatus"] == "paid"
    assert mismatch["pgOrderId"] == flagged["pgOrderId"] and mismatch["method"] == "카드"


def test_payment_filters_and_validation(client, admin, pg):
    _, _, stuck = stuck_payment(client, pg)
    age_payment(stuck["id"])
    _, flagged, _ = pay(client, new_customer())
    flag(flagged["id"])

    in_progress = ids(review(client, admin, "payments", status="IN_PROGRESS"))
    assert stuck["id"] in in_progress and flagged["id"] not in in_progress
    done = ids(review(client, admin, "payments", status="DONE"))
    assert flagged["id"] in done and stuck["id"] not in done
    reason = ids(review(client, admin, "payments", reason="PG_RESULT_MISMATCH"))
    assert flagged["id"] in reason and stuck["id"] not in reason
    both = review(client, admin, "payments", status="FAILED", reason="PG_RESULT_MISMATCH")
    assert ids(both) == set()
    for params, code in (
        ({"status": "BOGUS"}, "STATUS_INVALID"),
        ({"status": "done"}, "STATUS_INVALID"),
        ({"reason": "lowercase"}, "REVIEW_REASON_INVALID"),
        ({"reason": "A" * 101}, "REVIEW_REASON_INVALID"),
        ({"reason": "X'; DROP TABLE payments;--"}, "REVIEW_REASON_INVALID"),
    ):
        response = review(client, admin, "payments", **params)
        assert response.status_code == 400 and response.json()["error"]["code"] == code


def test_pagination(client, admin, pg):
    marker = "PAGE_TEST_" + uuid.uuid4().hex[:6].upper()
    created = []
    for _ in range(21):
        member = new_customer()
        created.append(start(client, member, place(member)).json()["id"])
    sql(
        "UPDATE payments SET review_reason = :r WHERE id = ANY(:ids)",
        r=marker,
        ids=[uuid.UUID(item) for item in created],
    )
    first = review(client, admin, "payments", reason=marker).json()
    second = review(client, admin, "payments", reason=marker, page="2").json()
    assert (first["total"], first["page"], first["pageSize"]) == (21, 1, 20)
    assert len(first["items"]) == 20 and len(second["items"]) == 1 and second["page"] == 2
    assert {item["id"] for item in first["items"] + second["items"]} == set(created)
    # Malformed or out-of-range pages fall back to the first page like the other admin lists.
    for bad in ("0", "-3", "abc", "99999999"):
        assert review(client, admin, "payments", reason=marker, page=bad).json()["page"] == 1
    assert review(client, admin, "payments", reason=marker, page="3").json()["items"] == []


def test_refunds_list_failed_unresolved_and_flagged_ones(client, admin, pg):
    rejected_member = new_customer()  # rejected by the PG
    rejected_order, _, rejected_key = pay(client, rejected_member)
    pg.refund_behavior[rejected_key] = "reject"
    assert cancel(client, rejected_member, rejected_order["id"]).status_code == 409
    [rejected] = refunds_of(uuid.UUID(rejected_order["id"]))

    stuck_member = new_customer()  # result unknown
    stuck_order, _, stuck_key = pay(client, stuck_member)
    pg.refund_behavior[stuck_key] = "down"
    assert cancel(client, stuck_member, stuck_order["id"]).status_code == 202
    [stuck] = refunds_of(uuid.UUID(stuck_order["id"]))
    assert str(stuck.id) not in ids(review(client, admin, "refunds"))  # within the threshold
    age_refund(stuck.id)

    odd_member = new_customer()  # the PG returned another amount
    odd_order, _, odd_key = pay(client, odd_member)
    pg.refund_behavior[odd_key] = "mismatch"
    assert cancel(client, odd_member, odd_order["id"]).status_code == 202
    [odd] = refunds_of(uuid.UUID(odd_order["id"]))

    fine_member = new_customer()  # a normal refund needs nobody
    fine_order, _, _ = pay(client, fine_member)
    assert cancel(client, fine_member, fine_order["id"]).status_code == 200
    [fine] = refunds_of(uuid.UUID(fine_order["id"]))

    response = review(client, admin, "refunds")
    listed = ids(response)
    assert {str(rejected.id), str(stuck.id), str(odd.id)} <= listed and str(fine.id) not in listed
    by_id = {item["id"]: item for item in response.json()["items"]}
    failed, unknown, mismatch = by_id[str(rejected.id)], by_id[str(stuck.id)], by_id[str(odd.id)]
    assert failed["status"] == "FAILED" and failed["failureCode"] == "NOT_CANCELABLE_PAYMENT"
    assert failed["orderStatus"] == "paid" and failed["reason"] == "member request"
    assert failed["actorType"] == "member" and failed["amount"] == rejected.amount
    assert failed["paymentId"] == str(rejected.payment_id)
    assert failed["customer"]["id"] == str(rejected_member)
    assert unknown["status"] == "IN_PROGRESS" and unknown["unresolved"] is True
    assert mismatch["reviewReason"] == "REFUND_AMOUNT_MISMATCH" and mismatch["unresolved"] is False

    failed_ids = ids(review(client, admin, "refunds", status="FAILED"))
    assert str(rejected.id) in failed_ids and str(stuck.id) not in failed_ids
    flagged_ids = ids(review(client, admin, "refunds", reason="REFUND_AMOUNT_MISMATCH"))
    assert str(odd.id) in flagged_ids and str(rejected.id) not in flagged_ids
    none = review(client, admin, "refunds", status="DONE", reason="REFUND_AMOUNT_MISMATCH")
    assert ids(none) == set()
    bad = review(client, admin, "refunds", status="READY")  # a payment status, not a refund one
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "STATUS_INVALID"


def test_lists_never_expose_pg_keys_or_secrets(client, admin, pg):
    _, _, stuck = stuck_payment(client, pg)
    age_payment(stuck["id"])
    key = "pk_" + uuid.UUID(stuck["id"]).hex
    member = new_customer()
    order, _, paid_key = pay(client, member)
    pg.refund_behavior[paid_key] = "reject"
    assert cancel(client, member, order["id"]).status_code == 409
    pg.refund_behavior[paid_key] = "refund"
    assert cancel(client, member, order["id"]).status_code == 200  # a DONE refund has a tx key
    for kind in ("payments", "refunds"):
        body = review(client, admin, kind).text
        assert key not in body and paid_key not in body and "tx_" not in body
        for word in ("paymentkey", "transactionkey", "secret", "authorization", "test_sk_"):
            assert word not in body.lower()
    done = review(client, admin, "refunds", status="DONE")
    assert done.status_code == 200 and done.json()["items"] == []  # DONE alone needs no review


def test_reading_the_lists_changes_nothing_and_never_calls_the_pg(client, admin, pg):
    _, _, stuck = stuck_payment(client, pg)
    age_payment(stuck["id"])
    calls = (len(pg.calls), len(pg.refund_calls))
    for _ in range(2):
        assert review(client, admin, "payments").status_code == 200
        assert review(client, admin, "refunds").status_code == 200
    assert (len(pg.calls), len(pg.refund_calls)) == calls
    # Reading settled nothing: the payment is still IN_PROGRESS and still listed.
    assert stuck["id"] in ids(review(client, admin, "payments", status="IN_PROGRESS"))
