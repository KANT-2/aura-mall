"""Recipe routes against PostgreSQL with real signed JWTs (revocation lookup stubbed)."""

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
from aura_api.core.revocation import get_token_revocation_store
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import User
from aura_api.main import create_app

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ORIGIN = "http://localhost:3000"
KEY = "r" * 48


class NothingRevoked:
    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        return False


def bearer(subject: uuid.UUID) -> dict[str, str]:
    now = datetime.now(UTC)
    claims = {
        "sub": str(subject),
        "jti": str(uuid.uuid4()),
        "iss": "aura",
        "aud": "web",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    return {"Authorization": f"Bearer {jwt.encode(claims, KEY, algorithm='HS256')}"}


def create_member() -> uuid.UUID:
    async def insert():
        engine = create_engine(URL)
        try:
            async with create_sessionmaker(engine)() as session, session.begin():
                user = User(email=f"{uuid.uuid4().hex}@aura.com", name="회원", password_hash="x")
                session.add(user)
                await session.flush()
                return user.id
        finally:
            await engine.dispose()

    return asyncio.run(insert())


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
    app = create_app(settings)
    app.dependency_overrides[get_token_revocation_store] = NothingRevoked
    with TestClient(app, headers={"Origin": ORIGIN}) as client:
        yield client


def test_save_remake_list_and_delete(client):
    member = bearer(create_member())
    saved = client.post(
        "/api/v1/recipes",
        json={"name": " 느린 오후 ", "label": "paper", "counts": {"bergamot": 3, "rose": 2}},
        headers=member,
    )
    assert saved.status_code == 201
    original = saved.json()
    assert (original["name"], original["label"], original["version"]) == ("느린 오후", "paper", 1)
    assert original["counts"] == {"bergamot": 3, "rose": 2}
    assert original["color"].startswith("#") and "parent" not in original

    remake = client.post(
        "/api/v1/recipes",
        json={"name": "느린 오후", "counts": {"bergamot": 4}, "parent": original["id"]},
        headers=member,
    ).json()
    assert (remake["version"], remake["parent"], remake["label"]) == (2, original["id"], "classic")

    listed = client.get("/api/v1/recipes", headers=member).json()
    assert [item["id"] for item in listed] == [remake["id"], original["id"]]

    left = client.delete(f"/api/v1/recipes/{original['id']}", headers=member)
    assert left.status_code == 200
    assert [item["id"] for item in left.json()] == [remake["id"]]
    assert "parent" not in left.json()[0]  # original deleted, link cleared


def test_other_members_recipes_look_missing(client):
    owner, other = bearer(create_member()), bearer(create_member())
    recipe = client.post(
        "/api/v1/recipes", json={"name": "내 향", "counts": {"bergamot": 1}}, headers=owner
    ).json()

    remake = client.post(
        "/api/v1/recipes",
        json={"name": "훔친 향", "counts": {"bergamot": 1}, "parent": recipe["id"]},
        headers=other,
    )
    deleted = client.delete(f"/api/v1/recipes/{recipe['id']}", headers=other)

    assert remake.status_code == 404
    assert remake.json()["error"]["code"] == "RECIPE_PARENT_NOT_FOUND"
    assert deleted.status_code == 404
    assert deleted.json()["error"]["message"] == "저장한 향을 찾을 수 없어요."
    assert client.get("/api/v1/recipes", headers=other).json() == []
    assert len(client.get("/api/v1/recipes", headers=owner).json()) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"name": "넘침", "counts": {"bergamot": 21}},
        {"name": "없는 향료", "counts": {"unicorn": 1}},
        {"name": "", "counts": {"bergamot": 1}},
        {"name": "빈 조합", "counts": {}},
    ],
)
def test_rule_violations_are_400_and_save_nothing(client, body):
    member_id = create_member()
    response = client.post("/api/v1/recipes", json=body, headers=bearer(member_id))

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "향 이름과 향료 조합을 확인해 주세요."
    assert client.get("/api/v1/recipes", headers=bearer(member_id)).json() == []


def test_anonymous_token_is_not_a_member(client):
    visitor = bearer(uuid.uuid4())  # a valid token whose subject is no member

    assert client.get("/api/v1/recipes", headers=visitor).json() == []
    response = client.post(
        "/api/v1/recipes", json={"name": "향", "counts": {"bergamot": 1}}, headers=visitor
    )
    assert response.status_code == 401


def test_changed_account_is_409(client):
    member_id = create_member()
    response = client.post(
        "/api/v1/recipes",
        json={"name": "향", "counts": {"bergamot": 1}},
        headers={**bearer(member_id), "X-Account-Owner": str(uuid.uuid4())},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "OWNER_CHANGED"
