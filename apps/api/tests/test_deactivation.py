"""CRA-34: memory auth checks and full production SQL in a disposable test schema."""

import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import anyio
import psycopg
import pytest
from psycopg import sql
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from test_change_password import NEW_PASSWORD, change
from test_lifecycle import (
    ALICE,
    BOB,
    INACTIVE,
    KEY,
    ORIGIN,
    PASSWORD,
    PASSWORD_HASH,
    MemoryRepository,
    login,
    logout,
    protected,
    refresh,
)
from test_lifecycle import client as client

from aura_api.domain.errors import InvalidInput
from aura_api.identity.postgres import PostgresAuthRepository
from aura_api.identity.repository import AuthStorageUnavailable
from aura_api.identity.tokens import issue_admin_access
from aura_api.infra.database import get_session
from aura_api.infra.repositories import users

API_DIR = Path(__file__).resolve().parents[1]


class MemoryDeactivationRepository(MemoryRepository):
    async def deactivate(self, user_id, *, expected_password_hash):
        with self.lock:
            user = await self.find_user_by_id(user_id)
            if user is None or not user.is_active:
                return None
            if user.password_hash != expected_password_hash:
                return False
            for email, row in self.users.items():
                if row.id == user_id:
                    self.users[email] = replace(row, is_active=False)
            for family in {r["family"] for r in self.refreshes.values() if r["user"] == user_id}:
                self.revoke(family)
            return True


@pytest.fixture(params=["memory", "postgres"])
def repository(request):
    if request.param == "memory":
        yield MemoryDeactivationRepository()
        return
    dsn = os.environ.get("AURA_TEST_DATABASE_URL")
    if not dsn or os.environ.get("AURA_ALLOW_DATABASE_TESTS") != "1":
        pytest.skip("Dedicated PostgreSQL DB and explicit DDL opt-in not configured")
    schema = "auth_test_" + uuid4().hex
    # Never use public, run migrations, or reset the existing database.
    try:
        with psycopg.connect(dsn) as connection:
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            connection.execute(
                sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema))
            )
            for name in ("schema.sql", "seed.sql"):
                ddl = (API_DIR / "db" / name).read_text(encoding="utf-8")
                ddl = "\n".join(
                    line for line in ddl.splitlines() if line.strip() not in {"BEGIN;", "COMMIT;"}
                )
                connection.execute(ddl)
            for user_id, email, active in (
                (ALICE, "alice@example.com", True),
                (BOB, "bob@example.com", True),
                (INACTIVE, "inactive@example.com", False),
            ):
                connection.execute(
                    "INSERT INTO users (id,email,name,password_hash,is_active,"
                    "marketing) VALUES (%s,%s,%s,%s,%s,true)",
                    (user_id, email, "Test customer", PASSWORD_HASH, active),
                )
        yield PostgresAuthRepository(dsn, "aura-test-issuer", schema=schema)
    finally:
        with psycopg.connect(dsn) as connection:
            connection.execute(
                sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema))
            )


@pytest.fixture(autouse=True)
def business_sessions(client, repository):
    if isinstance(repository, MemoryRepository):
        yield
        return
    engine = create_async_engine(
        make_url(repository._dsn).set(drivername="postgresql+asyncpg"),
        connect_args={"server_settings": {"search_path": repository._schema + ",pg_catalog"}},
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def session():
        async with factory() as value:
            yield value

    client.app.dependency_overrides[get_session] = session
    try:
        yield
    finally:
        client.portal.call(engine.dispose)


def deactivate(client, token, password=PASSWORD, *, body=None):
    return client.request(
        "DELETE",
        "/api/v1/auth/me",
        content=json.dumps(body if body is not None else {"currentPassword": password}),
        headers={
            "Origin": ORIGIN,
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "X-Request-ID": "a945f630-e5ba-46f9-bbc5-fb6323a0633d",
        },
    )


def headers(token):
    return {"Origin": ORIGIN, "Authorization": "Bearer " + token}


def business_write(client, token, kind):
    if kind == "recipe":
        return client.post(
            "/api/v1/recipes",
            json={"name": "Private scent", "counts": {"bergamot": 3}},
            headers=headers(token),
        )
    return client.post(
        "/api/v1/orders",
        json={
            "recipient": "Customer",
            "address": "Test address",
            "coupon": True,
            "items": [{"productId": "warm-candle", "quantity": 1}],
        },
        headers=headers(token),
    )


def pg_only(repository):
    if isinstance(repository, MemoryRepository):
        pytest.skip("Real FK/transaction/row-lock verification requires dedicated PostgreSQL")


def query(repository, statement, params=()):
    with psycopg.connect(repository._dsn) as connection:
        connection.execute(
            sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
        )
        cursor = connection.execute(statement, params)
        return cursor.fetchall() if cursor.description else None


def test_deactivate_revokes_all_devices_preserves_other_member_and_email(client, repository):
    first, second, bob = (
        login(client).json(),
        login(client).json(),
        login(client, "bob@example.com").json(),
    )
    rotated = refresh(client, second["refreshToken"]).json()
    response = deactivate(client, first["accessToken"])
    assert response.status_code == 204 and response.content == b""
    assert "set-cookie" not in response.headers
    assert response.headers["x-request-id"] == "a945f630-e5ba-46f9-bbc5-fb6323a0633d"
    assert response.headers["x-content-type-options"] == "nosniff"
    for pair in (first, second, rotated):
        assert protected(client, pair["accessToken"]).status_code == 401
        assert refresh(client, pair["refreshToken"]).status_code == 401
    assert deactivate(client, first["accessToken"]).status_code == 401
    assert protected(client, bob["accessToken"]).status_code == 200
    assert refresh(client, bob["refreshToken"]).status_code == 200
    if not isinstance(repository, MemoryRepository):
        persisted = query(
            repository,
            "SELECT f.revoked_at,r.revoked_at,EXISTS "
            "(SELECT 1 FROM revoked_tokens v WHERE v.jti=r.access_jti) "
            "FROM refresh_tokens r JOIN auth_token_families f ON f.id=r.family_id "
            "WHERE f.user_id=%s",
            (ALICE,),
        )
        assert len(persisted) == 3
        assert all(
            family is not None and token is not None and blacklisted
            for family, token, blacklisted in persisted
        )
        assert query(
            repository,
            "SELECT is_active,marketing,email,deleted_at IS NULL,"
            "deletion_scheduled_at - deletion_requested_at FROM users WHERE id=%s",
            (ALICE,),
        ) == [(False, False, "alice@example.com", True, None)]
        registration = client.post(
            "/api/v1/auth/register",
            json={"name": "New account", "email": "alice@example.com", "password": PASSWORD},
            headers={"Origin": ORIGIN},
        )
        assert registration.status_code == 201


def test_wrong_password_does_not_change_account_or_tokens(client):
    pair = login(client).json()
    response = deactivate(client, pair["accessToken"], "wrong-private-password")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "CURRENT_PASSWORD_INVALID"
    assert protected(client, pair["accessToken"]).status_code == 200
    assert login(client).status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"currentPassword": None},
        {"currentPassword": ""},
        {"currentPassword": True},
        {"currentPassword": "x" * 257},
        {"currentPassword": "\ud800"},
        {"currentPassword": PASSWORD, "userId": str(BOB)},
    ],
)
def test_invalid_input_is_private_422(client, body):
    token = login(client).json()["accessToken"]
    response = deactivate(client, token, body=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert PASSWORD not in response.text and token not in response.text
    assert protected(client, token).status_code == 200


def test_unauthenticated_revoked_and_cross_site_requests_are_rejected(client):
    pair = login(client).json()
    assert deactivate(client, "").status_code == 401
    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"currentPassword": PASSWORD},
        headers={**headers(pair["accessToken"]), "Origin": "https://evil.test"},
    )
    assert response.status_code == 403
    assert logout(client, pair["accessToken"]).status_code == 204
    assert deactivate(client, pair["accessToken"]).status_code == 401


@pytest.mark.parametrize("operation", ["find_user_by_id", "deactivate"])
def test_storage_failure_is_private_and_never_success(
    client, repository, monkeypatch, caplog, operation
):
    pair = login(client).json()
    secret = "private-db-password-token-secret"

    async def broken(*args, **kwargs):
        raise AuthStorageUnavailable(secret)

    monkeypatch.setattr(repository, operation, broken)
    with caplog.at_level(logging.DEBUG):
        response = deactivate(client, pair["accessToken"])
    assert response.status_code == 503
    for value in (secret, PASSWORD, KEY, pair["accessToken"], pair["refreshToken"]):
        assert value not in response.text + caplog.text
    assert protected(client, pair["accessToken"]).status_code == 200


def test_direct_service_rejects_invalid_encoding(client):
    with pytest.raises(InvalidInput):
        client.portal.call(client.app.state.auth_service.deactivate, str(ALICE), "\ud800")


def test_old_verified_login_cannot_save_after_deactivation(client, repository, monkeypatch):
    token = login(client).json()["accessToken"]
    reached, resume = threading.Event(), threading.Event()
    original = repository.create_token_family

    async def paused(pair, *, expected_password_hash):
        reached.set()
        assert await anyio.to_thread.run_sync(resume.wait, 10)
        return await original(pair, expected_password_hash=expected_password_hash)

    monkeypatch.setattr(repository, "create_token_family", paused)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(login, client)
        try:
            assert reached.wait(10)
            assert deactivate(client, token).status_code == 204
        finally:
            resume.set()
        assert pending.result(timeout=15).status_code == 401


def test_refresh_racing_deactivation_leaves_no_valid_tokens(client):
    pair = login(client).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        rotation = pool.submit(refresh, client, pair["refreshToken"])
        removal = pool.submit(deactivate, client, pair["accessToken"])
        rotated, removed = rotation.result(timeout=15), removal.result(timeout=15)
    assert removed.status_code == 204
    assert rotated.status_code in (200, 401)
    if rotated.status_code == 200:
        assert protected(client, rotated.json()["accessToken"]).status_code == 401
        assert refresh(client, rotated.json()["refreshToken"]).status_code == 401


def test_stale_password_check_is_rejected_without_deactivation(client, repository, monkeypatch):
    token = login(client).json()["accessToken"]
    original = repository.deactivate

    async def changed(user_id, *, expected_password_hash):
        # Model a password update committed between verification and the locked write.
        return await original(user_id, expected_password_hash="stale-verified-hash")

    monkeypatch.setattr(repository, "deactivate", changed)
    assert deactivate(client, token).status_code == 400
    assert login(client).status_code == 200


def expire_grace(repository, user_id=ALICE):
    query(
        repository,
        # Explicitly simulate a historical, scheduled account for legacy purge tests only.
        "UPDATE users SET deactivated_at=NULL, deletion_requested_at=now()-interval '31 days',"
        "deletion_scheduled_at=now()-interval '1 day' WHERE id=%s",
        (user_id,),
    )


def purge(client, repository, user_id=ALICE):
    return client.portal.call(repository.purge_member, user_id)


def test_purge_preserves_orders_referenced_coupons_and_other_members(client, repository):
    pg_only(repository)
    token = login(client).json()["accessToken"]
    alice_recipe, bob_recipe, order_id, used, bob_coupon = [uuid4() for _ in range(5)]
    query(
        repository,
        "INSERT INTO recipes(id,user_id,version,name,label,color) VALUES (%s,%s,"
        "1,'Private','classic','#ffffff')",
        (alice_recipe, ALICE),
    )
    query(
        repository,
        "INSERT INTO recipes(id,user_id,parent_id,version,name,label,color) "
        "VALUES (%s,%s,%s,2,'Other','classic','#ffffff')",
        (bob_recipe, BOB, alice_recipe),
    )
    query(
        repository,
        "INSERT INTO recipe_ingredients(recipe_id,ingredient_id,count) VALUES "
        "(%s,'bergamot',3),(%s,'bergamot',4)",
        (alice_recipe, bob_recipe),
    )
    # One coupon per type/user: test each preservation predicate in separate transactions.
    query(
        repository,
        "INSERT INTO user_coupons(id,user_id,type) VALUES (%s,%s,"
        "'FREE_SHIPPING'),(%s,%s,'FREE_SHIPPING')",
        (used, ALICE, bob_coupon, BOB),
    )
    query(
        repository,
        "INSERT INTO orders(id,user_id,recipient,address,items_amount,"
        "shipping_fee,total,coupon_id) VALUES (%s,%s,'Recipient','Preserved address',100,0,100,%s)",
        (order_id, ALICE, used),
    )
    query(
        repository,
        "UPDATE user_coupons SET status='USED',used_order_id=%s WHERE id=%s",
        (order_id, used),
    )
    snapshot = '{"name":"Preserved custom name","counts":{"bergamot":3}}'
    query(
        repository,
        "INSERT INTO order_items(order_id,position,line_key,kind,product_id,"
        "product_snapshot,unit_price,quantity,custom) VALUES (%s,0,'line',"
        "'custom','custom-atelier',%s::jsonb,100,1,%s::jsonb)",
        (order_id, snapshot, snapshot),
    )
    before = query(repository, "SELECT * FROM order_items WHERE order_id=%s", (order_id,))
    assert deactivate(client, token).status_code == 204
    # The grace period keeps restorable data; only the purge job removes it.
    assert query(repository, "SELECT id FROM recipes WHERE id=%s", (alice_recipe,)) == [
        (alice_recipe,)
    ]
    expire_grace(repository)
    assert purge(client, repository) is True
    assert query(repository, "SELECT * FROM order_items WHERE order_id=%s", (order_id,)) == before
    assert query(
        repository, "SELECT recipient,address,coupon_id FROM orders WHERE id=%s", (order_id,)
    ) == [("Recipient", "Preserved address", used)]
    assert query(
        repository, "SELECT status,used_order_id FROM user_coupons WHERE id=%s", (used,)
    ) == [("USED", order_id)]
    assert query(repository, "SELECT parent_id FROM recipes WHERE id=%s", (bob_recipe,)) == [
        (None,)
    ]
    assert query(
        repository, "SELECT count FROM recipe_ingredients WHERE recipe_id=%s", (bob_recipe,)
    ) == [(4,)]
    assert query(repository, "SELECT id FROM recipes WHERE id=%s", (alice_recipe,)) == []
    assert (
        query(repository, "SELECT * FROM recipe_ingredients WHERE recipe_id=%s", (alice_recipe,))
        == []
    )
    assert query(repository, "SELECT id FROM user_coupons WHERE id=%s", (bob_coupon,)) == [
        (bob_coupon,)
    ]


@pytest.mark.parametrize("link", ["none", "order_reference", "used_order", "used_status"])
def test_coupon_deleted_only_when_all_safety_conditions_hold(client, repository, link):
    pg_only(repository)
    coupon = uuid4()
    query(
        repository,
        "INSERT INTO user_coupons(id,user_id,type) VALUES (%s,%s,'FREE_SHIPPING')",
        (coupon, ALICE),
    )
    if link == "order_reference":
        query(
            repository,
            "INSERT INTO orders(user_id,recipient,address,items_amount,"
            "shipping_fee,total,coupon_id) VALUES (%s,'Recipient','Address',100,0,100,%s)",
            (ALICE, coupon),
        )
    elif link == "used_order":
        order_id = query(
            repository,
            "INSERT INTO orders(user_id,recipient,address,items_amount,shipping_fee,total) "
            "VALUES (%s,'Recipient','Address',100,0,100) RETURNING id",
            (ALICE,),
        )[0][0]
        query(
            repository, "UPDATE user_coupons SET used_order_id=%s WHERE id=%s", (order_id, coupon)
        )
    elif link == "used_status":
        query(repository, "UPDATE user_coupons SET status='USED' WHERE id=%s", (coupon,))
    token = login(client).json()["accessToken"]
    assert deactivate(client, token).status_code == 204
    assert query(repository, "SELECT id FROM user_coupons WHERE id=%s", (coupon,)) == [(coupon,)]
    expire_grace(repository)
    assert purge(client, repository) is True
    assert bool(query(repository, "SELECT id FROM user_coupons WHERE id=%s", (coupon,))) is (
        link != "none"
    )


def test_partial_deactivation_failure_rolls_back_everything(client, repository):
    pg_only(repository)
    pair, second = login(client).json(), login(client).json()
    # Trigger fails at the last write, after the account and family updates.
    query(
        repository,
        "CREATE FUNCTION reject_revocation() RETURNS trigger LANGUAGE plpgsql "
        "AS $$ BEGIN RAISE EXCEPTION 'private DB failure'; END $$",
    )
    query(
        repository,
        "CREATE TRIGGER fail_revocation BEFORE INSERT ON revoked_tokens FOR EACH ROW "
        "EXECUTE FUNCTION reject_revocation()",
    )
    response = deactivate(client, pair["accessToken"])
    assert response.status_code == 503 and "private DB failure" not in response.text
    assert query(
        repository,
        "SELECT is_active,marketing,deletion_requested_at FROM users WHERE id=%s",
        (ALICE,),
    ) == [(True, True, None)]
    for current in (pair, second):
        assert protected(client, current["accessToken"]).status_code == 200
        assert refresh(client, current["refreshToken"]).status_code == 200
    assert login(client).status_code == 200


def test_admin_with_shared_uuid_stays_active(client, repository):
    pg_only(repository)
    admin = issue_admin_access(client.app.state.auth_service.settings, ALICE)
    query(
        repository,
        "INSERT INTO admins(id,email,name,password_hash) VALUES (%s,"
        "'admin@example.com','Operator','unused')",
        (ALICE,),
    )
    query(
        repository,
        "INSERT INTO admin_sessions(jti,admin_id,expires_at) VALUES (%s,%s,%s)",
        (admin.jti, ALICE, admin.expires_at),
    )
    assert deactivate(client, admin.access_token).status_code == 401
    token = login(client).json()["accessToken"]
    assert deactivate(client, token).status_code == 204
    assert protected(client, admin.access_token).status_code == 200


@pytest.mark.parametrize("kind", ["order", "recipe"])
def test_business_write_waits_for_deactivation_and_is_rejected(
    client, repository, monkeypatch, kind
):
    pg_only(repository)
    token = login(client).json()["accessToken"]
    reached, resume, writing = threading.Event(), threading.Event(), threading.Event()
    original_revoke, original_lock = repository._revoke_user_families, users.lock_active_member

    async def paused(connection, user_id):
        await original_revoke(connection, user_id)
        reached.set()
        assert await anyio.to_thread.run_sync(resume.wait, 10)

    async def observed(session, user_id):
        writing.set()
        return await original_lock(session, user_id)

    monkeypatch.setattr(repository, "_revoke_user_families", paused)
    monkeypatch.setattr(users, "lock_active_member", observed)
    with ThreadPoolExecutor(max_workers=2) as pool:
        removal = pool.submit(deactivate, client, token)
        try:
            assert reached.wait(10)
            pending = pool.submit(business_write, client, token, kind)
            assert writing.wait(10)
        finally:
            resume.set()
        assert removal.result(timeout=15).status_code == 204
        assert pending.result(timeout=15).status_code == 401
    assert query(repository, "SELECT id FROM orders WHERE user_id=%s", (ALICE,)) == []
    assert query(repository, "SELECT id FROM recipes WHERE user_id=%s", (ALICE,)) == []


@pytest.mark.parametrize("kind", ["order", "recipe"])
def test_business_commit_before_deactivation_is_preserved(client, repository, monkeypatch, kind):
    pg_only(repository)
    if kind == "order":
        query(
            repository,
            "INSERT INTO user_coupons(user_id,type) VALUES (%s,'FREE_SHIPPING')",
            (ALICE,),
        )
    token = login(client).json()["accessToken"]
    reached, resume, removing = threading.Event(), threading.Event(), threading.Event()
    original_lock, original_deactivate = users.lock_active_member, repository.deactivate

    async def paused(session, user_id):
        result = await original_lock(session, user_id)
        reached.set()
        assert await anyio.to_thread.run_sync(resume.wait, 10)
        return result

    async def observed(user_id, *, expected_password_hash):
        removing.set()
        return await original_deactivate(user_id, expected_password_hash=expected_password_hash)

    monkeypatch.setattr(users, "lock_active_member", paused)
    monkeypatch.setattr(repository, "deactivate", observed)
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = pool.submit(business_write, client, token, kind)
        try:
            assert reached.wait(10)
            removal = pool.submit(deactivate, client, token)
            assert removing.wait(10)
        finally:
            resume.set()
        assert pending.result(timeout=15).status_code == 201
        assert removal.result(timeout=15).status_code == 204
    assert len(query(repository, "SELECT id FROM orders WHERE user_id=%s", (ALICE,))) == (
        1 if kind == "order" else 0
    )
    assert len(query(repository, "SELECT id FROM recipes WHERE user_id=%s", (ALICE,))) == (
        1 if kind == "recipe" else 0
    )


def test_password_changed_after_confirmation_prevents_deactivation(client, repository, monkeypatch):
    token = login(client).json()["accessToken"]
    reached, resume = threading.Event(), threading.Event()
    original = repository.deactivate

    async def paused(user_id, *, expected_password_hash):
        reached.set()
        assert await anyio.to_thread.run_sync(resume.wait, 10)
        return await original(user_id, expected_password_hash=expected_password_hash)

    monkeypatch.setattr(repository, "deactivate", paused)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(deactivate, client, token)
        try:
            assert reached.wait(10)
            assert change(client, token).status_code == 204
        finally:
            resume.set()
        assert pending.result(timeout=15).status_code == 400

    assert login(client, password=NEW_PASSWORD).status_code == 200


@pytest.mark.parametrize("operation", ["profile", "password", "refresh"])
def test_mutation_waiting_on_deactivation_cannot_restore_member(
    client, repository, monkeypatch, operation
):
    pg_only(repository)
    pair = login(client).json()
    reached, resume, waiting = threading.Event(), threading.Event(), threading.Event()
    original = repository._revoke_user_families

    async def paused(connection, user_id):
        await original(connection, user_id)
        reached.set()
        assert await anyio.to_thread.run_sync(resume.wait, 10)

    monkeypatch.setattr(repository, "_revoke_user_families", paused)
    name = {"profile": "update_profile", "password": "change_password", "refresh": "_active_user"}[
        operation
    ]
    original_operation = getattr(repository, name)

    async def observed(*args, **kwargs):
        waiting.set()
        return await original_operation(*args, **kwargs)

    monkeypatch.setattr(repository, name, observed)

    def mutate():
        if operation == "profile":
            return client.patch(
                "/api/v1/auth/me", json={"name": "Too late"}, headers=headers(pair["accessToken"])
            )
        if operation == "password":
            return change(client, pair["accessToken"])
        return refresh(client, pair["refreshToken"])

    with ThreadPoolExecutor(max_workers=2) as pool:
        removal = pool.submit(deactivate, client, pair["accessToken"])
        try:
            assert reached.wait(10)
            mutation = pool.submit(mutate)
            assert waiting.wait(10)
        finally:
            resume.set()
        assert removal.result(timeout=15).status_code == 204
        assert mutation.result(timeout=15).status_code == 401
    assert query(repository, "SELECT is_active,name FROM users WHERE id=%s", (ALICE,)) == [
        (False, "Test customer")
    ]


def test_unicode_current_password_is_preserved(client):

    token = login(client).json()["accessToken"]
    assert change(client, token).status_code == 204
    pair = login(client, password=NEW_PASSWORD).json()
    assert deactivate(client, pair["accessToken"], NEW_PASSWORD.strip()).status_code == 400
    assert deactivate(client, pair["accessToken"], NEW_PASSWORD).status_code == 204
