"""Partner inquiry writes."""

import hashlib
import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.partner import PartnerInquiry as Inquiry
from aura_api.infra.models import PartnerInquiry


async def lock_and_count_recent(session: AsyncSession, email: str, window: timedelta) -> int:
    # Keep normalization identical to PostgreSQL lower(email), which backs the lookup index.
    normalized = email.lower()
    digest = hashlib.blake2b(f"aura:partner-inquiry:{normalized}".encode(), digest_size=8).digest()
    lock_key = int.from_bytes(digest, signed=True)
    await session.execute(select(func.pg_advisory_xact_lock(lock_key)))
    count = await session.scalar(
        select(func.count())
        .select_from(PartnerInquiry)
        .where(
            func.lower(PartnerInquiry.email) == normalized,
            PartnerInquiry.created_at >= func.now() - window,
        )
    )
    return int(count or 0)


async def add_inquiry(session: AsyncSession, inquiry: Inquiry) -> uuid.UUID:
    row = PartnerInquiry(
        brand=inquiry.brand,
        name=inquiry.name,
        email=inquiry.email,
        website=inquiry.website,
        type=inquiry.type,
        introduction=inquiry.introduction,
        message=inquiry.message,
        consent=True,
    )
    session.add(row)
    await session.flush()
    return row.id
