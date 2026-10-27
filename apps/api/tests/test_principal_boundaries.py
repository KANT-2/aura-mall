"""CRA-22: overlapping member/admin IDs, with production routes and JWT verification.

Only persistence and revocation lookups are test doubles. No database is opened.
Existing DB cross-account tests use different UUIDs; these deliberately share one.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
from aura_api.core.revocation import get_token_revocation_store
from aura_api.identity.repository import UnavailableAuthRepository
from aura_api.identity.service import AuthLifecycleService
from aura_api.identity.tokens import issue_admin_access, issue_tokens
from aura_api.infra.database import get_session
from aura_api.infra.repositories import admin, users
from aura_api.main import create_app

KEY = "cra22-test-only-key-0123456789abcdef"


@pytest.fixture
def boundary(monkeypatch):
    settings = Settings(
        _env_file=None,
        database_url=None,
        jwt_algorithm="HS256",
        jwt_signing_key=KEY,
        jwt_issuer="cra22-test",
        jwt_audience="cra22-api",
        csrf_allowed_origins=["https://cra31.test"],
    )
    shared_id = uuid4()
    member = issue_tokens(settings, shared_id, uuid4())
    operator = issue_admin_access(settings, shared_id)
    accepted = {str(member.jti), str(operator.jti)}

    class Revocations:
        async def is_revoked(self, *, issuer, jti):
            return issuer != settings.jwt_issuer or jti not in accepted

    repository = UnavailableAuthRepository()
    repository.profile = AsyncMock(
        return_value={
            "id": str(shared_id),
            "email": "member-only@example.com",
            "name": "Private member",
            "coupon": True,
            "marketing": False,
            "role": "member",
        }
    )
    repository.update_profile = AsyncMock()
    session = SimpleNamespace(rollback=AsyncMock())

    async def test_session():
        yield session

    admin_session = AsyncMock(return_value=SimpleNamespace(admin_id=shared_id))
    active_admin = AsyncMock(
        return_value=SimpleNamespace(
            id=shared_id,
            name="Operator",
            email="operator@example.com",
        )
    )
    is_customer = AsyncMock(return_value=True)
    member_exists = AsyncMock(return_value=True)
    monkeypatch.setattr(admin, "admin_session", admin_session)
    monkeypatch.setattr(admin, "active_admin", active_admin)
    monkeypatch.setattr(admin, "is_customer", is_customer)
    monkeypatch.setattr(users, "member_exists", member_exists)
    app = create_app(settings)
    app.state.auth_service = AuthLifecycleService(settings, repository)
    app.dependency_overrides[get_session] = test_session
    app.dependency_overrides[get_token_revocation_store] = Revocations
    with TestClient(app, raise_server_exceptions=False) as client:
        yield SimpleNamespace(
            client=client,
            member=member,
            operator=operator,
            repository=repository,
            member_exists=member_exists,
            admin_session=admin_session,
            active_admin=active_admin,
            is_customer=is_customer,
        )


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_shared_uuid_member_token_never_becomes_an_admin(boundary):
    response = boundary.client.get(
        "/api/v1/admin/session",
        headers=bearer(boundary.member.access_token),
    )
    assert response.status_code == 403
    boundary.admin_session.assert_not_awaited()
    boundary.active_admin.assert_not_awaited()


def test_shared_uuid_admin_token_still_reaches_its_own_session(boundary):
    response = boundary.client.get(
        "/api/v1/admin/session",
        headers=bearer(boundary.operator.access_token),
    )
    assert response.status_code == 200
    assert response.json()["email"] == "operator@example.com"
    boundary.is_customer.assert_not_awaited()


@pytest.mark.parametrize("path", ["/api/v1/recipes", "/api/v1/orders"])
@pytest.mark.parametrize("missing_marker", [None, "principal_type", "permissions"])
def test_shared_uuid_admin_markers_cannot_reach_member_business_routes(
    boundary,
    path,
    missing_marker,
):
    token = boundary.operator.access_token
    if missing_marker:
        claims = jwt.decode(
            token,
            KEY,
            algorithms=["HS256"],
            issuer="cra22-test",
            audience="cra22-api",
        )
        del claims[missing_marker]
        token = jwt.encode(claims, KEY, algorithm="HS256")
    response = boundary.client.get(path, headers=bearer(token))
    assert response.status_code == 401
    boundary.member_exists.assert_not_awaited()


@pytest.mark.parametrize("principal_type", [None, "member"])
def test_shared_uuid_member_profile_still_accepts_member_token(boundary, principal_type):
    token = boundary.member.access_token
    if principal_type is not None:
        claims = jwt.decode(
            token,
            KEY,
            algorithms=["HS256"],
            issuer="cra22-test",
            audience="cra22-api",
        )
        token = jwt.encode({**claims, "principal_type": principal_type}, KEY, algorithm="HS256")
    response = boundary.client.get("/api/v1/auth/me", headers=bearer(token))
    assert response.status_code == 200
    assert response.json()["role"] == "member"


@pytest.mark.parametrize("missing_marker", [None, "principal_type", "permissions"])
def test_admin_principal_cannot_read_member_profile_with_shared_uuid(boundary, missing_marker):
    token = boundary.operator.access_token
    if missing_marker is not None:
        claims = jwt.decode(
            token,
            KEY,
            algorithms=["HS256"],
            issuer="cra22-test",
            audience="cra22-api",
        )
        del claims[missing_marker]
        token = jwt.encode(claims, KEY, algorithm="HS256")
    response = boundary.client.get("/api/v1/auth/me", headers=bearer(token))
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert "member-only@example.com" not in response.text
    assert token not in response.text
    boundary.repository.profile.assert_not_awaited()


@pytest.mark.parametrize("missing_marker", [None, "principal_type", "permissions"])
def test_admin_principal_cannot_patch_member_profile_with_shared_uuid(boundary, missing_marker):
    token = boundary.operator.access_token
    if missing_marker is not None:
        claims = jwt.decode(
            token,
            KEY,
            algorithms=["HS256"],
            issuer="cra22-test",
            audience="cra22-api",
        )
        del claims[missing_marker]
        token = jwt.encode(claims, KEY, algorithm="HS256")
    response = boundary.client.patch(
        "/api/v1/auth/me",
        json={"name": "blocked"},
        headers={**bearer(token), "Origin": "https://cra31.test"},
    )
    assert response.status_code == 401
    boundary.repository.update_profile.assert_not_awaited()
    boundary.repository.profile.assert_not_awaited()
