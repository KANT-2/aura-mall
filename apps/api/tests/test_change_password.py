"""CRA-33: use existing lifecycle fixtures; PostgreSQL gets a disposable schema only."""

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from uuid import uuid4

import anyio
import psycopg
import pytest
from psycopg import sql
from test_lifecycle import (
    ALICE,
    KEY,
    ORIGIN,
    PASSWORD,
    MemoryRepository,
    login,
    logout,
    protected,
    refresh,
)
from test_lifecycle import client as client
from test_lifecycle import repository as repository

from aura_api.api.auth import ChangePasswordInput
from aura_api.domain.errors import InvalidInput
from aura_api.identity.repository import AuthStorageUnavailable
from aura_api.identity.tokens import issue_admin_access

NEW_PASSWORD = "  새 비밀번호🔒!  "


def change(client, token, current=PASSWORD, new=NEW_PASSWORD, *, body=None):
    return client.post(
        "/api/v1/auth/change-password",
        content=json.dumps(
            body
            if body is not None
            else {
                "currentPassword": current,
                "newPassword": new,
            }
        ),
        headers={
            "Origin": ORIGIN,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Request-ID": "da553dd1-544a-48a3-970c-4171489855da",
        },
    )


def test_change_revokes_all_devices_preserves_other_member_and_profile(client):
    first, second = login(client).json(), login(client).json()
    bob = login(client, "bob@example.com").json()
    old_rotated = refresh(client, second["refreshToken"]).json()
    before = client.get(
        "/api/v1/auth/me",
        headers={
            "Authorization": "Bearer " + first["accessToken"],
        },
    ).json()
    response = change(client, first["accessToken"])
    assert response.status_code == 204
    assert response.content == b""
    assert "set-cookie" not in response.headers
    assert response.headers["x-request-id"] == "da553dd1-544a-48a3-970c-4171489855da"
    assert response.headers["x-content-type-options"] == "nosniff"
    for pair in (first, second, old_rotated):
        assert protected(client, pair["accessToken"]).status_code == 401
        assert refresh(client, pair["refreshToken"]).status_code == 401
    assert protected(client, bob["accessToken"]).status_code == 200
    assert refresh(client, bob["refreshToken"]).status_code == 200
    assert login(client).status_code == 401
    assert login(client, password=NEW_PASSWORD.strip()).status_code == 401
    new = login(client, password=NEW_PASSWORD)
    assert new.status_code == 200
    assert (
        client.get(
            "/api/v1/auth/me",
            headers={
                "Authorization": "Bearer " + new.json()["accessToken"],
            },
        ).json()
        == before
    )


def test_wrong_current_password_is_400_without_changing_tokens(client):
    pair = login(client).json()
    response = change(client, pair["accessToken"], current="incorrect-current-password")
    assert response.status_code == 400
    assert response.json() == {
        "error": {
            "code": "CURRENT_PASSWORD_INVALID",
            "message": "현재 비밀번호를 확인해 주세요.",
        }
    }
    assert protected(client, pair["accessToken"]).status_code == 200
    assert login(client).status_code == 200
    assert login(client, password=NEW_PASSWORD).status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"currentPassword": PASSWORD},
        {"newPassword": NEW_PASSWORD},
        {"currentPassword": None, "newPassword": NEW_PASSWORD},
        {"currentPassword": PASSWORD, "newPassword": None},
        {"currentPassword": 123, "newPassword": NEW_PASSWORD},
        {"currentPassword": PASSWORD, "newPassword": True},
        {"currentPassword": "", "newPassword": NEW_PASSWORD},
        {"currentPassword": PASSWORD, "newPassword": "a" * 7},
        {"currentPassword": PASSWORD, "newPassword": "a" * 257},
        {"currentPassword": "a" * 257, "newPassword": NEW_PASSWORD},
        {"currentPassword": PASSWORD, "newPassword": "bad\ud800input"},
        {"currentPassword": "\ud800", "newPassword": NEW_PASSWORD},
        {"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD, "userId": str(uuid4())},
    ],
)
def test_invalid_input_is_private_422_and_preserves_login(client, body):
    pair = login(client).json()
    response = change(client, pair["accessToken"], body=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert PASSWORD not in response.text
    assert NEW_PASSWORD not in response.text
    assert protected(client, pair["accessToken"]).status_code == 200


@pytest.mark.parametrize("new", ["a" * 8, "가" * 256, "  🔒🔒🔒🔒🔒🔒  "])
def test_password_policy_boundaries_and_unicode_are_preserved(client, new):
    pair = login(client).json()
    assert change(client, pair["accessToken"], new=new).status_code == 204
    assert login(client, password=new).status_code == 200


def test_missing_and_revoked_bearer_and_csrf_block_before_change(client):
    pair = login(client).json()
    assert change(client, "").status_code == 401
    response = client.post(
        "/api/v1/auth/change-password",
        json={
            "currentPassword": PASSWORD,
            "newPassword": NEW_PASSWORD,
        },
        headers={"Origin": "https://evil.test", "Authorization": "Bearer " + pair["accessToken"]},
    )
    assert response.status_code == 403
    assert logout(client, pair["accessToken"]).status_code == 204
    assert change(client, pair["accessToken"]).status_code == 401
    assert login(client).status_code == 200


@pytest.mark.parametrize("operation", ["find_user_by_id", "change_password"])
def test_storage_failures_are_private_and_never_success(
    client, repository, monkeypatch, caplog, operation
):
    pair = login(client).json()
    secret = "private-storage-message-password-jwt-secret"

    async def broken(*args, **kwargs):
        raise AuthStorageUnavailable(secret)

    monkeypatch.setattr(repository, operation, broken)
    with caplog.at_level(logging.DEBUG):
        response = change(client, pair["accessToken"])
    assert response.status_code == 503
    for value in (secret, PASSWORD, NEW_PASSWORD, pair["accessToken"], pair["refreshToken"], KEY):
        assert value not in response.text + caplog.text
    assert protected(client, pair["accessToken"]).status_code == 200


def test_verified_old_login_cannot_save_after_password_change(client, repository, monkeypatch):
    pair = login(client).json()
    reached, resume = threading.Event(), threading.Event()
    original = repository.create_token_family

    async def paused(tokens, *, expected_password_hash):
        reached.set()
        assert await anyio.to_thread.run_sync(resume.wait, 10)
        return await original(tokens, expected_password_hash=expected_password_hash)

    monkeypatch.setattr(repository, "create_token_family", paused)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(login, client)
        try:
            assert reached.wait(10)
            assert change(client, pair["accessToken"]).status_code == 204
        finally:
            resume.set()
        assert pending.result(timeout=15).status_code == 401
    monkeypatch.setattr(repository, "create_token_family", original)
    assert login(client, password=NEW_PASSWORD).status_code == 200


def test_refresh_racing_change_leaves_no_old_valid_tokens(client):
    pair = login(client).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        rotation = pool.submit(refresh, client, pair["refreshToken"])
        update = pool.submit(change, client, pair["accessToken"])
        rotated, changed = rotation.result(timeout=20), update.result(timeout=20)
    assert changed.status_code == 204
    assert rotated.status_code in (200, 401)
    if rotated.status_code == 200:
        assert protected(client, rotated.json()["accessToken"]).status_code == 401
        assert refresh(client, rotated.json()["refreshToken"]).status_code == 401
    assert protected(client, pair["accessToken"]).status_code == 401
    assert login(client, password=NEW_PASSWORD).status_code == 200


def test_concurrent_changes_accept_at_most_one_old_password(client):
    pair = login(client).json()
    passwords = ["new-password-one", "new-password-two"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(lambda value: change(client, pair["accessToken"], new=value), passwords)
        )
    assert sum(response.status_code == 204 for response in responses) == 1
    assert {response.status_code for response in responses} <= {204, 400, 401}
    for password, response in zip(passwords, responses, strict=True):
        assert login(client, password=password).status_code == (
            200 if response.status_code == 204 else 401
        )


def test_user_disappearing_or_disabled_after_verification_is_rejected(
    client, repository, monkeypatch
):
    pair = login(client).json()

    async def unavailable(user_id):
        return None

    monkeypatch.setattr(repository, "find_user_by_id", unavailable)
    assert change(client, pair["accessToken"]).status_code == 401


def test_service_rejects_invalid_password_without_touching_storage(client):
    service = client.app.state.auth_service
    for current, new in [(PASSWORD, "\ud800" * 8), ("\ud800", NEW_PASSWORD), (PASSWORD, "short")]:
        with pytest.raises(InvalidInput):
            client.portal.call(service.change_password, str(ALICE), current, new)
    assert PASSWORD not in repr(
        ChangePasswordInput(currentPassword=PASSWORD, newPassword=NEW_PASSWORD)
    )


def test_postgres_partial_revocation_rolls_back_password_and_all_families(
    client, repository, monkeypatch
):
    if isinstance(repository, MemoryRepository):
        pytest.skip("PostgreSQL transaction rollback requires the dedicated test DB")
    first, second = login(client).json(), login(client).json()
    original = repository._revoke_family

    async def fail_after_write(connection, family_id):
        await original(connection, family_id)
        raise AuthStorageUnavailable("simulated private failure after revocation")

    monkeypatch.setattr(repository, "_revoke_family", fail_after_write)
    assert change(client, first["accessToken"]).status_code == 503
    for pair in (first, second):
        assert protected(client, pair["accessToken"]).status_code == 200
        assert refresh(client, pair["refreshToken"]).status_code == 200
    assert login(client).status_code == 200
    assert login(client, password=NEW_PASSWORD).status_code == 401


def test_postgres_admin_session_with_shared_uuid_is_untouched(client, repository):
    if isinstance(repository, MemoryRepository):
        pytest.skip("Actual admin_sessions persistence requires the dedicated test DB")
    admin = issue_admin_access(client.app.state.auth_service.settings, ALICE)
    with psycopg.connect(repository._dsn) as connection:
        connection.execute(
            sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
        )
        connection.execute(
            "INSERT INTO admins (id,status) VALUES (%s,'active')",
            (ALICE,),
        )
        connection.execute(
            "INSERT INTO admin_sessions (jti,admin_id,expires_at) VALUES (%s,%s,%s)",
            (admin.jti, ALICE, admin.expires_at),
        )
    pair = login(client).json()
    assert change(client, admin.access_token).status_code == 401
    assert change(client, pair["accessToken"]).status_code == 204
    assert protected(client, admin.access_token).status_code == 200


def test_inactive_member_is_rejected(client, repository):
    pair = login(client).json()
    if isinstance(repository, MemoryRepository):
        repository.users["alice@example.com"] = replace(
            repository.users["alice@example.com"], is_active=False
        )
    else:
        with psycopg.connect(repository._dsn) as connection:
            connection.execute(
                sql.SQL("UPDATE {}.users SET is_active=false WHERE id=%s").format(
                    sql.Identifier(repository._schema)
                ),
                (ALICE,),
            )
    assert change(client, pair["accessToken"]).status_code == 401


def test_postgres_login_and_refresh_waiting_on_change_cannot_escape_revocation(
    client, repository, monkeypatch
):
    if isinstance(repository, MemoryRepository):
        pytest.skip("PostgreSQL row-lock ordering requires the dedicated test DB")
    pair = login(client).json()
    changing, resume = threading.Event(), threading.Event()
    saving_login, refreshing = threading.Event(), threading.Event()
    original_revoke = repository._revoke_family
    original_save = repository.create_token_family
    original_active = repository._active_user

    async def paused_revoke(connection, family_id):
        await original_revoke(connection, family_id)
        changing.set()
        assert await anyio.to_thread.run_sync(resume.wait, 10)

    async def observed_save(tokens, *, expected_password_hash):
        saving_login.set()
        return await original_save(tokens, expected_password_hash=expected_password_hash)

    async def observed_active(connection, user_id):
        refreshing.set()
        return await original_active(connection, user_id)

    monkeypatch.setattr(repository, "_revoke_family", paused_revoke)
    monkeypatch.setattr(repository, "create_token_family", observed_save)
    monkeypatch.setattr(repository, "_active_user", observed_active)
    with ThreadPoolExecutor(max_workers=3) as pool:
        update = pool.submit(change, client, pair["accessToken"])
        try:
            assert changing.wait(10)
            pending_login = pool.submit(login, client)
            pending_refresh = pool.submit(refresh, client, pair["refreshToken"])
            assert saving_login.wait(10)
            assert refreshing.wait(10)
        finally:
            resume.set()
        assert update.result(timeout=15).status_code == 204
        assert pending_login.result(timeout=15).status_code == 401
        assert pending_refresh.result(timeout=15).status_code == 401
    assert protected(client, pair["accessToken"]).status_code == 401
