import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import FrozenInstanceError
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import uuid4

import jwt
import pytest
from fastapi import Depends, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from aura_api.config import Settings
from aura_api.core.auth import AuthenticatedUser, CurrentUser
from aura_api.core.authorization import ensure_resource_owner, require_permissions
from aura_api.core.revocation import get_token_revocation_store
from aura_api.main import create_app

ORIGIN = "https://mall.test"
BFF_KEY = "test-only-bff-key-0123456789abcdef"
JWT_KEY = "test-only-jwt-key-0123456789abcdef" * 2
ISSUER = "https://issuer.test"
AUDIENCE = "aura-api-test"


def claims_for(user_id="alice", permissions=None):
    return {
        "sub": user_id,
        "iss": ISSUER,
        "aud": AUDIENCE,
        "jti": str(uuid4()),
        "iat": int(datetime.now(UTC).timestamp()),
        "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
        "permissions": permissions
        if permissions is not None
        else ["example:read", "example:write"],
    }


def signed_token(user_id="alice", permissions=None):
    return jwt.encode(claims_for(user_id, permissions), JWT_KEY, algorithm="HS256")


def build_test_app(configured=True):
    app = create_app(
        Settings(
            _env_file=None,
            csrf_allowed_origins=[ORIGIN],
            bff_shared_key=BFF_KEY,
            jwt_algorithm="HS256" if configured else None,
            jwt_signing_key=JWT_KEY if configured else None,
            jwt_issuer=ISSUER if configured else None,
            jwt_audience=AUDIENCE if configured else None,
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
        owner_id = {"alice-resource": "alice", "bob-resource": "bob"}.get(resource_id)
        if owner_id is None:
            raise HTTPException(status_code=404)
        ensure_resource_owner(user, owner_id)
        return {"id": resource_id}

    return app


@pytest.fixture
def revocations():
    return FakeRevocationStore()


class FakeRevocationStore:
    """Test-only storage substitute; not imported or registered by the production app."""

    def __init__(self):
        self.revoked = set()
        self.calls = []

    async def is_revoked(self, *, issuer, jti):
        self.calls.append((issuer, jti))
        return (issuer, jti) in self.revoked


@pytest.fixture
def client(revocations):
    # Actual PyJWT verification using test-only keys, not an overridden verifier.
    app = build_test_app()
    app.dependency_overrides[get_token_revocation_store] = lambda: revocations
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def assert_401(response, token=None, request_id=None):
    assert response.status_code == 401
    assert response.json() == {"error": {"code": "HTTP_401", "message": "인증이 필요합니다."}}
    assert response.headers["www-authenticate"] == "Bearer"
    if request_id:
        assert response.headers["x-request-id"] == request_id
    assert JWT_KEY not in response.text
    assert BFF_KEY not in response.text
    if token:
        assert token not in response.text


@pytest.mark.parametrize("scheme", ["Bearer", "bearer", "BEARER"])
def test_verified_subject_cannot_be_overridden_by_headers(client, scheme):
    token = signed_token("bob")
    request_id = str(uuid4())
    response = client.get(
        "/test/me?user_id=alice",
        headers={
            "Authorization": f"{scheme} {token}",
            "X-User-ID": "alice",
            "X-Account-Owner": "alice",
            "X-Aura-BFF-Key": BFF_KEY,
            "X-Request-ID": request_id,
        },
    )
    assert response.status_code == 200
    assert response.json() == {"userId": "bob"}
    assert response.headers["x-request-id"] == request_id
    assert token not in response.text
    assert JWT_KEY not in response.text


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-User-ID": "alice"},
        {"X-Account-Owner": "alice"},
        {"X-Aura-BFF-Key": BFF_KEY},
        {"X-Request-ID": str(uuid4())},
        {"Cookie": "aura_session=" + signed_token()},
        {"Authorization": "Basic private"},
        {"Authorization": "Bearer"},
        {"Authorization": "Bearer "},
    ],
)
def test_missing_bearer_and_spoofed_identity_cannot_authenticate(client, headers):
    assert_401(client.get("/test/me", headers=headers))


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        "a.b",
        "a.b.c",
        "a.b.c.d",
        "a.b.",
        "a b.c.d",
        "a" * 8193,
        signed_token() + ", " + signed_token(),
    ],
)
def test_malformed_tokens_return_safe_401(client, token):
    request_id = str(uuid4())
    response = client.get(
        "/test/me", headers={"Authorization": "Bearer " + token, "X-Request-ID": request_id}
    )
    assert_401(response, token, request_id)


def test_duplicate_authorization_is_rejected(client):
    token = signed_token()
    response = client.get(
        "/test/me",
        headers=[("Authorization", "Bearer " + token), ("Authorization", "Bearer " + token)],
    )
    assert_401(response, token)


@pytest.mark.parametrize("algorithm", ["HS512", "none"])
def test_wrong_or_unsigned_algorithm_is_rejected(client, algorithm):
    token = jwt.encode(claims_for(), JWT_KEY if algorithm != "none" else None, algorithm=algorithm)
    assert_401(client.get("/test/me", headers={"Authorization": "Bearer " + token}), token)


def test_forged_signature_is_rejected(client):
    token = jwt.encode(
        claims_for("admin"), "attacker-secret-key-0123456789abcdef", algorithm="HS256"
    )
    assert_401(client.get("/test/me", headers={"Authorization": "Bearer " + token}), token)


@pytest.mark.parametrize("name", ["exp", "iss", "aud", "sub", "jti", "iat"])
def test_required_claim_cannot_be_missing(client, name):
    claims = claims_for()
    del claims[name]
    token = jwt.encode(claims, JWT_KEY, algorithm="HS256")
    assert_401(client.get("/test/me", headers={"Authorization": "Bearer " + token}), token)


@pytest.mark.parametrize(
    "name,value",
    [
        ("exp", 0),
        ("exp", "not-a-date"),
        ("exp", True),
        ("exp", float("inf")),
        ("exp", "999999999999"),
        ("iss", "https://attacker.test"),
        ("iss", ISSUER + "/extra"),
        ("iss", None),
        ("aud", "wrong-api"),
        ("aud", [AUDIENCE]),
        ("aud", None),
        ("sub", ""),
        ("sub", "   "),
        ("sub", 123),
        ("sub", None),
        ("permissions", "example:write"),
        ("permissions", ["example:read", 123]),
        ("permissions", [""]),
        ("permissions", None),
        ("nbf", 999999999999),
        ("iat", 999999999999),
        ("iat", -1),
        ("iat", "not-a-date"),
        ("iat", "0"),
        ("iat", True),
        ("iat", None),
        ("iat", float("nan")),
        ("iat", float("inf")),
        ("jti", ""),
        ("jti", "   "),
        ("jti", 123),
        ("jti", None),
    ],
)
def test_invalid_claims_and_expired_tokens_are_rejected(client, name, value):
    # Sign raw JSON: jwt.encode itself refuses some invalid claims (e.g. non-string iss).
    token = jwt.api_jws.encode(
        json.dumps({**claims_for(), name: value}).encode(), JWT_KEY, algorithm="HS256"
    )
    assert_401(client.get("/test/me", headers={"Authorization": "Bearer " + token}), token)


def test_absent_permissions_authenticates_without_granting_access(client):
    claims = claims_for()
    del claims["permissions"]
    token = jwt.encode(claims, JWT_KEY, algorithm="HS256")
    headers = {"Authorization": "Bearer " + token, "Origin": ORIGIN}
    assert client.get("/test/me", headers=headers).status_code == 200
    assert client.post("/test/write", headers=headers).status_code == 403


@pytest.mark.parametrize(
    "permissions,status",
    [([], 403), (["example:read"], 403), (["example:read", "example:write"], 200)],
)
def test_all_required_permissions_and_request_id(client, permissions, status):
    token = signed_token(permissions=permissions)
    request_id = str(uuid4())
    response = client.post(
        "/test/write",
        headers={"Authorization": "Bearer " + token, "Origin": ORIGIN, "X-Request-ID": request_id},
    )
    assert response.status_code == status
    assert response.headers["x-request-id"] == request_id
    assert response.headers["x-content-type-options"] == "nosniff"
    if status == 403:
        assert response.json() == {
            "error": {"code": "HTTP_403", "message": "요청 권한이 없습니다."}
        }
    assert token not in response.text
    assert JWT_KEY not in response.text


@pytest.mark.parametrize(
    "user_id,resource_id,status",
    [
        ("alice", "alice-resource", 200),
        ("alice", "bob-resource", 403),
        ("bob", "bob-resource", 200),
        ("bob", "alice-resource", 403),
    ],
)
def test_resource_ownership_uses_verified_subject_and_server_owner(
    client, user_id, resource_id, status
):
    response = client.get(
        f"/test/resources/{resource_id}?owner_user_id={user_id}",
        headers={
            "Authorization": "Bearer " + signed_token(user_id),
            "X-User-ID": "alice",
            "X-Account-Owner": "alice",
        },
    )
    assert response.status_code == status


@pytest.mark.parametrize(
    "headers",
    [{}, {"Origin": "https://evil.test"}, {"Origin": ORIGIN, "Sec-Fetch-Site": "cross-site"}],
)
def test_valid_jwt_does_not_bypass_csrf(client, headers):
    request_id = str(uuid4())
    response = client.post(
        "/test/write",
        headers={
            **headers,
            "Authorization": "Bearer " + signed_token(),
            "X-Request-ID": request_id,
        },
    )
    assert response.status_code == 403
    assert response.headers["x-request-id"] == request_id


def test_bff_shared_key_is_not_user_authentication(client):
    assert_401(client.post("/test/write", headers={"X-Aura-BFF-Key": BFF_KEY}))
    response = client.post(
        "/test/write",
        headers={"X-Aura-BFF-Key": BFF_KEY, "Authorization": "Bearer " + signed_token()},
    )
    assert response.status_code == 200


def test_unconfigured_defaults_reject_even_validly_signed_jwt(revocations):
    app = build_test_app(configured=False)
    app.dependency_overrides[get_token_revocation_store] = lambda: revocations
    with TestClient(app) as client:
        assert_401(client.get("/test/me", headers={"Authorization": "Bearer " + signed_token()}))
    assert revocations.calls == []


@pytest.mark.parametrize(
    "settings",
    [
        {"jwt_algorithm": "none"},
        {"jwt_algorithm": "HS512"},
        {"jwt_algorithm": "RS256"},
        {"jwt_signing_key": "short"},
        {"jwt_signing_key": "a" * 32 + "\n"},
        {"jwt_issuer": ""},
        {"jwt_audience": " "},
        {"jwt_signing_key": None},
    ],
)
def test_invalid_or_partial_configuration_fails_closed(settings):
    values = {
        "jwt_algorithm": "HS256",
        "jwt_signing_key": JWT_KEY,
        "jwt_issuer": ISSUER,
        "jwt_audience": AUDIENCE,
        **settings,
    }
    with pytest.raises(ValidationError) as failure:
        Settings(_env_file=None, **values)
    assert JWT_KEY not in str(failure.value)


def test_concurrent_identities_do_not_leak(client):
    def send(user_id):
        response = client.get(
            "/test/me", headers={"Authorization": "Bearer " + signed_token(user_id)}
        )
        assert response.status_code == 200
        return response.json()["userId"]

    ids = ["alice", "bob"] * 8
    with ThreadPoolExecutor(max_workers=8) as executor:
        assert list(executor.map(send, ids)) == ids
    assert_401(client.get("/test/me"))


def test_user_structure_still_immutable():
    user = AuthenticatedUser("alice", frozenset({"example:read"}))
    with pytest.raises(FrozenInstanceError):
        user.user_id = "bob"


def test_production_app_has_no_test_routes_and_exposes_lifecycle_routes():
    app = create_app(Settings(_env_file=None))
    assert app.dependency_overrides == {}
    with TestClient(app) as client:
        assert set(client.get("/openapi.json").json()["paths"]) == {
            "/api/v1/health",
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/auth/me",
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout",
            "/api/v1/auth/change-password",
            "/api/v1/catalog",
            "/api/v1/catalog/products/{product_id}",
            "/api/v1/partner",
            "/api/v1/recipes",
            "/api/v1/recipes/{recipe_id}",
            "/api/v1/orders",
            "/api/v1/admin/auth/login",
            "/api/v1/admin/auth/logout",
            "/api/v1/admin/session",
            "/api/v1/admin/admins",
            "/api/v1/admin/overview",
            "/api/v1/admin/products",
            "/api/v1/admin/products/{product_id}",
            "/api/v1/admin/products/{product_id}/stock-adjustments",
            "/api/v1/admin/orders",
            "/api/v1/admin/orders/{order_id}",
            "/api/v1/admin/inquiries",
            "/api/v1/admin/inquiries/{inquiry_id}",
        }
        assert client.get("/test/me").status_code == 404


def test_unconnected_revocation_store_denies_valid_jwt():
    app = build_test_app()
    assert app.dependency_overrides == {}
    token = signed_token()
    request_id = str(uuid4())
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            "/test/me", headers={"Authorization": "Bearer " + token, "X-Request-ID": request_id}
        )
    assert_401(response, token, request_id)


def test_only_verified_issuer_and_jti_reach_revocation_store(client, revocations):
    claims = claims_for()
    token = jwt.encode(claims, JWT_KEY, algorithm="HS256")
    response = client.get("/test/me", headers={"Authorization": "Bearer " + token})
    assert response.status_code == 200
    assert revocations.calls == [(ISSUER, claims["jti"])]


def test_blacklist_update_blocks_same_token_on_next_request(client, revocations):
    claims = claims_for()
    token = jwt.encode(claims, JWT_KEY, algorithm="HS256")
    headers = {"Authorization": "Bearer " + token, "X-Request-ID": str(uuid4())}
    assert client.get("/test/me", headers=headers).status_code == 200
    # Simulate the future logout handler's durable blacklist write, not just cookie deletion.
    revocations.revoked.add((ISSUER, claims["jti"]))
    assert_401(client.get("/test/me", headers=headers), token, headers["X-Request-ID"])
    assert revocations.calls == [(ISSUER, claims["jti"])] * 2


@pytest.mark.parametrize("failure", [RuntimeError, TimeoutError])
def test_revocation_lookup_failure_denies_without_leaking_token_or_key(failure):
    token = signed_token()

    class FailedStore:
        async def is_revoked(self, *, issuer, jti):
            raise failure(token + JWT_KEY + " postgres://private password=private")

    app = build_test_app()
    app.dependency_overrides[get_token_revocation_store] = FailedStore
    request_id = str(uuid4())
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            "/test/me", headers={"Authorization": "Bearer " + token, "X-Request-ID": request_id}
        )
    assert_401(response, token, request_id)
    assert "private" not in response.text


@pytest.mark.parametrize("result", [True, None, 0, "false", []])
def test_only_explicit_false_from_revocation_store_allows_authentication(result):
    class InvalidOrRevokedStore:
        async def is_revoked(self, *, issuer, jti):
            return result

    app = build_test_app()
    app.dependency_overrides[get_token_revocation_store] = InvalidOrRevokedStore
    with TestClient(app) as client:
        assert_401(client.get("/test/me", headers={"Authorization": "Bearer " + signed_token()}))


@pytest.mark.parametrize("kind", ["signature", "expired", "missing-jti", "future-iat"])
def test_invalid_jwt_never_reaches_revocation_store(client, revocations, kind):
    claims = claims_for()
    key = JWT_KEY
    if kind == "signature":
        key = "attacker-key-0123456789abcdef0123456789abcdef"
    elif kind == "expired":
        claims["exp"] = 0
    elif kind == "missing-jti":
        del claims["jti"]
    else:
        claims["iat"] = 999999999999
    token = jwt.encode(claims, key, algorithm="HS256")
    assert_401(client.get("/test/me", headers={"Authorization": "Bearer " + token}), token)
    assert revocations.calls == []
