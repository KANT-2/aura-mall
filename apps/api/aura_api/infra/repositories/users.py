"""Member lookups."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.infra.models import User


async def member_exists(session: AsyncSession, user_id: uuid.UUID) -> bool:
    return (
        await session.scalar(select(User.id).where(User.id == user_id, User.is_active.is_(True)))
        is not None
    )


async def lock_active_member(session: AsyncSession, user_id: uuid.UUID) -> bool:
    """Hold a SHARE user lock until the caller's business transaction commits."""
    return (
        await session.scalar(
            select(User.id)
            .where(User.id == user_id, User.is_active.is_(True))
            .with_for_update(read=True)
        )
        is not None
    )
