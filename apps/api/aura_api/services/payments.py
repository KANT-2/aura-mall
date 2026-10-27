"""Payment use cases: issue an attempt, confirm it with the PG, and reconcile unknown results.

Confirmation runs in three steps so no database lock is held while the PG is called:

1. Claim (short transaction): lock the order and its attempt, check owner, order status and
   amount, then mark the attempt IN_PROGRESS with the PG paymentKey.
2. Ask the PG, outside any transaction, with the attempt ID as the idempotency key.
3. Record (short transaction): DONE → the order becomes `paid` with a history entry; FAILED
   leaves the order `received`. An unknown result keeps IN_PROGRESS; resending the same
   confirmation or the reconciliation job asks the PG again with the same idempotency key.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.errors import Conflict, NotFound, Unauthorized
from aura_api.domain.payments import confirm_input, ensure_amount, order_name, pg_order_id
from aura_api.infra.models import Payment
from aura_api.infra.payment_gateway import GatewayResult, GatewayUnavailable, PaymentGateway
from aura_api.infra.repositories import orders as order_repository
from aura_api.infra.repositories import payments as repository
from aura_api.infra.repositories import users


@dataclass(frozen=True)
class PaymentView:
    id: uuid.UUID
    order_id: uuid.UUID
    pg_order_id: str
    order_name: str
    amount: int
    status: str
    method: str | None
    approved_at: datetime | None
    failure_code: str | None
    failure_message: str | None


def _view(payment: Payment, name: str) -> PaymentView:
    return PaymentView(
        payment.id,
        payment.order_id,
        payment.pg_order_id,
        name,
        payment.amount,
        payment.status,
        payment.method,
        payment.approved_at,
        payment.failure_code,
        payment.failure_message,
    )


async def _name(session: AsyncSession, order_id: uuid.UUID) -> str:
    return order_name(*await repository.first_item_and_count(session, order_id))


def _uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(value) if isinstance(value, str) else None
    except ValueError:
        return None


async def start_payment(
    session: AsyncSession, gateway: PaymentGateway, member_id: uuid.UUID, order_id: object
) -> tuple[PaymentView, bool]:
    """Issue (or reuse) the READY attempt for the member's own unpaid order."""
    target = _uuid(order_id)
    async with session.begin():
        if not await users.lock_active_member(session, member_id):
            raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
        order = await repository.lock_order(session, target, member_id) if target else None
        if order is None:
            raise NotFound("ORDER_NOT_FOUND", "주문을 찾을 수 없어요.")
        existing = await repository.open_payment(session, order.id)
        if existing is not None and existing.status == "DONE":
            raise Conflict("ORDER_ALREADY_PAID", "이미 결제된 주문이에요.")
        if existing is not None and existing.status == "IN_PROGRESS":
            raise Conflict("PAYMENT_IN_PROGRESS", "결제를 확인하고 있어요. 잠시 후 확인해 주세요.")
        if order.status != "received":
            raise Conflict("ORDER_NOT_PAYABLE", "결제할 수 없는 주문 상태예요.")
        name = await _name(session, order.id)
        if existing is not None:
            return _view(existing, name), False
        payment_id = uuid.uuid4()
        payment = Payment(
            id=payment_id,
            order_id=order.id,
            provider=gateway.provider,
            pg_order_id=pg_order_id(payment_id.hex),
            amount=order.total,  # the stored order total, never a client value
        )
        session.add(payment)
        await session.flush()
        await session.refresh(payment)
        return _view(payment, name), True


async def payment_detail(
    session: AsyncSession, member_id: uuid.UUID, payment_id: object
) -> PaymentView:
    target = _uuid(payment_id)
    async with session.begin():
        payment = (
            await repository.member_payment(session, member_id, payment_id=target)
            if target
            else None
        )
        if payment is None:
            raise NotFound("PAYMENT_NOT_FOUND", "결제를 찾을 수 없어요.")
        return _view(payment, await _name(session, payment.order_id))


async def confirm_payment(
    session: AsyncSession,
    gateway: PaymentGateway,
    member_id: uuid.UUID,
    payment_key: object,
    pg_order: object,
    amount: object,
) -> PaymentView:
    key, pg_order_id_value, claimed_amount = confirm_input(payment_key, pg_order, amount)
    try:
        async with session.begin():
            if not await users.lock_active_member(session, member_id):
                raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
            found = await repository.member_payment(
                session, member_id, pg_order_id=pg_order_id_value
            )
            if found is None:
                raise NotFound("PAYMENT_NOT_FOUND", "결제를 찾을 수 없어요.")
            order = await repository.lock_order(session, found.order_id)
            payment = await repository.lock_payment(session, found.id)
            ensure_amount(payment.amount, claimed_amount)
            name = await _name(session, payment.order_id)
            if payment.status == "DONE":
                if payment.payment_key != key:
                    raise Conflict("ORDER_ALREADY_PAID", "이미 결제된 주문이에요.")
                return _view(payment, name)  # the same approval sent again
            if payment.status in ("FAILED", "CANCELED"):
                raise Conflict("PAYMENT_CLOSED", "결제가 완료되지 않았어요. 다시 결제해 주세요.")
            if payment.status == "IN_PROGRESS" and payment.payment_key != key:
                raise Conflict(
                    "PAYMENT_IN_PROGRESS", "결제를 확인하고 있어요. 잠시 후 확인해 주세요."
                )
            if payment.status == "READY":
                if order.status != "received":
                    raise Conflict("ORDER_NOT_PAYABLE", "결제할 수 없는 주문 상태예요.")
                payment.status = "IN_PROGRESS"
                payment.payment_key = key
                payment.confirm_started_at = payment.updated_at = datetime.now(UTC)
            pending = _view(payment, name)
    except IntegrityError:
        # The paymentKey already belongs to another attempt.
        await session.rollback()
        raise Conflict("PAYMENT_KEY_CONFLICT", "결제 정보를 확인해 주세요.") from None
    return await _ask_and_record(session, gateway, pending, key)


async def _ask_and_record(
    session: AsyncSession, gateway: PaymentGateway, pending: PaymentView, key: str
) -> PaymentView:
    try:
        # Same idempotency key on every retry: the PG answers the first result again.
        result = await gateway.confirm(
            payment_key=key,
            order_id=pending.pg_order_id,
            amount=pending.amount,
            idempotency_key=str(pending.id),
        )
    except GatewayUnavailable:
        return pending
    try:
        return await record_result(session, pending.id, result) or pending
    except SQLAlchemyError:
        # The PG may have approved; IN_PROGRESS stays for the retry or reconciliation.
        await session.rollback()
        return pending


async def record_result(
    session: AsyncSession, payment_id: uuid.UUID, result: GatewayResult
) -> PaymentView | None:
    """Apply a definite PG result once. A result for an attempt already closed is ignored."""
    async with session.begin():
        found = await session.get(Payment, payment_id)
        if found is None:
            return None
        order = await repository.lock_order(session, found.order_id)
        payment = await repository.lock_payment(session, payment_id)
        name = await _name(session, payment.order_id)
        if payment.status != "IN_PROGRESS" or result.outcome == "pending":
            return _view(payment, name)
        now = datetime.now(UTC)
        payment.updated_at = now
        if result.outcome == "failed":
            payment.status = "FAILED"
            payment.failure_code = result.code or "PAYMENT_FAILED"
            payment.failure_message = result.message
            if result.canceled:
                payment.review_reason = "CANCELED_AT_PG"
            return _view(payment, name)
        payment.status = "DONE"
        payment.approved_at = result.approved_at or now
        payment.method = result.method
        if (result.payment_key, result.order_id, result.amount) != (
            payment.payment_key,
            payment.pg_order_id,
            payment.amount,
        ):
            payment.review_reason = "PG_RESULT_MISMATCH"
        elif order.status != "received":
            # Approved while the order left `received`: money taken, order not payable.
            payment.review_reason = "ORDER_NOT_PAYABLE"
        else:
            await order_repository.change_status(
                session,
                order.id,
                "paid",
                actor_type="system",
                actor_id=None,
                reason=f"payment {payment.id}",
                payment_verified=True,
            )
        await session.flush()
        return _view(payment, name)


async def reconcile_payments(
    session: AsyncSession,
    gateway: PaymentGateway,
    *,
    older_than: timedelta = timedelta(minutes=2),
    limit: int = 100,
) -> dict[str, int]:
    """Ask the PG again about attempts left IN_PROGRESS (timeouts, failed writes)."""
    async with session.begin():
        ids = await repository.unresolved_before(session, datetime.now(UTC) - older_than, limit)
    counts = {"checked": len(ids), "done": 0, "failed": 0, "pending": 0}
    for payment_id in ids:
        async with session.begin():
            payment = await session.get(Payment, payment_id, populate_existing=True)
            key, order_id, amount = payment.payment_key, payment.pg_order_id, payment.amount
        try:
            result = await gateway.confirm(
                payment_key=key, order_id=order_id, amount=amount, idempotency_key=str(payment_id)
            )
        except GatewayUnavailable:
            counts["pending"] += 1
            continue
        view = await record_result(session, payment_id, result)
        status = view.status if view else "IN_PROGRESS"
        counts[{"DONE": "done", "FAILED": "failed"}.get(status, "pending")] += 1
    return counts
