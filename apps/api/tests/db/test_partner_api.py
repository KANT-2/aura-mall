"""POST /partner writes a row the admin screens can read."""

import asyncio
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from aura_api.config import Settings
from aura_api.domain.errors import RateLimited
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import PartnerInquiry
from aura_api.main import create_app
from aura_api.services import partner as service

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ORIGIN = "http://localhost:3000"


def inquiry(email: str) -> dict[str, str]:
    return {
        "brand": "오브제",
        "name": "김담당",
        "email": email,
        "introduction": "소개",
        "message": "문의",
        "type": "홈 프래그런스",
        "consent": "on",
        "website": "https://brand.com",
    }


def test_inquiry_is_saved_with_admin_defaults(migrated):
    settings = Settings(_env_file=None, database_url=URL, csrf_allowed_origins=[ORIGIN])
    with TestClient(create_app(settings), headers={"Origin": ORIGIN}) as client:
        response = client.post(
            "/api/v1/partner",
            json=inquiry("partner@brand.com"),
        )
    assert response.status_code == 201
    inquiry_id = uuid.UUID(response.json()["id"])

    async def load():
        engine = create_engine(URL)
        try:
            async with create_sessionmaker(engine)() as session:
                return await session.scalar(
                    select(PartnerInquiry).where(PartnerInquiry.id == inquiry_id)
                )
        finally:
            await engine.dispose()

    row = asyncio.run(load())
    assert (row.status, row.version, row.internal_memo) == ("received", 1, "")
    assert (row.type, row.website) == ("홈 프래그런스", "https://brand.com")


def test_rate_limit_is_case_insensitive_and_persistent(migrated):
    settings = Settings(_env_file=None, database_url=URL, csrf_allowed_origins=[ORIGIN])
    email = f"Rate-{uuid.uuid4()}@Brand.com"
    with TestClient(create_app(settings), headers={"Origin": ORIGIN}) as client:
        responses = [client.post("/api/v1/partner", json=inquiry(email.lower())) for _ in range(3)]
        limited = client.post("/api/v1/partner", json=inquiry(email.upper()))
        other = client.post("/api/v1/partner", json=inquiry(f"other-{uuid.uuid4()}@brand.com"))

    assert [response.status_code for response in responses] == [201, 201, 201]
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "600"
    assert limited.json()["error"]["code"] == "INQUIRY_RATE_LIMITED"
    assert other.status_code == 201


def test_simultaneous_inquiries_accept_only_three(migrated):
    email = f"race-{uuid.uuid4()}@brand.com"

    async def race():
        engine = create_engine(URL)
        sessionmaker = create_sessionmaker(engine)

        async def submit(index: int):
            async with sessionmaker() as session:
                try:
                    await service.submit_inquiry(
                        session, {**inquiry(email), "brand": f"동시 브랜드 {index}"}
                    )
                    return "created"
                except RateLimited as error:
                    return error.code

        try:
            return await asyncio.gather(*(submit(index) for index in range(4)))
        finally:
            await engine.dispose()

    assert sorted(asyncio.run(race())) == [
        "INQUIRY_RATE_LIMITED",
        "created",
        "created",
        "created",
    ]
