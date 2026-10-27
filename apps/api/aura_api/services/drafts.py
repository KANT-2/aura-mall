"""A browser visitor keeps the same non-sensitive composition across login/logout."""

import uuid
from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.atelier import AtelierDraft, validate_draft
from aura_api.infra.repositories import catalog, drafts


async def get_draft(session: AsyncSession, guest_id: uuid.UUID) -> AtelierDraft | None:
    return await drafts.get_draft(session, guest_id)


async def save_draft(
    session: AsyncSession, guest_id: uuid.UUID, raw: Mapping[str, object]
) -> AtelierDraft:
    async with session.begin():
        rules = await catalog.load_rule_catalog(session)
        draft = validate_draft(raw, rules.ingredients)
        return await drafts.save_draft(session, guest_id, draft)


async def delete_draft(session: AsyncSession, guest_id: uuid.UUID) -> None:
    async with session.begin():
        await drafts.delete_draft(session, guest_id)
