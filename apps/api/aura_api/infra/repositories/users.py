"""Member lookups."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.infra.models import User


async def member_exists(session: AsyncSession, user_id: uuid.UUID) -> bool:
    return await session.scalar(select(User.id).where(User.id == user_id)) is not None
