"""Draft HTTP/service rules with isolated repository adapters; no real DB is required."""

import time
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
from aura_api.core.revocation import get_token_revocation_store
from aura_api.domain.catalog import Ingredient
from aura_api.infra.database import get_session
from aura_api.infra.repositories import catalog, drafts, users
from aura_api.main import create_app

ORIGIN = "http://localhost:3000"
KEY = "draft-test-signing-key-0123456789abcdef"
PATH = "/api/v1/atelier/draft"
BODY = {"counts": {"rose": 2}, "name": "오후", "label": "paper", "step": "select"}


class Session:
    @asynccontextmanager
    async def begin(self):
        yield

    async def rollback(self):
        pass


class Revocations:
    async def is_revoked(self, **kwargs):
        return False


@pytest.fixture
def client(monkeypatch):
    saved = {}

    async def session():
        yield Session()

    async def get(_, guest):
        return saved.get(guest)

    async def save(_, guest, draft):
        saved[guest] = draft
        return draft

    async def delete(_, guest):
        saved.pop(guest, None)

    async def rules(_):
        return SimpleNamespace(
            ingredients={"rose": Ingredient("rose", "장미", "middle", "#ffaaaa")}
        )

    async def member_exists(_, member):
        return True

    monkeypatch.setattr(drafts, "get_draft", get)
    monkeypatch.setattr(drafts, "save_draft", save)
    monkeypatch.setattr(drafts, "delete_draft", delete)
    monkeypatch.setattr(catalog, "load_rule_catalog", rules)
    monkeypatch.setattr(users, "member_exists", member_exists)
    app = create_app(
        Settings(
            _env_file=None,
            database_url=None,
            csrf_allowed_origins=[ORIGIN],
            jwt_algorithm="HS256",
            jwt_signing_key=KEY,
            jwt_issuer="draft-test",
            jwt_audience="aura-web",
        )
    )
    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_token_revocation_store] = Revocations
    with TestClient(app, headers={"Origin": ORIGIN, "X-Guest-ID": str(uuid.uuid4())}) as client:
        yield client


def token(*, admin=False):
    return jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "jti": str(uuid.uuid4()),
            "iat": int(time.time()),
            "exp": int(time.time()) + 600,
            "iss": "draft-test",
            "aud": "aura-web",
            "principal_type": "admin" if admin else "member",
            "permissions": ["admin"] if admin else [],
        },
        KEY,
        algorithm="HS256",
    )


def test_draft_lifecycle_is_isolated_by_visitor_and_survives_member_changes(client):
    assert client.get(PATH).json() is None
    response = client.put(PATH, json=BODY)
    assert response.status_code == 200
    assert response.json() == BODY
    assert client.get(PATH, headers={"Authorization": f"Bearer {token()}"}).json() == BODY
    other = {"X-Guest-ID": str(uuid.uuid4())}
    assert client.get(PATH, headers=other).json() is None
    assert client.delete(PATH, headers=other).json() is None
    assert client.get(PATH).json() == BODY
    changed = {**BODY, "counts": {"rose": 3}, "step": "result"}
    assert client.put(PATH, json=changed).json() == changed
    assert client.delete(PATH).status_code == 200
    assert client.delete(PATH).json() is None
    assert client.get(PATH).json() is None


@pytest.mark.parametrize(
    "guest", ["", "not-a-uuid", str(uuid.uuid1()), "00000000-0000-0000-0000-000000000000"]
)
def test_guest_id_must_be_a_single_uuid_v4(client, guest):
    response = client.get(PATH, headers={"X-Guest-ID": guest})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "DRAFT_GUEST_INVALID"


def test_duplicate_or_missing_guest_header_is_rejected(client):
    client.headers.pop("x-guest-id")
    assert client.get(PATH).status_code == 400
    assert (
        client.get(
            PATH, headers=[("X-Guest-ID", str(uuid.uuid4())), ("X-Guest-ID", str(uuid.uuid4()))]
        ).status_code
        == 400
    )


@pytest.mark.parametrize(
    "counts,status",
    [
        ({}, 400),
        ({"unknown": 1}, 400),
        ({"rose": -1}, 400),
        ({"rose": 21}, 400),
        ({"rose": True}, 422),
        ({"rose": "2"}, 422),
    ],
)
def test_bad_drafts_never_replace_the_previous_composition(client, counts, status):
    assert client.put(PATH, json=BODY).status_code == 200
    response = client.put(PATH, json={**BODY, "counts": counts})
    assert response.status_code == status
    assert "error" in response.json()
    assert client.get(PATH).json() == BODY


def test_owner_authentication_and_csrf_boundaries(client):
    assert client.put(PATH, json={**BODY, "guestId": str(uuid.uuid4())}).status_code == 422
    assert (
        client.put(PATH, json=BODY, headers={"Origin": "https://attacker.invalid"}).status_code
        == 403
    )
    assert (
        client.get(PATH, headers={"Authorization": "Bearer invalid.jwt.token"}).status_code == 401
    )
    assert (
        client.get(PATH, headers={"Authorization": f"Bearer {token(admin=True)}"}).status_code
        == 401
    )
    assert (
        client.put(PATH, json=BODY, headers={"X-Account-Owner": str(uuid.uuid4())}).status_code
        == 409
    )
    assert client.get(PATH).json() is None
