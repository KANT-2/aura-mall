"""Visitor drafts contain composition data only, never member identity or credentials."""

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.atelier import AtelierDraft as Draft
from aura_api.infra.models.atelier import AtelierDraft


async def get_draft(session: AsyncSession, guest_id: uuid.UUID) -> Draft | None:
    row = await session.scalar(select(AtelierDraft).where(AtelierDraft.guest_id == guest_id))
    return Draft(dict(row.counts), row.name, row.label, row.step) if row else None


async def save_draft(session: AsyncSession, guest_id: uuid.UUID, draft: Draft) -> Draft:
    values = dict(counts=dict(draft.counts), name=draft.name, label=draft.label, step=draft.step)
    await session.execute(
        insert(AtelierDraft)
        .values(guest_id=guest_id, **values)
        .on_conflict_do_update(
            index_elements=[AtelierDraft.guest_id], set_={**values, "updated_at": func.now()}
        )
    )
    return draft


async def delete_draft(session: AsyncSession, guest_id: uuid.UUID) -> None:
    await session.execute(delete(AtelierDraft).where(AtelierDraft.guest_id == guest_id))
