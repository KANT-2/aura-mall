"""Partner inquiry writes."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.partner import PartnerInquiry as Inquiry
from aura_api.infra.models import PartnerInquiry


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
