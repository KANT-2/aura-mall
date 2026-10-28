"""Shipping persistence, operator fulfillment races and password/session boundaries."""

from concurrent.futures import ThreadPoolExecutor

import pytest
from test_admin_api import URL, admin_login, bearer, new_admin, new_customer
from test_admin_api import client as client
from test_payments_api import confirm, start
from test_payments_api import pg as pg

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")


def test_shipping_idempotency_and_fulfillment_concurrency(client, pg):
    member = new_customer()
    auth = bearer(member)
    body = {
        "recipient": "테스트",
        "recipientPhone": "010-1234-5678",
        "address": "검증 주소 상세",
        "deliveryNote": "문 앞",
        "items": [{"productId": "fresh-hand-cream", "quantity": 1}],
    }
    placed = client.post(
        "/api/v1/orders", json=body, headers={**auth, "Idempotency-Key": "checkout-test-001"}
    )
    assert placed.status_code == 201, placed.text
    order = placed.json()
    assert (
        order["recipientPhone"] == body["recipientPhone"]
        and order["deliveryNote"] == body["deliveryNote"]
    )
    again = client.post(
        "/api/v1/orders",
        json={**body, "recipientPhone": "other"},
        headers={**auth, "Idempotency-Key": "checkout-test-001"},
    )
    assert again.status_code == 200 and again.json() == order
    admin = admin_login(client, new_admin()[1])
    url = f"/api/v1/admin/orders/{order['id']}/fulfillment"
    update = {"expectedStatus": "paid", "status": "preparing", "reason": "상품 준비"}
    assert client.patch(url, json=update, headers=admin).status_code == 409
    assert client.patch(url, json=update, headers=auth).status_code == 403
    payment = start(client, member, order["id"]).json()
    assert confirm(client, member, payment).status_code == 200
    with ThreadPoolExecutor(2) as pool:
        results = list(
            pool.map(lambda _: client.patch(url, json=update, headers=admin).status_code, range(2))
        )
    assert sorted(results) == [200, 409]
    shipping = {"expectedStatus": "preparing", "status": "shipped", "reason": "출고"}
    assert client.patch(url, json=shipping, headers=admin).status_code == 409
    shipped = client.patch(
        url, json={**shipping, "courier": "검증 택배", "trackingNumber": "TEST-1234"}, headers=admin
    )
    assert shipped.status_code == 200, shipped.text
    assert shipped.json()["trackingNumber"] == "TEST-1234"
    assert client.post(f"/api/v1/orders/{order['id']}/cancel", headers=auth).status_code == 409
    done = client.patch(
        url,
        json={"expectedStatus": "shipped", "status": "delivered", "reason": "배송 확인"},
        headers=admin,
    )
    assert done.status_code == 200
    assert [entry["status"] for entry in done.json()["statusHistory"]] == [
        "received",
        "paid",
        "preparing",
        "shipped",
        "delivered",
    ]
    mine = client.get("/api/v1/orders", headers=auth).json()[0]
    assert mine["status"] == "delivered" and mine["trackingNumber"] == "TEST-1234"


def test_admin_password_change_revokes_all_old_sessions(client):
    _, email = new_admin()
    first, second = admin_login(client, email), admin_login(client, email)
    url = "/api/v1/admin/auth/change-password"
    body = {"currentPassword": "wrong", "newPassword": "replacement-password-42"}
    assert client.post(url, json=body, headers=first).status_code == 401
    assert client.get("/api/v1/admin/session", headers=second).status_code == 200
    changed = client.post(url, json={**body, "currentPassword": "admin-password-1"}, headers=first)
    assert changed.status_code == 204
    for token in (first, second):
        assert client.get("/api/v1/admin/session", headers=token).status_code == 401
    assert (
        client.post(
            "/api/v1/admin/auth/login", json={"email": email, "password": "admin-password-1"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/admin/auth/login", json={"email": email, "password": body["newPassword"]}
        ).status_code
        == 200
    )
