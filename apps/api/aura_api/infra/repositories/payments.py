"""Payment attempts and refunds. Lock order: order row, then its payment, then its refund."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.payments import OPEN_PAYMENT_STATUSES
from aura_api.infra.models import Order, OrderItem, Payment, Refund


async def lock_order(
    session: AsyncSession, order_id: uuid.UUID, owner_id: uuid.UUID | None = None
) -> Order | None:
    query = (
        select(Order)
        .where(Order.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if owner_id is not None:
        query = query.where(Order.user_id == owner_id)
    return await session.scalar(query)


async def lock_payment(session: AsyncSession, payment_id: uuid.UUID) -> Payment | None:
    return await session.scalar(
        select(Payment)
        .where(Payment.id == payment_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def open_payment(session: AsyncSession, order_id: uuid.UUID) -> Payment | None:
    """The order's READY, IN_PROGRESS or DONE attempt; the caller holds the order lock."""
    return await session.scalar(
        select(Payment)
        .where(Payment.order_id == order_id, Payment.status.in_(OPEN_PAYMENT_STATUSES))
        .execution_options(populate_existing=True)
    )


async def orders_with_payment(
    session: AsyncSession, order_ids: list[uuid.UUID], statuses: tuple[str, ...]
) -> set[uuid.UUID]:
    """Which of these orders have a payment attempt in one of `statuses` (read only)."""
    if not order_ids:
        return set()
    return set(
        await session.scalars(
            select(Payment.order_id).where(
                Payment.order_id.in_(order_ids), Payment.status.in_(statuses)
            )
        )
    )


async def member_payment(
    session: AsyncSession,
    member_id: uuid.UUID,
    *,
    payment_id: uuid.UUID | None = None,
    pg_order_id: str | None = None,
) -> Payment | None:
    """A payment of the member's own order, found by ID or by the PG order ID."""
    query = (
        select(Payment).join(Order, Order.id == Payment.order_id).where(Order.user_id == member_id)
    )
    if payment_id is not None:
        query = query.where(Payment.id == payment_id)
    else:
        query = query.where(Payment.pg_order_id == pg_order_id)
    return await session.scalar(query.execution_options(populate_existing=True))


async def first_item_and_count(session: AsyncSession, order_id: uuid.UUID) -> tuple[str, int]:
    rows = list(
        await session.scalars(
            select(OrderItem).where(OrderItem.order_id == order_id).order_by(OrderItem.position)
        )
    )
    if not rows:
        return "AURA 주문", 1
    first = rows[0]
    name = first.custom["name"] if first.custom else first.product_snapshot["name"]
    return name, len(rows)


async def unresolved_before(session: AsyncSession, cutoff: datetime, limit: int) -> list[uuid.UUID]:
    """IN_PROGRESS attempts claimed before `cutoff`, oldest first."""
    return list(
        await session.scalars(
            select(Payment.id)
            .where(Payment.status == "IN_PROGRESS", Payment.confirm_started_at < cutoff)
            .order_by(Payment.confirm_started_at, Payment.id)
            .limit(limit)
        )
    )


async def lock_refund(session: AsyncSession, refund_id: uuid.UUID) -> Refund | None:
    return await session.scalar(
        select(Refund)
        .where(Refund.id == refund_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def active_refund(session: AsyncSession, payment_id: uuid.UUID) -> Refund | None:
    """The payment's IN_PROGRESS or DONE refund; the caller holds the order lock."""
    return await session.scalar(
        select(Refund)
        .where(Refund.payment_id == payment_id, Refund.status.in_(("IN_PROGRESS", "DONE")))
        .execution_options(populate_existing=True)
    )


async def has_pending_refund(session: AsyncSession, order_id: uuid.UUID) -> bool:
    return (
        await session.scalar(
            select(Refund.id).where(Refund.order_id == order_id, Refund.status == "IN_PROGRESS")
        )
        is not None
    )


async def unresolved_refunds_before(
    session: AsyncSession, cutoff: datetime, limit: int
) -> list[uuid.UUID]:
    """IN_PROGRESS refunds requested before `cutoff`, oldest first."""
    return list(
        await session.scalars(
            select(Refund.id)
            .where(Refund.status == "IN_PROGRESS", Refund.requested_at < cutoff)
            .order_by(Refund.requested_at, Refund.id)
            .limit(limit)
        )
    )
