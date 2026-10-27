"""Lifecycle API tests. Memory storage is a TEST substitute, never an app fallback."""

import asyncio
import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from math import ceil
from pathlib import Path
from uuid import UUID, uuid4

import anyio
import jwt
import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql

from aura_api.api.auth import TokenResponse
from aura_api.config import Settings
from aura_api.core.auth import CurrentUser
from aura_api.identity.postgres import PostgresAuthRepository
from aura_api.identity.repository import (
    LOGIN_FAILURE_LIMIT,
    LOGIN_LOCK,
    AuthStorageUnavailable,
)
from aura_api.identity.service import (
    PASSWORD_HASHER,
    AuthenticationRejected,
    AuthLifecycleService,
    check_password,
)
from aura_api.identity.tokens import UserRecord, hash_refresh_token
from aura_api.main import create_app

ORIGIN = "https://mall.test"
KEY = "lifecycle-test-key-0123456789abcdef" * 2
PASSWORD = "test-password-123"
PASSWORD_HASH = PASSWORD_HASHER.hash(PASSWORD)
ALICE, BOB, INACTIVE = uuid4(), uuid4(), uuid4()


class MemoryRepository:
    def __init__(self):
        self.users = {
            "alice@example.com": UserRecord(ALICE, PASSWORD_HASH, True),
            "bob@example.com": UserRecord(BOB, PASSWORD_HASH, True),
            "inactive@example.com": UserRecord(INACTIVE, PASSWORD_HASH, False),
        }
        self.families, self.refreshes, self.revoked = {}, {}, {}
        self.lock = threading.RLock()
        self.login_failures = {}

    async def find_user(self, email):
        return self.users.get(email)

    async def find_user_by_id(self, user_id):
        return next((user for user in self.users.values() if user.id == user_id), None)

    async def reserve_login_attempt(self, email_hash):
        with self.lock:
            failures, until = self.login_failures.get(email_hash, (0, None))
            now = datetime.now(UTC)
            if until is not None and until > now:
                return ceil((until - now).total_seconds())
            failures += 1
            locked = now + LOGIN_LOCK if failures >= LOGIN_FAILURE_LIMIT else None
            self.login_failures[email_hash] = (failures, locked)
            return 0

    async def clear_login_failures(self, email_hash):
        with self.lock:
            self.login_failures.pop(email_hash, None)

    async def change_password(self, user_id, *, expected_password_hash, new_password_hash):
        with self.lock:
            for email, user in self.users.items():
                if user.id != user_id:
                    continue
                if not user.is_active:
                    return None
                if user.password_hash != expected_password_hash:
                    return False
                self.users[email] = replace(user, password_hash=new_password_hash)
                families = {
                    row["family"] for row in self.refreshes.values() if row["user"] == user_id
                }
                for family in families:
                    self.revoke(family)
                return True
        return None

    async def register(self, registration, password_hash, pair):
        with self.lock:
            if registration.email in self.users:
                return False
            self.users[registration.email] = UserRecord(pair.user_id, password_hash, True)
            self.families[pair.family_id] = False
            self.save(pair)
        return True

    async def profile(self, user_id):
        for email, user in self.users.items():
            if user.id == user_id and user.is_active:
                return {
                    "id": str(user_id),
                    "email": email,
                    "name": "Test customer",
                    "marketing": False,
                    "coupon": True,
                    "role": "member",
                }
        return None

    def active(self, user_id):
        return any(user.id == user_id and user.is_active for user in self.users.values())

    def save(self, pair):
        self.refreshes[pair.refresh_hash] = {
            "id": pair.refresh_id,
            "user": pair.user_id,
            "family": pair.family_id,
            "expires": pair.refresh_expires_at,
            "consumed": False,
            "revoked": False,
            "access_jti": pair.jti,
            "access_expires_at": pair.access_expires_at,
        }

    async def create_token_family(self, pair, *, expected_password_hash):
        with self.lock:
            if not any(
                user.id == pair.user_id
                and user.is_active
                and user.password_hash == expected_password_hash
                for user in self.users.values()
            ):
                return False
            self.families[pair.family_id] = False
            self.save(pair)
        return True

    def revoke(self, family):
        self.families[family] = True
        for row in self.refreshes.values():
            if row["family"] == family:
                row["revoked"] = True
                if row["access_expires_at"] > datetime.now(UTC):
                    self.revoked[row["access_jti"]] = row["access_expires_at"]

    async def rotate(self, token_hash, issue):
        with self.lock:
            row = self.refreshes.get(token_hash)
            if not row or self.families[row["family"]] or not self.active(row["user"]):
                return None
            if row["consumed"]:
                self.revoke(row["family"])
                return None
            if row["revoked"] or row["expires"] <= datetime.now(UTC):
                return None
            pair = issue(row["user"], row["family"])
            row["consumed"] = True
            self.save(pair)
            return pair

    async def logout(self, user_id, jti):
        with self.lock:
            row = next((row for row in self.refreshes.values() if row["access_jti"] == jti), None)
            if (
                not row
                or row["user"] != user_id
                or self.families[row["family"]]
                or row["access_expires_at"] <= datetime.now(UTC)
            ):
                return False
            self.revoke(row["family"])
            return True

    async def is_revoked(self, *, issuer, jti):
        with self.lock:
            row = next(
                (row for row in self.refreshes.values() if row["access_jti"] == UUID(jti)), None
            )
            return (
                issuer != "aura-test-issuer"
                or not row
                or self.families[row["family"]]
                or not self.active(row["user"])
                or row["access_expires_at"] <= datetime.now(UTC)
                or row["access_jti"] in self.revoked
            )


@pytest.fixture(params=["memory", "postgres"])
def repository(request):
    if request.param == "memory":
        yield MemoryRepository()
        return
    # Never discover credentials, default to a local DB, or use an app/production DSN.
    dsn = os.environ.get("AURA_TEST_DATABASE_URL")
    if not dsn or os.environ.get("AURA_ALLOW_DATABASE_TESTS") != "1":
        pytest.skip("Dedicated PostgreSQL test DB and explicit DDL opt-in not configured")
    schema = "auth_test_" + uuid4().hex
    with psycopg.connect(dsn) as connection:
        connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema)))
        connection.execute(
            Path(__file__).with_name("sql").joinpath("auth_contract.sql").read_text()
        )
        for user_id, email, active in (
            (ALICE, "alice@example.com", True),
            (BOB, "bob@example.com", True),
            (INACTIVE, "inactive@example.com", False),
        ):
            connection.execute(
                "INSERT INTO users (id, email, name, password_hash, is_active) "
                "VALUES (%s,%s,%s,%s,%s)",
                (user_id, email, "Test customer", PASSWORD_HASH, active),
            )
    repo = PostgresAuthRepository(dsn, "aura-test-issuer", schema=schema)
    try:
        yield repo
    finally:
        with psycopg.connect(dsn) as connection:
            connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


@pytest.fixture
def client(repository):
    settings = Settings(
        _env_file=None,
        jwt_algorithm="HS256",
        jwt_signing_key=KEY,
        jwt_issuer="aura-test-issuer",
        jwt_audience="aura-test-api",
        jwt_access_ttl_seconds=300,
        refresh_token_ttl_seconds=600,
        csrf_allowed_origins=[ORIGIN],
        database_url=None,
    )
    app = create_app(settings)
    app.state.auth_repository = repository
    app.state.auth_service = AuthLifecycleService(settings, repository)

    @app.get("/test/protected")
    async def protected(user: CurrentUser):
        return {"userId": user.user_id}

    with TestClient(
        app,
        raise_server_exceptions=False,
        backend_options={"loop_factory": asyncio.SelectorEventLoop},
    ) as client:
        yield client


def login(client, email="alice@example.com", password=PASSWORD):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"Origin": ORIGIN},
    )


def refresh(client, token):
    return client.post(
        "/api/v1/auth/refresh", json={"refreshToken": token}, headers={"Origin": ORIGIN}
    )


def protected(client, token):
    return client.get("/test/protected", headers={"Authorization": "Bearer " + token})


def logout(client, token):
    return client.post(
        "/api/v1/auth/logout", headers={"Origin": ORIGIN, "Authorization": "Bearer " + token}
    )


def test_login_issues_minimal_jwt_and_hashed_refresh(client, repository):
    response = login(client, " ALICE@EXAMPLE.COM ")
    assert response.status_code == 200
    pair = response.json()
    claims = jwt.decode(
        pair["accessToken"],
        KEY,
        algorithms=["HS256"],
        issuer="aura-test-issuer",
        audience="aura-test-api",
    )
    assert set(claims) == {"sub", "jti", "iat", "exp", "iss", "aud"}
    assert claims["sub"] == str(ALICE)
    assert pair["tokenType"] == "Bearer"
    assert pair["expiresIn"] == 300
    assert pair["refreshExpiresIn"] == 600
    assert protected(client, pair["accessToken"]).json() == {"userId": str(ALICE)}
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-request-id"]
    if isinstance(repository, MemoryRepository):
        assert hash_refresh_token(pair["refreshToken"]) in repository.refreshes
        assert pair["refreshToken"] not in str(repository.refreshes)
        row = repository.refreshes[hash_refresh_token(pair["refreshToken"])]
        assert row["access_jti"] == UUID(claims["jti"])
        assert row["access_expires_at"] == datetime.fromtimestamp(claims["exp"], UTC)
    else:
        with psycopg.connect(repository._dsn) as connection:
            connection.execute(
                sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
            )
            row = connection.execute(
                "SELECT access_jti, access_expires_at FROM refresh_tokens WHERE token_hash=%s",
                (hash_refresh_token(pair["refreshToken"]),),
            ).fetchone()
        assert row == (UUID(claims["jti"]), datetime.fromtimestamp(claims["exp"], UTC))


@pytest.mark.parametrize(
    "email,password",
    [
        ("missing@example.com", PASSWORD),
        ("alice@example.com", "wrong"),
        ("inactive@example.com", PASSWORD),
    ],
)
def test_login_rejections_are_identical(client, email, password):
    response = login(client, email, password)
    assert response.status_code == 401
    assert response.json() == {"error": {"code": "HTTP_401", "message": "인증이 필요합니다."}}
    assert password not in response.text
    assert email not in response.text


def test_rotation_and_replay_revoke_entire_family(client):
    first = login(client).json()
    result = refresh(client, first["refreshToken"])
    assert result.status_code == 200
    second = result.json()
    assert second["refreshToken"] != first["refreshToken"]
    assert second["accessToken"] != first["accessToken"]
    assert protected(client, second["accessToken"]).status_code == 200
    assert protected(client, first["accessToken"]).status_code == 200
    assert refresh(client, first["refreshToken"]).status_code == 401
    assert protected(client, first["accessToken"]).status_code == 401
    assert protected(client, second["accessToken"]).status_code == 401
    assert refresh(client, second["refreshToken"]).status_code == 401


def test_concurrent_rotation_has_only_one_success(client):
    pair = login(client).json()
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: refresh(client, pair["refreshToken"]), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 401]
    # Conservative replay policy: the loser revokes even the winner's token family.
    winner = next(response.json() for response in responses if response.status_code == 200)
    assert protected(client, winner["accessToken"]).status_code == 401


def test_logout_persists_revocation_and_isolates_other_login(client, repository):
    first = login(client).json()
    other = login(client, "bob@example.com").json()
    assert logout(client, first["accessToken"]).status_code == 204
    assert protected(client, first["accessToken"]).status_code == 401
    assert refresh(client, first["refreshToken"]).status_code == 401
    assert protected(client, other["accessToken"]).json() == {"userId": str(BOB)}
    assert refresh(client, other["refreshToken"]).status_code == 200
    if isinstance(repository, MemoryRepository):
        assert repository.revoked


def test_logout_only_revokes_current_family_for_same_member(client):
    first = login(client).json()
    other = login(client).json()
    assert logout(client, first["accessToken"]).status_code == 204
    assert protected(client, first["accessToken"]).status_code == 401
    assert refresh(client, first["refreshToken"]).status_code == 401
    assert protected(client, other["accessToken"]).status_code == 200
    assert refresh(client, other["refreshToken"]).status_code == 200


def test_signed_but_untracked_access_jti_cannot_authenticate(client):
    pair = login(client).json()
    claims = jwt.decode(
        pair["accessToken"],
        KEY,
        algorithms=["HS256"],
        issuer="aura-test-issuer",
        audience="aura-test-api",
    )
    token = jwt.encode({**claims, "jti": str(uuid4())}, KEY, algorithm="HS256")
    assert protected(client, token).status_code == 401


def test_consumed_expired_refresh_still_tracks_live_access_and_family_logout(client, repository):
    first = login(client).json()
    second = refresh(client, first["refreshToken"]).json()
    token_hash = hash_refresh_token(first["refreshToken"])
    if isinstance(repository, MemoryRepository):
        row = repository.refreshes[token_hash]
        assert row["consumed"]
        row["expires"] = datetime.now(UTC) - timedelta(seconds=1)
    else:
        with psycopg.connect(repository._dsn) as connection:
            connection.execute(
                sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
            )
            connection.execute(
                "UPDATE refresh_tokens SET created_at=now()-interval '2 days', "
                "expires_at=now()-interval '1 day' WHERE token_hash=%s",
                (token_hash,),
            )
    assert protected(client, first["accessToken"]).status_code == 200
    assert logout(client, first["accessToken"]).status_code == 204
    assert protected(client, first["accessToken"]).status_code == 401
    assert protected(client, second["accessToken"]).status_code == 401
    assert refresh(client, second["refreshToken"]).status_code == 401


@pytest.mark.parametrize("token", ["invalid", "r1_" + "a" * 64])
def test_invalid_refresh_is_rejected(client, token):
    assert refresh(client, token).status_code == 401


def test_token_purposes_cannot_be_confused(client):
    pair = login(client).json()
    assert refresh(client, pair["accessToken"]).status_code == 401
    assert protected(client, pair["refreshToken"]).status_code == 401


def test_expired_or_forged_access_is_rejected(client):
    pair = login(client).json()
    claims = jwt.decode(
        pair["accessToken"],
        KEY,
        algorithms=["HS256"],
        issuer="aura-test-issuer",
        audience="aura-test-api",
    )
    expired = jwt.encode({**claims, "exp": 0}, KEY, algorithm="HS256")
    forged = jwt.encode(claims, "wrong-key-012345678901234567890123456789", algorithm="HS256")
    assert protected(client, expired).status_code == 401
    assert protected(client, forged).status_code == 401


@pytest.mark.parametrize(
    "operation", ["find_user", "create_token_family", "rotate", "logout", "is_revoked"]
)
def test_storage_errors_never_report_success_or_leak_secrets(
    client, repository, monkeypatch, operation, caplog
):
    caplog.set_level(logging.DEBUG)
    pair = login(client).json()
    other_secret = "qa-bff-secret-0123456789abcdef0123456789"

    async def broken(*args, **kwargs):
        raise AuthStorageUnavailable(
            KEY
            + PASSWORD
            + pair["accessToken"]
            + pair["refreshToken"]
            + other_secret
            + "postgres://private"
        )

    monkeypatch.setattr(repository, operation, broken)
    if operation in {"find_user", "create_token_family"}:
        response = login(client)
    elif operation == "rotate":
        response = refresh(client, pair["refreshToken"])
    elif operation == "logout":
        response = logout(client, pair["accessToken"])
    else:
        response = protected(client, pair["accessToken"])
    assert response.status_code == (401 if operation == "is_revoked" else 503)
    for secret in (
        KEY,
        PASSWORD,
        pair["refreshToken"],
        pair["accessToken"],
        other_secret,
        "postgres://private",
    ):
        assert secret not in response.text
        assert secret not in caplog.text
    assert response.headers["x-request-id"]


@pytest.mark.parametrize("repository", ["memory"], indirect=True)
@pytest.mark.parametrize("email", ["alice@example.com", "missing@example.com"])
@pytest.mark.parametrize("password", ["private-\ud800", "private-\udfff", "x\ud800y\udfff"])
def test_unencodable_password_is_safe_validation_error(client, repository, email, password, caplog):
    caplog.set_level(logging.DEBUG)
    response = client.post(
        "/api/v1/auth/login",
        content=json.dumps({"email": email, "password": password}),
        headers={"Origin": ORIGIN, "Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.headers["x-request-id"]
    assert password not in response.text + caplog.text
    assert json.dumps(password)[1:-1] not in response.text + caplog.text
    assert not repository.families


@pytest.mark.parametrize("stored_hash", [None, PASSWORD_HASH])
@pytest.mark.parametrize("password", ["private-\ud800", "private-\udfff"])
def test_password_verifier_rejects_unencodable_input(stored_hash, password):
    assert check_password(stored_hash, password) is False


@pytest.mark.parametrize("repository", ["memory"], indirect=True)
@pytest.mark.parametrize("email", ["alice@example.com", "missing@example.com"])
def test_service_login_rejects_unencodable_password_without_http_validation(
    client, repository, email, caplog
):
    caplog.set_level(logging.DEBUG)
    password = "private-\ud800"

    async def run():
        with pytest.raises(AuthenticationRejected) as failure:
            await client.app.state.auth_service.login(email, password)
        assert password not in str(failure.value)

    anyio.run(run)
    assert password not in caplog.text
    assert not repository.families


@pytest.mark.parametrize("repository", ["memory"], indirect=True)
@pytest.mark.parametrize(
    "password", ["한국어-비밀번호123!", "emoji-🔐🌸123!", "special-!@#$%^&*()"]
)
def test_unicode_and_special_passwords_keep_argon2_login_contract(
    client, repository, password, caplog
):
    caplog.set_level(logging.DEBUG)
    repository.users["alice@example.com"] = replace(
        repository.users["alice@example.com"], password_hash=PASSWORD_HASHER.hash(password)
    )
    response = login(client, password=password)
    assert response.status_code == 200
    pair = response.json()
    assert protected(client, pair["accessToken"]).status_code == 200
    failure = login(client, password=password + "wrong")
    missing = login(client, email="missing@example.com", password=password)
    assert failure.status_code == missing.status_code == 401
    assert failure.json() == missing.json()
    assert password not in response.text + failure.text + missing.text + caplog.text


def test_refresh_expiry_revocation_and_account_disable(client, repository):
    pair = login(client).json()
    if isinstance(repository, MemoryRepository):
        repository.refreshes[hash_refresh_token(pair["refreshToken"])]["expires"] = datetime.now(
            UTC
        ) - timedelta(seconds=1)
    else:
        with psycopg.connect(repository._dsn) as connection:
            connection.execute(
                sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
            )
            connection.execute(
                "UPDATE refresh_tokens SET created_at=now()-interval '2 days', "
                "expires_at=now()-interval '1 day'"
            )
    assert refresh(client, pair["refreshToken"]).status_code == 401
    live = login(client).json()
    if isinstance(repository, MemoryRepository):
        repository.users["alice@example.com"] = replace(
            repository.users["alice@example.com"], is_active=False
        )
    else:
        with psycopg.connect(repository._dsn) as connection:
            connection.execute(
                sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
            )
            connection.execute("UPDATE users SET is_active=false WHERE id=%s", (ALICE,))
    assert protected(client, live["accessToken"]).status_code == 401
    assert refresh(client, live["refreshToken"]).status_code == 401


@pytest.mark.parametrize(
    "path,body",
    [
        ("login", {"email": "alice@example.com", "password": PASSWORD}),
        ("refresh", {"refreshToken": "r1_" + "a" * 64}),
    ],
)
def test_csrf_still_blocks_auth_mutations(client, path, body):
    response = client.post(
        "/api/v1/auth/" + path, json=body, headers={"Origin": "https://evil.test"}
    )
    assert response.status_code == 403


def test_default_app_fails_closed_without_storage_or_keys():
    app = create_app(
        Settings(
            _env_file=None,
            database_url=None,
            jwt_algorithm=None,
            jwt_signing_key=None,
            jwt_issuer=None,
            jwt_audience=None,
            csrf_allowed_origins=[ORIGIN],
        )
    )
    with TestClient(app) as client:
        assert login(client).status_code == 503
        assert refresh(client, "r1_" + "a" * 64).status_code == 503
        assert client.get("/health").status_code == 200


def test_invalid_stored_hash_is_not_a_plaintext_password_fallback(client, repository):
    if isinstance(repository, MemoryRepository):
        repository.users["alice@example.com"] = UserRecord(ALICE, PASSWORD, True)
    else:
        with psycopg.connect(repository._dsn) as connection:
            connection.execute(
                sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
            )
            connection.execute("UPDATE users SET password_hash=%s WHERE id=%s", (PASSWORD, ALICE))
    assert login(client).status_code == 401


def test_postgres_rotation_rolls_back_after_partial_writes(client, repository, monkeypatch):
    if isinstance(repository, MemoryRepository):
        pytest.skip("Requires explicitly approved PostgreSQL integration database")
    pair = login(client).json()
    original = repository._insert_tokens

    async def fail_after_inserts(connection, tokens):
        await original(connection, tokens)
        raise AuthStorageUnavailable()

    with monkeypatch.context() as patch:
        patch.setattr(repository, "_insert_tokens", fail_after_inserts)
        assert refresh(client, pair["refreshToken"]).status_code == 503
    assert refresh(client, pair["refreshToken"]).status_code == 200


def test_postgres_logout_rolls_back_after_partial_writes(client, repository, monkeypatch):
    if isinstance(repository, MemoryRepository):
        pytest.skip("Requires explicitly approved PostgreSQL integration database")
    pair = login(client).json()
    original = repository._revoke_family

    async def fail_after_revocation(connection, family_id):
        await original(connection, family_id)
        raise AuthStorageUnavailable()

    with monkeypatch.context() as patch:
        patch.setattr(repository, "_revoke_family", fail_after_revocation)
        assert logout(client, pair["accessToken"]).status_code == 503
    assert protected(client, pair["accessToken"]).status_code == 200
    assert refresh(client, pair["refreshToken"]).status_code == 200


def test_postgres_refresh_expiring_while_waiting_for_family_lock(client, repository, monkeypatch):
    if isinstance(repository, MemoryRepository):
        pytest.skip("Requires explicitly approved PostgreSQL integration database")
    pair = login(client).json()
    ready = threading.Event()
    original = repository._active_user

    async def signal_before_family_lock(connection, user_id):
        result = await original(connection, user_id)
        ready.set()
        return result

    with monkeypatch.context() as patch:
        patch.setattr(repository, "_active_user", signal_before_family_lock)
        with ThreadPoolExecutor(max_workers=1) as executor:
            with psycopg.connect(repository._dsn) as locker:
                locker.execute(
                    sql.SQL("SET LOCAL search_path TO {}").format(
                        sql.Identifier(repository._schema)
                    )
                )
                locker.execute("SELECT id FROM auth_token_families FOR UPDATE")
                pending = executor.submit(refresh, client, pair["refreshToken"])
                assert ready.wait(timeout=5)
                # The refresh transaction has already started, but cannot yet lock the family.
                locker.execute(
                    "UPDATE refresh_tokens SET expires_at=clock_timestamp()+interval '0.5 seconds'"
                )
                time.sleep(1)
            # Commit releases the lock after the token's expiration, before lock_timeout.
            assert pending.result(timeout=10).status_code == 401


def test_postgres_deleted_member_cannot_reuse_access_or_refresh(client, repository):
    """A removed member's previously issued credentials must not authenticate."""
    if isinstance(repository, MemoryRepository):
        pytest.skip("Requires explicitly approved PostgreSQL integration database")
    pair = login(client).json()
    assert protected(client, pair["accessToken"]).status_code == 200
    with psycopg.connect(repository._dsn) as connection:
        connection.execute(
            sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
        )
        connection.execute("DELETE FROM users WHERE id=%s", (ALICE,))
    assert protected(client, pair["accessToken"]).status_code == 401
    assert refresh(client, pair["refreshToken"]).status_code == 401


def test_postgres_refresh_logout_race_never_resurrects_session(client, repository):
    """Concurrent refresh/logout must not leave a usable token in that family."""
    if isinstance(repository, MemoryRepository):
        pytest.skip("Requires explicitly approved PostgreSQL integration database")
    pair = login(client).json()
    barrier = threading.Barrier(2)

    def do_refresh():
        barrier.wait(timeout=5)
        return refresh(client, pair["refreshToken"])

    def do_logout():
        barrier.wait(timeout=5)
        return logout(client, pair["accessToken"])

    with ThreadPoolExecutor(max_workers=2) as executor:
        refreshed_future = executor.submit(do_refresh)
        logout_future = executor.submit(do_logout)
        refreshed = refreshed_future.result(timeout=15)
        logged_out = logout_future.result(timeout=15)

    assert logged_out.status_code == 204
    assert refreshed.status_code in (200, 401)
    assert protected(client, pair["accessToken"]).status_code == 401
    assert refresh(client, pair["refreshToken"]).status_code == 401
    if refreshed.status_code == 200:
        successor = refreshed.json()
        assert protected(client, successor["accessToken"]).status_code == 401
        assert refresh(client, successor["refreshToken"]).status_code == 401


def test_postgres_commit_error_is_sanitized(monkeypatch):
    class CommitFailure:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            raise psycopg.OperationalError("postgres://user:private-password@db/test")

        async def execute(self, *args):
            pass

    async def connect(*args, **kwargs):
        return CommitFailure()

    monkeypatch.setattr(psycopg.AsyncConnection, "connect", connect)
    repository = PostgresAuthRepository("not-used", "issuer")

    async def operation():
        async with repository._connection(check_schema=False):
            pass

    with pytest.raises(AuthStorageUnavailable) as failure:
        anyio.run(operation)
    assert "private-password" not in str(failure.value)


def test_token_response_repr_hides_credentials_but_wire_contract_is_intact():
    response = TokenResponse(
        accessToken="private-access",
        refreshToken="private-refresh",
        expiresIn=300,
        refreshExpiresIn=600,
    )
    assert "private-access" not in repr(response)
    assert "private-refresh" not in repr(response)
    assert response.model_dump()["accessToken"] == "private-access"


@pytest.mark.parametrize("value", ["", "postgresql://localhost/", "sqlite:///auth.db"])
def test_implicit_or_non_postgres_database_configuration_is_rejected(value):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=value)


def test_registration_me_and_logout_share_the_production_jwt_contract(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "JWT customer", "email": "new@example.com", "password": PASSWORD},
        headers={"Origin": ORIGIN},
    )
    assert response.status_code == 201
    pair = response.json()
    assert set(pair) == {
        "accessToken",
        "refreshToken",
        "tokenType",
        "expiresIn",
        "refreshExpiresIn",
    }
    assert not response.cookies
    headers = {"Authorization": "Bearer " + pair["accessToken"]}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "new@example.com"
    assert me.json()["coupon"] is True
    assert me.json()["role"] == "member"
    assert "password_hash" not in me.text
    duplicate = client.post(
        "/api/v1/auth/register",
        json={"name": "JWT customer", "email": "NEW@example.com", "password": PASSWORD},
        headers={"Origin": ORIGIN},
    )
    assert duplicate.status_code == 409
    rotated = refresh(client, pair["refreshToken"])
    assert rotated.status_code == 200
    logout = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": "Bearer " + rotated.json()["accessToken"], "Origin": ORIGIN},
    )
    assert logout.status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert refresh(client, rotated.json()["refreshToken"]).status_code == 401


def test_me_never_authenticates_from_cookies_or_user_headers(client):
    pair = login(client).json()
    for headers in [
        {},
        {"Cookie": "aura_access=" + pair["accessToken"]},
        {"X-User-ID": str(ALICE), "X-Account-Owner": str(ALICE)},
    ]:
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
