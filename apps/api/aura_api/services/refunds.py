"""Cancel a paid order with a full refund through the PG.

Like payment confirmation, it runs in three steps so no database lock is held while the PG is
called, and the order only becomes `cancelled` after the PG confirmed the money went back:

1. Claim (short transaction): lock the order and its payment, check owner and status, and
   record one IN_PROGRESS refund for the whole payment amount.
2. Ask the PG to cancel, outside any transaction, with the refund ID as the idempotency key.
3. Record (short transaction): refunded → refund DONE, order `cancelled` with its history entry,
   coupon and stock given back, all together. A definite rejection marks the refund FAILED and
   leaves the order `paid`. An unknown result keeps IN_PROGRESS: resending the same request or
   the reconciliation job asks the PG again with the same key, so the money is returned once.

Only the whole payment is refunded, while the order is `paid` or `preparing` (before shipment).
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.errors import Conflict, NotFound, Unauthorized
from aura_api.infra.models import Payment, Refund
from aura_api.infra.payment_gateway import GatewayUnavailable, PaymentGateway, RefundResult
from aura_api.infra.repositories import orders as order_repository
from aura_api.infra.repositories import payments as repository
from aura_api.infra.repositories import users
from aura_api.infra.repositories.orders import SavedOrder
from aura_api.services import orders as order_service

MEMBER_REASON = "member request"


class PaymentGatewayUnavailable(Exception):
    """A paid order needs the PG to be cancelled, but no PG is configured."""


def _uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(value) if isinstance(value, str) else None
    except ValueError:
        return None


async def cancel_order(
    session: AsyncSession,
    gateway: PaymentGateway | None,
    member_id: uuid.UUID,
    order_id: object,
) -> tuple[SavedOrder, bool]:
    """Cancel the member's order. Returns the order and whether it is settled.

    Unpaid orders use the unpaid cancel (always settled). A paid order is settled once the PG
    refund is recorded; False means the refund result is still unknown and the order stays
    `paid` (send the same request again).
    """
    target = _uuid(order_id)
    claimed = await _claim(session, member_id, target, gateway is not None)
    if claimed is None:
        return await order_service.cancel_order(session, member_id, order_id), True
    refund_id, payment_key, amount, reason = claimed
    status = await _ask_and_record(session, gateway, refund_id, payment_key, amount, reason)
    if status == "FAILED":
        raise Conflict("REFUND_FAILED", "환불이 거절됐어요. 잠시 후 다시 시도하거나 문의해 주세요.")
    async with session.begin():
        saved = await order_repository.member_order(session, member_id, target)
    return saved, status == "DONE"


async def _claim(
    session: AsyncSession, member_id: uuid.UUID, order_id: uuid.UUID | None, can_ask_pg: bool
) -> tuple[uuid.UUID, str, int, str] | None:
    """The refund to send to the PG, or None when the order is not paid (unpaid rules apply)."""
    async with session.begin():
        if not await users.lock_active_member(session, member_id):
            raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
        order = await repository.lock_order(session, order_id, member_id) if order_id else None
        if order is None:
            raise NotFound("ORDER_NOT_FOUND", "주문을 찾을 수 없어요.")
        if order.status not in ("paid", "preparing"):
            return None
        if not can_ask_pg:
            raise PaymentGatewayUnavailable
        found = await repository.open_payment(session, order.id)
        if found is None or found.status != "DONE" or found.payment_key is None:
            raise Conflict("ORDER_NOT_CANCELLABLE", "취소할 수 없는 주문 상태예요.")
        payment = await repository.lock_payment(session, found.id)
        refund = await repository.active_refund(session, payment.id)
        if refund is None:
            refund = Refund(
                id=uuid.uuid4(),
                payment_id=payment.id,
                order_id=order.id,
                amount=payment.amount,  # the whole stored payment, never a client value
                reason=MEMBER_REASON,
                actor_type="member",
                actor_id=member_id,
            )
            session.add(refund)
            await session.flush()
        elif refund.status == "DONE":
            raise Conflict("REFUND_REVIEW_REQUIRED", "환불 내역을 확인하고 있어요.")
        return refund.id, payment.payment_key, refund.amount, refund.reason


async def _ask_and_record(
    session: AsyncSession,
    gateway: PaymentGateway,
    refund_id: uuid.UUID,
    payment_key: str,
    amount: int,
    reason: str,
) -> str:
    try:
        # Same idempotency key on every retry: the PG answers the first result again.
        result = await gateway.cancel(
            payment_key=payment_key,
            amount=amount,
            reason=reason,
            idempotency_key=str(refund_id),
        )
    except GatewayUnavailable:
        return "IN_PROGRESS"
    try:
        return await record_result(session, refund_id, result) or "IN_PROGRESS"
    except SQLAlchemyError:
        # The PG may have refunded; IN_PROGRESS stays for the retry or reconciliation.
        await session.rollback()
        return "IN_PROGRESS"


async def record_result(
    session: AsyncSession, refund_id: uuid.UUID, result: RefundResult
) -> str | None:
    """Apply a definite PG result once and return the refund status. Closed refunds are kept."""
    async with session.begin():
        found = await session.get(Refund, refund_id)
        if found is None:
            return None
        order = await repository.lock_order(session, found.order_id)
        await repository.lock_payment(session, found.payment_id)
        refund = await repository.lock_refund(session, refund_id)
        if refund.status != "IN_PROGRESS":
            return refund.status
        now = datetime.now(UTC)
        refund.updated_at = now
        if result.outcome == "pending":
            if result.code:
                refund.review_reason = result.code[:100]
            return "IN_PROGRESS"
        if result.outcome == "failed":
            refund.status = "FAILED"
            refund.failure_code = result.code or "REFUND_FAILED"
            refund.failure_message = result.message
            return "FAILED"
        if result.amount != refund.amount:
            refund.review_reason = "REFUND_AMOUNT_MISMATCH"
            return "IN_PROGRESS"
        refund.status = "DONE"
        refund.transaction_key = result.transaction_key
        refund.refunded_at = result.refunded_at or now
        await session.flush()  # a finished refund no longer blocks the status change below
        if order.status not in ("paid", "preparing"):
            # Money went back while the order left `paid`: nothing safe to undo automatically.
            refund.review_reason = "ORDER_NOT_PAID"
            return "DONE"
        await order_repository.change_status(
            session,
            order.id,
            "cancelled",
            actor_type=refund.actor_type,
            actor_id=refund.actor_id,
            reason=refund.reason,
        )
        await order_service.release_holdings(session, order)
        return "DONE"


async def reconcile_refunds(
    session: AsyncSession,
    gateway: PaymentGateway,
    *,
    older_than: timedelta = timedelta(minutes=2),
    limit: int = 100,
) -> dict[str, int]:
    """Ask the PG again about refunds left IN_PROGRESS (timeouts, failed writes)."""
    async with session.begin():
        ids = await repository.unresolved_refunds_before(
            session, datetime.now(UTC) - older_than, limit
        )
    counts = {"checked": len(ids), "done": 0, "failed": 0, "pending": 0}
    for refund_id in ids:
        async with session.begin():
            refund = await session.get(Refund, refund_id, populate_existing=True)
            payment = await session.get(Payment, refund.payment_id, populate_existing=True)
            key, amount, reason = payment.payment_key, refund.amount, refund.reason
        status = await _ask_and_record(session, gateway, refund_id, key, amount, reason)
        counts[{"DONE": "done", "FAILED": "failed"}.get(status, "pending")] += 1
    return counts
