"""POST /partner writes a row the admin screens can read."""

import asyncio
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from aura_api.config import Settings
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import PartnerInquiry
from aura_api.main import create_app

URL = os.environ.get("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
ORIGIN = "http://localhost:3000"


def test_inquiry_is_saved_with_admin_defaults(migrated):
    settings = Settings(_env_file=None, database_url=URL, csrf_allowed_origins=[ORIGIN])
    with TestClient(create_app(settings), headers={"Origin": ORIGIN}) as client:
        response = client.post(
            "/api/v1/partner",
            json={
                "brand": "오브제",
                "name": "김담당",
                "email": "partner@brand.com",
                "introduction": "소개",
                "message": "문의",
                "type": "홈 프래그런스",
                "consent": "on",
                "website": "https://brand.com",
            },
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
