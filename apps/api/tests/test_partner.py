"""POST /partner without a database: the session records what would be stored."""

import uuid

import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
from aura_api.infra.database import get_session
from aura_api.infra.models import PartnerInquiry
from aura_api.main import create_app

ORIGIN = "http://localhost:3000"
VALID = {
    "brand": " 오브제 ",
    "name": "김담당",
    "email": "partner@brand.com",
    "introduction": "향 브랜드입니다.",
    "message": "입점 문의드립니다.",
    "type": "향수",
    "consent": "on",
    "website": "",
}


class RecordingSession:
    def __init__(self):
        self.added = []

    def begin(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def add(self, row):
        self.added.append(row)

    async def flush(self):
        for row in self.added:
            row.id = row.id or uuid.uuid4()


@pytest.fixture
def session():
    return RecordingSession()


@pytest.fixture
def client(session):
    async def override():
        yield session

    app = create_app(Settings(_env_file=None, csrf_allowed_origins=[ORIGIN]))
    app.dependency_overrides[get_session] = override
    with TestClient(app, headers={"Origin": ORIGIN}) as client:
        yield client


def test_valid_inquiry_is_stored_trimmed(client, session):
    response = client.post("/api/v1/partner", json=VALID)

    assert response.status_code == 201
    [row] = session.added
    assert isinstance(row, PartnerInquiry)
    assert response.json() == {"id": str(row.id)}
    assert (row.brand, row.website, row.consent) == ("오브제", None, True)


@pytest.mark.parametrize(
    ("change", "code", "message"),
    [
        ({"consent": None}, "INQUIRY_CONSENT", "필수 입력 항목과 동의를 확인해 주세요."),
        ({"email": "not-an-email"}, "INQUIRY_CONSENT", "필수 입력 항목과 동의를 확인해 주세요."),
        ({"brand": "   "}, "INQUIRY_INVALID", "필수 입력 항목을 확인해 주세요."),
        ({"type": "의류"}, "INQUIRY_INVALID", "필수 입력 항목을 확인해 주세요."),
        ({"message": "가" * 3001}, "INQUIRY_INVALID", "필수 입력 항목을 확인해 주세요."),
    ],
)
def test_rule_violations_return_domain_message(client, session, change, code, message):
    response = client.post("/api/v1/partner", json={**VALID, **change})

    assert response.status_code == 400
    assert response.json() == {"error": {"code": code, "message": message}}
    assert "x-request-id" in response.headers
    assert session.added == []


def test_wrong_json_types_are_422(client, session):
    response = client.post("/api/v1/partner", json={**VALID, "brand": 42})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert session.added == []


def test_cross_site_post_is_rejected(client, session):
    response = client.post(
        "/api/v1/partner", json=VALID, headers={"Origin": "https://evil.example"}
    )

    assert response.status_code == 403
    assert session.added == []
