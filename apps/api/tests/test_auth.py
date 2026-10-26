from concurrent.futures import ThreadPoolExecutor
from dataclasses import FrozenInstanceError
from typing import Annotated
from uuid import uuid4

import pytest
from fastapi import Depends, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from aura_api.config import Settings
from aura_api.core.auth import AuthenticatedUser, CurrentUser, get_session_verifier
from aura_api.core.authorization import ensure_resource_owner, require_permissions
from aura_api.main import create_app

ORIGIN = "https://mall.test"
KEY = "test-only-server-key-0123456789abcdef"
ALICE_TOKEN = "private-session-alice"
BOB_TOKEN = "private-session-bob"
LIMITED_TOKEN = "private-session-limited"


class FakeSessionVerifier:
    """Explicit test injection only; never imported by production code."""

    def __init__(self):
        self.calls = []

    async def verify_session(self, session_token):
        self.calls.append(session_token)
        return {
            ALICE_TOKEN: AuthenticatedUser("alice", frozenset({"example:read", "example:write"})),
            BOB_TOKEN: AuthenticatedUser("bob", frozenset({"example:read"})),
            LIMITED_TOKEN: AuthenticatedUser("limited"),
        }.get(session_token)


def build_test_app(cookie_name="aura_session"):
    app = create_app(
        Settings(
            _env_file=None,
            session_cookie_name=cookie_name,
            csrf_allowed_origins=[ORIGIN],
            bff_shared_key=KEY,
        )
    )

    @app.get("/test/me")
    async def me(user: CurrentUser):
        return {"userId": user.user_id}

    @app.post("/test/write")
    async def write(
        user: Annotated[
            AuthenticatedUser, Depends(require_permissions("example:read", "example:write"))
        ],
    ):
        return {"userId": user.user_id}

    @app.get("/test/resources/{resource_id}")
    async def resource(
        resource_id: str,
        user: Annotated[AuthenticatedUser, Depends(require_permissions("example:read"))],
    ):
        # A trusted in-test resource store, not request query/header ownership.
        owner_id = {"alice-resource": "alice", "bob-resource": "bob"}.get(resource_id)
        if owner_id is None:
            raise HTTPException(status_code=404)
        ensure_resource_owner(user, owner_id)
        return {"id": resource_id}

    return app


@pytest.fixture
def app():
    return build_test_app()


@pytest.fixture
def verifier():
    return FakeSessionVerifier()


@pytest.fixture
def client(app, verifier):
    app.dependency_overrides[get_session_verifier] = lambda: verifier
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-User-ID": "alice"},
        {"X-Session-Owner": "alice"},
        {"X-Request-ID": str(uuid4())},
        {"X-Aura-BFF-Key": KEY},
        {"Authorization": "Bearer " + ALICE_TOKEN},
        {"Cookie": "aura_session=" + ALICE_TOKEN},
        {"Cookie": "aura_session=" + BOB_TOKEN, "X-User-ID": "alice", "X-Session-Owner": "alice"},
    ],
)
def test_production_default_never_authenticates_even_plausible_sessions(app, headers):
    assert not app.dependency_overrides
    with TestClient(app) as client:
        response = client.get("/test/me", headers=headers)
    assert response.status_code == 401
    assert response.json() == {"error": {"code": "HTTP_401", "message": "인증이 필요합니다."}}


@pytest.mark.parametrize(
    "cookie",
    [None, "aura_session=", "aura_session=invalid-private-session", "other=" + ALICE_TOKEN],
)
def test_missing_empty_invalid_or_unrelated_session_is_unauthenticated(client, cookie):
    response = client.get("/test/me", headers={"Cookie": cookie} if cookie else {})
    assert response.status_code == 401
    assert "invalid-private-session" not in response.text


@pytest.mark.parametrize(
    "headers",
    [
        {"Cookie": f"aura_session={ALICE_TOKEN}; aura_session={BOB_TOKEN}"},
        {"Cookie": f"aura_session={ALICE_TOKEN}; aura_session ={BOB_TOKEN}"},
        [("Cookie", "aura_session=" + ALICE_TOKEN), ("Cookie", "aura_session=" + BOB_TOKEN)],
    ],
)
def test_duplicate_session_cookies_fail_closed_before_verifier(client, verifier, headers):
    response = client.get("/test/me", headers=headers)
    assert response.status_code == 401
    assert verifier.calls == []


@pytest.mark.parametrize(
    ("token", "status"), [(None, 401), (LIMITED_TOKEN, 403), (BOB_TOKEN, 403), (ALICE_TOKEN, 200)]
)
def test_authentication_and_all_required_permissions(client, token, status):
    request_id = str(uuid4())
    headers = {"Origin": ORIGIN, "X-Request-ID": request_id}
    if token:
        headers["Cookie"] = "aura_session=" + token
    response = client.post("/test/write", headers=headers)
    assert response.status_code == status
    assert response.headers["x-request-id"] == request_id
    assert response.headers["x-content-type-options"] == "nosniff"
    if status == 200:
        assert response.json() == {"userId": "alice"}
    else:
        message = "인증이 필요합니다." if status == 401 else "요청 권한이 없습니다."
        assert response.json() == {"error": {"code": f"HTTP_{status}", "message": message}}
    for secret in (ALICE_TOKEN, BOB_TOKEN, LIMITED_TOKEN, KEY):
        assert secret not in response.text


@pytest.mark.parametrize(
    ("token", "resource_id", "status"),
    [
        (ALICE_TOKEN, "alice-resource", 200),
        (ALICE_TOKEN, "bob-resource", 403),
        (BOB_TOKEN, "bob-resource", 200),
        (BOB_TOKEN, "alice-resource", 403),
        (LIMITED_TOKEN, "alice-resource", 403),
    ],
)
def test_resource_owner_is_checked_using_server_loaded_owner(client, token, resource_id, status):
    request_id = str(uuid4())
    response = client.get(
        f"/test/resources/{resource_id}?owner_user_id=alice",
        headers={
            "Cookie": "aura_session=" + token,
            "X-User-ID": "alice",
            "X-Session-Owner": "alice",
            "X-Request-ID": request_id,
        },
    )
    assert response.status_code == status
    assert response.headers["x-request-id"] == request_id
    if status == 403:
        assert response.json() == {
            "error": {"code": "HTTP_403", "message": "요청 권한이 없습니다."}
        }


def test_header_identity_never_replaces_verified_session_user(client, verifier):
    response = client.get(
        "/test/me?user_id=alice",
        headers={
            "Cookie": "aura_session=" + BOB_TOKEN,
            "X-User-ID": "alice",
            "X-Session-Owner": "alice",
            "X-Aura-BFF-Key": KEY,
        },
    )
    assert response.status_code == 200
    assert response.json() == {"userId": "bob"}
    assert verifier.calls == [BOB_TOKEN]


@pytest.mark.parametrize(
    "headers",
    [{}, {"Origin": "https://evil.test"}, {"Origin": ORIGIN, "Sec-Fetch-Site": "cross-site"}],
)
def test_valid_session_does_not_bypass_csrf(client, verifier, headers):
    request_id = str(uuid4())
    response = client.post(
        "/test/write",
        headers={**headers, "Cookie": "aura_session=" + ALICE_TOKEN, "X-Request-ID": request_id},
    )
    assert response.status_code == 403
    assert response.headers["x-request-id"] == request_id
    assert verifier.calls == []


def test_bff_server_key_passes_csrf_but_does_not_authenticate_user(app):
    with TestClient(app) as client:
        response = client.post("/test/write", headers={"X-Aura-BFF-Key": KEY})
    assert response.status_code == 401


def test_bff_shaped_call_authenticates_only_through_injected_session_verifier(client):
    response = client.post(
        "/test/write", headers={"X-Aura-BFF-Key": KEY, "Cookie": "aura_session=" + ALICE_TOKEN}
    )
    assert response.status_code == 200
    assert response.json() == {"userId": "alice"}


@pytest.mark.parametrize("bad_result", [False, True])
def test_verifier_failure_or_invalid_result_never_authenticates_or_leaks_secrets(app, bad_result):
    class BrokenVerifier:
        async def verify_session(self, session_token):
            if bad_result:
                return {"user_id": "alice"}
            raise RuntimeError(session_token + " postgres://private password=private")

    app.dependency_overrides[get_session_verifier] = BrokenVerifier
    request_id = str(uuid4())
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            "/test/me",
            headers={"Cookie": "aura_session=" + ALICE_TOKEN, "X-Request-ID": request_id},
        )
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "요청을 처리하지 못했어요."}
    }
    assert response.headers["x-request-id"] == request_id
    assert ALICE_TOKEN not in response.text
    assert "private" not in response.text


def test_configured_cookie_name_and_unrelated_cookies(verifier):
    app = build_test_app(cookie_name="custom_session")
    app.dependency_overrides[get_session_verifier] = lambda: verifier
    with TestClient(app) as client:
        assert (
            client.get("/test/me", headers={"Cookie": "aura_session=" + ALICE_TOKEN}).status_code
            == 401
        )
        response = client.get(
            "/test/me", headers={"Cookie": f"analytics=private; custom_session={ALICE_TOKEN}"}
        )
    assert response.status_code == 200
    assert verifier.calls == [ALICE_TOKEN]


def test_identities_do_not_leak_between_concurrent_requests(client):
    def send(token):
        response = client.get("/test/me", headers={"Cookie": "aura_session=" + token})
        assert response.status_code == 200
        return response.json()["userId"]

    tokens = [ALICE_TOKEN, BOB_TOKEN] * 8
    with ThreadPoolExecutor(max_workers=8) as executor:
        assert list(executor.map(send, tokens)) == ["alice", "bob"] * 8
    assert client.get("/test/me").status_code == 401


def test_verified_user_is_immutable_and_permissions_are_not_shared():
    user = AuthenticatedUser("alice", frozenset({"example:read"}))
    with pytest.raises(FrozenInstanceError):
        user.user_id = "bob"
    assert AuthenticatedUser("bob").permissions == frozenset()


@pytest.mark.parametrize("cookie_name", ["", "session cookie", "session;admin", "session=secret"])
def test_invalid_cookie_configuration_is_rejected(cookie_name):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, session_cookie_name=cookie_name)


def test_production_app_has_no_test_routes_or_authentication_overrides():
    app = create_app(Settings(_env_file=None))
    assert app.dependency_overrides == {}
    with TestClient(app) as client:
        assert set(client.get("/openapi.json").json()["paths"]) == {"/api/v1/health"}
        assert client.get("/test/me").status_code == 404
