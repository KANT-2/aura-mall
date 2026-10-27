"""Permanent deactivation and new identities, never restoration of the previous account."""

from test_deactivation import ALICE, ORIGIN, deactivate, login, pg_only, protected, query, refresh
from test_deactivation import business_sessions as business_sessions
from test_deactivation import client as client
from test_deactivation import repository as repository
from test_lifecycle import PASSWORD

from tests.fixtures.fake_payment_gateway import FakePaymentGateway


def test_deactivation_never_restores_on_correct_password(client, repository):
    pg_only(repository)
    pair = login(client).json()
    assert deactivate(client, pair["accessToken"]).status_code == 204
    assert login(client).status_code == 401
    assert protected(client, pair["accessToken"]).status_code == 401
    assert refresh(client, pair["refreshToken"]).status_code == 401


def test_same_email_registration_creates_a_new_identity(client, repository):
    pg_only(repository)
    pair = login(client).json()
    assert deactivate(client, pair["accessToken"]).status_code == 204
    response = client.post(
        "/api/v1/auth/register",
        headers={"Origin": ORIGIN},
        json={"email": "alice@example.com", "name": "New member", "password": "new-password-123"},
    )
    assert response.status_code == 201
    token = response.json()["accessToken"]
    profile = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer " + token})
    assert profile.status_code == 200 and profile.json()["id"] != str(ALICE)
    assert protected(client, pair["accessToken"]).status_code == 401
    assert refresh(client, pair["refreshToken"]).status_code == 401
    assert (
        len(query(repository, "SELECT id FROM users WHERE lower(email) = 'alice@example.com'")) == 2
    )


def test_new_withdrawal_is_not_scheduled_for_automatic_purge(client, repository):
    pg_only(repository)
    pair = login(client).json()
    assert deactivate(client, pair["accessToken"]).status_code == 204
    state = query(
        repository,
        "SELECT deactivated_at IS NOT NULL, deletion_scheduled_at, "
        "deleted_at, password_hash FROM users WHERE id=%s",
        (ALICE,),
    )[0]
    assert state == (True, None, None, "!deleted")
    assert client.portal.call(repository.due_member_ids, 100) == []
    assert client.portal.call(repository.purge_member, ALICE) is False


def test_rejoin_preserves_transactions_without_linking_old_resources(client, repository):
    pg_only(repository)
    pair = login(client).json()
    headers = {"Origin": ORIGIN, "Authorization": "Bearer " + pair["accessToken"]}
    client.app.state.payment_gateway = FakePaymentGateway()
    recipe = client.post(
        "/api/v1/recipes",
        headers=headers,
        json={"name": "Private recipe", "counts": {"bergamot": 1}},
    )
    assert recipe.status_code == 201
    placed = client.post(
        "/api/v1/orders",
        headers=headers,
        json={
            "recipient": "Retained recipient",
            "address": "Retained trade address",
            "items": [{"productId": "warm-candle", "quantity": 1}],
        },
    )
    assert placed.status_code == 201
    order_id = placed.json()["id"]
    payment = client.post("/api/v1/payments", headers=headers, json={"orderId": order_id}).json()
    assert (
        client.post(
            "/api/v1/payments/confirm",
            headers=headers,
            json={
                "paymentKey": "pk_retirement",
                "orderId": payment["pgOrderId"],
                "amount": payment["amount"],
            },
        ).status_code
        == 200
    )
    assert client.post(f"/api/v1/orders/{order_id}/cancel", headers=headers).status_code == 200
    statement = (
        "SELECT o.id,o.user_id,o.status,o.recipient,o.address,p.id,p.status,r.id,r.status "
        "FROM orders o JOIN payments p ON p.order_id=o.id "
        "JOIN refunds r ON r.order_id=o.id WHERE o.id=%s"
    )
    before = query(repository, statement, (order_id,))
    assert deactivate(client, pair["accessToken"]).status_code == 204
    assert query(repository, statement, (order_id,)) == before
    response = client.post(
        "/api/v1/auth/register",
        headers={"Origin": ORIGIN},
        json={"email": "alice@example.com", "name": "New identity", "password": PASSWORD},
    )
    assert response.status_code == 201
    fresh = {"Origin": ORIGIN, "Authorization": "Bearer " + response.json()["accessToken"]}
    assert client.get("/api/v1/orders", headers=fresh).json() == []
    assert client.get("/api/v1/recipes", headers=fresh).json() == []
    assert client.get(f"/api/v1/payments/{payment['id']}", headers=fresh).status_code == 404
    assert client.post(f"/api/v1/orders/{order_id}/cancel", headers=fresh).status_code == 404
    assert client.get("/api/v1/orders", headers=headers).status_code == 401
