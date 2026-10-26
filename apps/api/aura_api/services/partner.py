"""Partner inquiry use case: validate with the domain rules, then store."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.partner import validate_inquiry
from aura_api.infra.repositories import partner as repository


async def submit_inquiry(session: AsyncSession, raw: object) -> uuid.UUID:
    inquiry = validate_inquiry(raw)
    async with session.begin():
        return await repository.add_inquiry(session, inquiry)
