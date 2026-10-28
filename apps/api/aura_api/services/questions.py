"""Product Q&A transactions, ownership, bounded pagination and concurrent edits."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.admin import check_version
from aura_api.domain.errors import Conflict, NotFound, RateLimited, Unauthorized
from aura_api.infra.models import Product, ProductQuestion
from aura_api.infra.repositories import admin, users


async def listing(
    session: AsyncSession,
    *,
    product_id: str | None = None,
    owner: uuid.UUID | None = None,
    page: int = 1,
    unanswered: bool = False,
):
    query = select(ProductQuestion)
    if product_id is not None:
        if await session.get(Product, product_id) is None:
            raise NotFound("PRODUCT_NOT_FOUND", "상품을 찾을 수 없어요.")
        query = query.where(ProductQuestion.product_id == product_id)
    if owner is not None:
        query = query.where(ProductQuestion.user_id == owner)
    if unanswered:
        query = query.where(ProductQuestion.answer.is_(None))
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = list(
        await session.scalars(
            query.order_by(ProductQuestion.created_at.desc(), ProductQuestion.id)
            .offset((page - 1) * 20)
            .limit(20)
        )
    )
    return rows, total


async def create(session: AsyncSession, owner: uuid.UUID, product_id: str, raw: dict):
    async with session.begin():
        if not await users.lock_active_member(session, owner):
            raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
        if await session.get(Product, product_id) is None:
            raise NotFound("PRODUCT_NOT_FOUND", "상품을 찾을 수 없어요.")
        count = await session.scalar(
            select(func.count())
            .select_from(ProductQuestion)
            .where(
                ProductQuestion.user_id == owner,
                ProductQuestion.created_at > datetime.now(UTC) - timedelta(minutes=10),
            )
        )
        if count >= 5:
            raise RateLimited("QUESTION_RATE_LIMIT", "잠시 후 다시 문의해 주세요.", 600)
        question = ProductQuestion(product_id=product_id, user_id=owner, **raw)
        session.add(question)
        await session.flush()
        return question


async def change(
    session: AsyncSession,
    actor: uuid.UUID,
    target: uuid.UUID,
    version: int,
    *,
    raw: dict | None = None,
    delete: bool = False,
    answer: str | None = None,
):
    async with session.begin():
        if answer is None and not await users.lock_active_member(session, actor):
            raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
        query = select(ProductQuestion).where(ProductQuestion.id == target)
        if answer is None:
            query = query.where(ProductQuestion.user_id == actor)
        question = await session.scalar(query.with_for_update())
        if question is None:
            raise NotFound("QUESTION_NOT_FOUND", "문의를 찾을 수 없어요.")
        check_version(version, question.version)
        if delete:
            await session.delete(question)
            return None
        if answer is not None:
            admin.add_audit(
                session,
                actor_id=actor,
                action="question.answer",
                target_type="question",
                target_id=str(target),
                changes=[{"field": "version", "from": version, "to": version + 1}],
            )
            question.answer, question.answered_by, question.answered_at = (
                answer,
                actor,
                datetime.now(UTC),
            )
        else:
            if question.answer is not None:
                raise Conflict(
                    "QUESTION_ALREADY_ANSWERED", "답변이 등록된 문의는 수정할 수 없어요."
                )
            for key, value in raw.items():
                setattr(question, key, value)
        question.version += 1
        question.updated_at = datetime.now(UTC)
        await session.flush()
        return question
