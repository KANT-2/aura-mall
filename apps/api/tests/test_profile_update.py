"""CRA-31 profile contract; reuse the existing lifecycle client/storage fixtures."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import jwt
import psycopg
import pytest
from psycopg import sql
from test_lifecycle import (
    ALICE,
    KEY,
    ORIGIN,
    MemoryRepository,
    login,
)
from test_lifecycle import (
    client as client,
)
from test_lifecycle import (
    repository as repository,
)

from aura_api.identity.repository import AuthStorageUnavailable


@pytest.fixture(autouse=True)
def mutable_test_profiles(repository, monkeypatch):
    if not isinstance(repository, MemoryRepository):
        return
    original = repository.profile
    changes = {}

    async def profile(user_id):
        result = await original(user_id)
        return {**result, **changes.get(user_id, {})} if result is not None else None

    async def update_profile(user_id, *, name=None, marketing=None):
        with repository.lock:
            if not repository.active(user_id):
                return None
            values = changes.setdefault(user_id, {})
            if name is not None:
                values["name"] = name
            if marketing is not None:
                values["marketing"] = marketing
            return await profile(user_id)

    monkeypatch.setattr(repository, "profile", profile)
    monkeypatch.setattr(repository, "update_profile", update_profile, raising=False)


def patch(client, token, body):
    return client.patch(
        "/api/v1/auth/me",
        content=json.dumps(body),
        headers={
            "Origin": ORIGIN,
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )


def profile(client, token):
    return client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})


@pytest.mark.parametrize(
    "changes",
    [
        {"name": "  새 이름 🔐  "},
        {"marketing": True},
        {"name": "새 이름", "marketing": True},
    ],
)
def test_patch_preserves_omitted_fields_and_is_visible_to_get(client, changes):
    pair = login(client).json()
    token = pair["accessToken"]
    before = profile(client, token).json()
    response = patch(client, token, changes)
    assert response.status_code == 200
    expected = {**before, **changes}
    if "name" in changes:
        expected["name"] = changes["name"].strip()
    assert response.json() == expected
    assert profile(client, token).json() == expected
    assert response.headers["x-request-id"]
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"]
    assert token not in response.text
    assert pair["refreshToken"] not in response.text
    assert "password_hash" not in response.text


def test_false_marketing_and_distinct_member_are_preserved(client):
    alice = login(client).json()["accessToken"]
    bob = login(client, "bob@example.com").json()["accessToken"]
    bob_before = profile(client, bob).json()
    assert patch(client, alice, {"name": "Alice", "marketing": True}).status_code == 200
    response = patch(client, alice, {"marketing": False})
    assert response.status_code == 200
    assert response.json()["marketing"] is False
    assert response.json()["name"] == "Alice"
    assert profile(client, bob).json() == bob_before


def test_concurrent_disjoint_patches_preserve_both_fields(client):
    token = login(client).json()["accessToken"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(
                lambda changes: patch(client, token, changes),
                [{"name": "Concurrent name"}, {"marketing": True}],
            )
        )
    assert [response.status_code for response in responses] == [200, 200]
    result = profile(client, token).json()
    assert result["name"] == "Concurrent name"
    assert result["marketing"] is True


@pytest.mark.parametrize("repository", ["memory"], indirect=True)
@pytest.mark.parametrize(
    "body,status",
    [
        ({}, 422),
        (None, 422),
        ([], 422),
        ({"name": None}, 422),
        ({"marketing": None}, 422),
        ({"name": 123}, 422),
        ({"marketing": 1}, 422),
        ({"marketing": "false"}, 422),
        ({"name": "   "}, 400),
        ({"name": ""}, 400),
        ({"name": "가" * 101}, 400),
        ({"name": "private-\ud800"}, 422),
        ({"name": "private\x00"}, 422),
        ({"email": "other@example.com"}, 422),
        ({"id": "other"}, 422),
        ({"role": "admin"}, 422),
        ({"coupon": True}, 422),
        ({"is_active": False}, 422),
        ({"name": "valid", "userId": "other"}, 422),
        ({"name": "valid", "marketing": "true"}, 422),
    ],
)
def test_invalid_patch_never_partially_changes_profile(client, body, status):
    token = login(client).json()["accessToken"]
    before = profile(client, token).json()
    response = patch(client, token, body)
    assert response.status_code == status
    assert "error" in response.json()
    assert profile(client, token).json() == before


@pytest.mark.parametrize("repository", ["memory"], indirect=True)
@pytest.mark.parametrize("kind", ["missing", "forged", "expired", "revoked"])
def test_authentication_is_required_for_patch(client, kind):
    token = login(client).json()["accessToken"]
    before = profile(client, token).json()
    if kind == "missing":
        token = ""
    elif kind == "forged":
        token = token.rsplit(".", 1)[0] + ".forged"
    elif kind == "expired":
        claims = jwt.decode(
            token, KEY, algorithms=["HS256"], issuer="aura-test-issuer", audience="aura-test-api"
        )
        token = jwt.encode({**claims, "exp": 0}, KEY, algorithm="HS256")
    else:
        assert (
            client.post(
                "/api/v1/auth/logout",
                headers={
                    "Origin": ORIGIN,
                    "Authorization": f"Bearer {token}",
                },
            ).status_code
            == 204
        )
    assert patch(client, token, {"name": "unauthorized"}).status_code == 401
    fresh = login(client).json()["accessToken"]
    assert profile(client, fresh).json() == before


@pytest.mark.parametrize("repository", ["memory"], indirect=True)
@pytest.mark.parametrize("state", ["disabled", "deleted"])
def test_disabled_or_deleted_member_is_rechecked_at_write(client, repository, monkeypatch, state):
    token = login(client).json()["accessToken"]
    original = repository.update_profile

    async def deactivate_then_write(user_id, **changes):
        if state == "deleted":
            repository.users.pop("alice@example.com")
        else:
            repository.users["alice@example.com"] = replace(
                repository.users["alice@example.com"],
                is_active=False,
            )
        return await original(user_id, **changes)

    monkeypatch.setattr(repository, "update_profile", deactivate_then_write)
    assert patch(client, token, {"name": "blocked"}).status_code == 401


@pytest.mark.parametrize("repository", ["memory"], indirect=True)
def test_storage_failure_is_safe_and_csrf_is_preserved(client, repository, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    pair = login(client).json()
    token = pair["accessToken"]
    before = profile(client, token).json()
    response = client.patch(
        "/api/v1/auth/me",
        json={"name": "blocked"},
        headers={
            "Origin": "https://attacker.test",
            "Authorization": f"Bearer {token}",
        },
    )
    assert response.status_code == 403

    async def unavailable(*args, **kwargs):
        raise AuthStorageUnavailable(KEY + token + pair["refreshToken"] + "private-password")

    monkeypatch.setattr(repository, "update_profile", unavailable)
    response = patch(client, token, {"name": "not saved"})
    assert response.status_code == 503
    assert response.headers["x-request-id"]
    for secret in (KEY, token, pair["refreshToken"], "private-password"):
        assert secret not in response.text + caplog.text
    assert profile(client, token).json() == before


def test_postgres_profile_read_failure_rolls_back_update(client, repository, monkeypatch):
    if isinstance(repository, MemoryRepository):
        pytest.skip("Requires approved dedicated PostgreSQL test database")
    token = login(client).json()["accessToken"]
    before = profile(client, token).json()

    async def read_failure(*args):
        raise AuthStorageUnavailable()

    with monkeypatch.context() as changes:
        changes.setattr(repository, "_profile", read_failure)
        assert patch(client, token, {"name": "must rollback", "marketing": True}).status_code == 503
    assert profile(client, token).json() == before


def test_postgres_inactive_member_cannot_be_updated(client, repository):
    if isinstance(repository, MemoryRepository):
        pytest.skip("Requires approved dedicated PostgreSQL test database")
    token = login(client).json()["accessToken"]
    with psycopg.connect(repository._dsn) as connection:
        connection.execute(
            sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
        )
        connection.execute("UPDATE users SET is_active=false WHERE id=%s", (ALICE,))
    assert patch(client, token, {"name": "blocked"}).status_code == 401
