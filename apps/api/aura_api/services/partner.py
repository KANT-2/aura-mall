"""Partner inquiry use case: validate with the domain rules, then store."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.errors import RateLimited
from aura_api.domain.partner import INQUIRY_RATE_LIMIT, INQUIRY_RATE_WINDOW, validate_inquiry
from aura_api.infra.repositories import partner as repository


async def submit_inquiry(session: AsyncSession, raw: object) -> uuid.UUID:
    inquiry = validate_inquiry(raw)
    async with session.begin():
        recent = await repository.lock_and_count_recent(session, inquiry.email, INQUIRY_RATE_WINDOW)
        if recent >= INQUIRY_RATE_LIMIT:
            raise RateLimited(
                "INQUIRY_RATE_LIMITED",
                "문의가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
                int(INQUIRY_RATE_WINDOW.total_seconds()),
            )
        return await repository.add_inquiry(session, inquiry)
