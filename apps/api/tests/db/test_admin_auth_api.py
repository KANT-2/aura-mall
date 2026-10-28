"""Admin login, session, logout and registration with the real revocation store (no stubs)."""

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from aura_api.config import Settings
from aura_api.identity.service import PASSWORD_HASHER
from aura_api.infra.create_admin import create_first_admin
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import Admin, AdminAuditLog, AdminSession, RevokedToken, User
from aura_api.main import create_app

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ORIGIN = "http://localhost:3000"
KEY = "s" * 48
PASSWORD = "admin-password-1"
HASH = PASSWORD_HASHER.hash(PASSWORD)


def db(work):
    async def run():
        engine = create_engine(URL)
        try:
            return await work(create_sessionmaker(engine))
        finally:
            await engine.dispose()

    return asyncio.run(run())


def insert(row):
    async def write(sessionmaker):
        async with sessionmaker() as session, session.begin():
            session.add(row)
            await session.flush()
            return row.id

    return db(write)


def new_admin(status: str = "active") -> tuple[uuid.UUID, str]:
    email = f"{uuid.uuid4().hex}@aura.com"
    return insert(Admin(email=email, name="운영자", password_hash=HASH, status=status)), email


def claims_of(token: str) -> dict:
    return jwt.decode(token, options={"verify_signature": False})


@pytest.fixture(scope="module")
def client(migrated):
    settings = Settings(
        _env_file=None,
        database_url=URL,
        csrf_allowed_origins=[ORIGIN],
        jwt_algorithm="HS256",
        jwt_signing_key=KEY,
        jwt_issuer="aura",
        jwt_audience="web",
    )
    with TestClient(create_app(settings), headers={"Origin": ORIGIN}) as client:
        yield client


def login(client, email: str, password: str = PASSWORD):
    return client.post("/api/v1/admin/auth/login", json={"email": email, "password": password})


def bearer(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def test_first_admin_command_runs_only_once(migrated):
    email = asyncio.run(create_first_admin(URL, " Root@AURA.com ", "최초 관리자", PASSWORD))
    assert email == "root@aura.com"
    with pytest.raises(SystemExit):
        asyncio.run(create_first_admin(URL, "second@aura.com", "두 번째", PASSWORD))


def test_login_issues_marked_access_token_and_records_session(client):
    admin_id, email = new_admin()
    response = login(client, email.upper())

    assert response.status_code == 200
    body = response.json()
    assert body["tokenType"] == "Bearer" and body["expiresIn"] == 3600
    assert body["admin"] == {"id": str(admin_id), "email": email, "name": "운영자"}
    assert "refreshToken" not in body  # admins get access tokens only
    claims = claims_of(body["accessToken"])
    assert claims["sub"] == str(admin_id)
    assert (claims["principal_type"], claims["permissions"]) == ("admin", ["admin"])

    async def recorded(sessionmaker):
        async with sessionmaker() as session:
            row = await session.get(AdminSession, uuid.UUID(claims["jti"]))
            admin = await session.get(Admin, admin_id)
            return row, admin.last_login_at

    row, last_login = db(recorded)
    assert row.admin_id == admin_id and row.revoked_at is None and last_login is not None
    me = client.get("/api/v1/admin/session", headers=bearer(response))
    assert me.json() == {"id": str(admin_id), "email": email, "name": "운영자"}


@pytest.mark.parametrize("case", ["wrong password", "unknown email", "disabled"])
def test_failed_logins_look_the_same(client, case):
    _, email = new_admin("disabled" if case == "disabled" else "active")
    if case == "unknown email":
        email = f"{uuid.uuid4().hex}@aura.com"
    response = login(client, email, "wrong-password" if case == "wrong password" else PASSWORD)

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "이메일 또는 비밀번호를 확인해 주세요."


def test_logout_revokes_the_token(client):
    _, email = new_admin()
    headers = bearer(login(client, email))
    jti = uuid.UUID(claims_of(headers["Authorization"].split()[1])["jti"])

    assert client.post("/api/v1/admin/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/admin/session", headers=headers).status_code == 401

    async def rows(sessionmaker):
        async with sessionmaker() as session:
            return await session.get(AdminSession, jti), await session.get(RevokedToken, jti)

    session_row, revoked = db(rows)
    assert session_row.revoked_at is not None and revoked is not None


def test_disabling_an_admin_blocks_existing_tokens(client):
    admin_id, email = new_admin()
    headers = bearer(login(client, email))
    assert client.get("/api/v1/admin/overview", headers=headers).status_code == 200

    async def disable(sessionmaker):
        async with sessionmaker() as session, session.begin():
            await session.execute(
                update(Admin).where(Admin.id == admin_id).values(status="disabled")
            )

    db(disable)
    assert client.get("/api/v1/admin/overview", headers=headers).status_code == 401


def test_session_must_belong_to_the_token_subject(client):
    _, owner_email = new_admin()
    other_id, _ = new_admin()
    owner_token = login(client, owner_email).json()["accessToken"]
    stolen = claims_of(owner_token)
    forged = jwt.encode({**stolen, "sub": str(other_id)}, KEY, algorithm="HS256")

    response = client.get("/api/v1/admin/session", headers={"Authorization": f"Bearer {forged}"})

    assert response.status_code == 401


def test_admin_and_member_tokens_stay_on_their_own_side(client):
    _, email = new_admin()
    admin_headers = bearer(login(client, email))
    member_email = f"{uuid.uuid4().hex}@aura.com"
    insert(User(email=member_email, name="회원", password_hash=HASH))
    member = client.post("/api/v1/auth/login", json={"email": member_email, "password": PASSWORD})
    assert member.status_code == 200
    member_headers = {"Authorization": f"Bearer {member.json()['accessToken']}"}

    # Admin token on member routes: refused, never treated as a member.
    assert client.get("/api/v1/recipes", headers=admin_headers).status_code == 401
    assert client.get("/api/v1/orders", headers=admin_headers).status_code == 401
    assert client.post("/api/v1/auth/logout", headers=admin_headers).status_code == 401
    # Member token on admin routes: authenticated but not an admin.
    forbidden = client.get("/api/v1/admin/overview", headers=member_headers)
    assert forbidden.status_code == 403
    assert client.get("/api/v1/admin/session", headers=member_headers).status_code == 403
    # The member token still works for members.
    assert client.get("/api/v1/recipes", headers=member_headers).status_code == 200


def test_signed_in_admin_registers_another_admin(client):
    actor_id, email = new_admin()
    headers = bearer(login(client, email))
    new_email = f"{uuid.uuid4().hex}@aura.com"

    created = client.post(
        "/api/v1/admin/admins",
        json={"email": new_email.upper(), "name": " 신규 운영자 ", "password": "new-admin-pass"},
        headers=headers,
    )
    duplicate = client.post(
        "/api/v1/admin/admins",
        json={"email": new_email, "name": "중복", "password": "new-admin-pass"},
        headers=headers,
    )
    weak = client.post(
        "/api/v1/admin/admins",
        json={"email": "x@aura.com", "name": "약함", "password": "short"},
        headers=headers,
    )

    assert created.status_code == 201
    assert (created.json()["email"], created.json()["name"]) == (new_email, "신규 운영자")
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ADMIN_EMAIL_TAKEN"
    assert weak.status_code == 400
    assert login(client, new_email, "new-admin-pass").status_code == 200

    async def records(sessionmaker):
        async with sessionmaker() as session:
            admin = await session.scalar(select(Admin).where(Admin.email == new_email))
            audit = await session.scalar(
                select(AdminAuditLog).where(AdminAuditLog.target_id == str(admin.id))
            )
            return admin, audit

    admin, audit = db(records)
    assert admin.created_by == actor_id
    assert (audit.action, audit.actor_id) == ("admin.create", actor_id)


def test_expired_admin_session_is_refused(client):
    admin_id, email = new_admin()
    token = login(client, email).json()["accessToken"]
    jti = uuid.UUID(claims_of(token)["jti"])

    async def expire(sessionmaker):
        async with sessionmaker() as session, session.begin():
            past = datetime.now(UTC) - timedelta(minutes=1)
            await session.execute(
                update(AdminSession)
                .where(AdminSession.jti == jti)
                .values(issued_at=past - timedelta(hours=1), expires_at=past)
            )

    db(expire)
    response = client.get("/api/v1/admin/session", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
