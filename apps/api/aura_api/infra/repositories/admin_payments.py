"""Admin read model for payments and refunds that need a person to look at them."""

from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.admin import PAGE_SIZE
from aura_api.domain.payments import UNRESOLVED_AFTER
from aura_api.infra.models import Order, Payment, Refund, User

PaymentRow = tuple[Payment, Order, User | None]
RefundRow = tuple[Refund, Order, User | None]


def unresolved(model, column) -> object:
    """Still IN_PROGRESS after the reconciliation threshold: the PG result is unknown."""
    return (model.status == "IN_PROGRESS") & (column < datetime.now(UTC) - UNRESOLVED_AFTER)


async def _page(session: AsyncSession, query, order_by, page: int):
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.execute(
        query.order_by(*order_by).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
    )
    return [tuple(row) for row in rows], total or 0


async def payments_to_review(
    session: AsyncSession, *, status: str | None, reason: str | None, page: int
) -> tuple[list[PaymentRow], int]:
    """Payments with a review reason, or whose PG result is still unknown. Newest change first."""
    query = (
        select(Payment, Order, User)
        .join(Order, Order.id == Payment.order_id)
        .outerjoin(User, Order.user_id == User.id)
        .where(
            or_(
                Payment.review_reason.is_not(None),
                unresolved(Payment, Payment.confirm_started_at),
            )
        )
    )
    if status is not None:
        query = query.where(Payment.status == status)
    if reason is not None:
        query = query.where(Payment.review_reason == reason)
    return await _page(session, query, (Payment.updated_at.desc(), Payment.id), page)


async def refunds_to_review(
    session: AsyncSession, *, status: str | None, reason: str | None, page: int
) -> tuple[list[RefundRow], int]:
    """Refunds that were rejected, have a review reason, or whose PG result is still unknown."""
    query = (
        select(Refund, Order, User)
        .join(Order, Order.id == Refund.order_id)
        .outerjoin(User, Order.user_id == User.id)
        .where(
            or_(
                Refund.review_reason.is_not(None),
                Refund.status == "FAILED",
                unresolved(Refund, Refund.requested_at),
            )
        )
    )
    if status is not None:
        query = query.where(Refund.status == status)
    if reason is not None:
        query = query.where(Refund.review_reason == reason)
    return await _page(session, query, (Refund.updated_at.desc(), Refund.id), page)
