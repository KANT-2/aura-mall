"""Admin review lists for payments and refunds (read only, newest change first)."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter

from aura_api.api.admin.deps import CurrentAdmin
from aura_api.api.admin.schemas import AdminCustomerOut, AdminPage
from aura_api.api.catalog import CamelModel
from aura_api.api.deps import Session
from aura_api.core.errors import ErrorResponse
from aura_api.domain.admin import PAGE_SIZE
from aura_api.domain.ordering import OrderStatus
from aura_api.domain.payments import UNRESOLVED_AFTER, PaymentStatus
from aura_api.infra.models import Order, Payment, Refund, User
from aura_api.services import admin_payments as service

router = APIRouter()
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 403)}


class AdminPaymentReviewOut(CamelModel):
    """A payment attempt for operators. The PG paymentKey is never included."""

    id: uuid.UUID
    order_id: uuid.UUID
    pg_order_id: str
    order_status: OrderStatus
    customer: AdminCustomerOut | None
    status: PaymentStatus
    amount: int
    method: str | None
    review_reason: str | None
    unresolved: bool
    failure_code: str | None
    failure_message: str | None
    approved: datetime | None
    created: datetime
    updated: datetime


class AdminRefundReviewOut(CamelModel):
    """A refund attempt for operators. The PG transactionKey is never included."""

    id: uuid.UUID
    payment_id: uuid.UUID
    order_id: uuid.UUID
    order_status: OrderStatus
    customer: AdminCustomerOut | None
    status: str
    amount: int
    reason: str
    actor_type: str
    review_reason: str | None
    unresolved: bool
    failure_code: str | None
    failure_message: str | None
    requested: datetime
    refunded: datetime | None
    updated: datetime


def _customer(user: User | None) -> AdminCustomerOut | None:
    return AdminCustomerOut(id=user.id, name=user.name, email=user.email) if user else None


def _unresolved(status: str, since: datetime | None) -> bool:
    return (
        status == "IN_PROGRESS"
        and since is not None
        and since < datetime.now(UTC) - UNRESOLVED_AFTER
    )


def payment_review_out(payment: Payment, order: Order, user: User | None) -> AdminPaymentReviewOut:
    return AdminPaymentReviewOut(
        id=payment.id,
        order_id=order.id,
        pg_order_id=payment.pg_order_id,
        order_status=order.status,
        customer=_customer(user),
        status=payment.status,
        amount=payment.amount,
        method=payment.method,
        review_reason=payment.review_reason,
        unresolved=_unresolved(payment.status, payment.confirm_started_at),
        failure_code=payment.failure_code,
        failure_message=payment.failure_message,
        approved=payment.approved_at,
        created=payment.created_at,
        updated=payment.updated_at,
    )


def refund_review_out(refund: Refund, order: Order, user: User | None) -> AdminRefundReviewOut:
    return AdminRefundReviewOut(
        id=refund.id,
        payment_id=refund.payment_id,
        order_id=order.id,
        order_status=order.status,
        customer=_customer(user),
        status=refund.status,
        amount=refund.amount,
        reason=refund.reason,
        actor_type=refund.actor_type,
        review_reason=refund.review_reason,
        unresolved=_unresolved(refund.status, refund.requested_at),
        failure_code=refund.failure_code,
        failure_message=refund.failure_message,
        requested=refund.requested_at,
        refunded=refund.refunded_at,
        updated=refund.updated_at,
    )


@router.get(
    "/payments/review",
    response_model=AdminPage[AdminPaymentReviewOut],
    responses=ERRORS,
    summary="검토가 필요한 결제 목록 (검토 사유가 있거나 PG 결과를 확인하지 못한 결제)",
)
async def payments_to_review(
    admin: CurrentAdmin,
    session: Session,
    status: str | None = None,
    reason: str | None = None,
    page: str | None = None,
) -> AdminPage[AdminPaymentReviewOut]:
    rows, total, number = await service.payments_to_review(
        session, status=status, reason=reason, page=page
    )
    return AdminPage[AdminPaymentReviewOut](
        items=[payment_review_out(*row) for row in rows],
        total=total,
        page=number,
        page_size=PAGE_SIZE,
    )


@router.get(
    "/refunds/review",
    response_model=AdminPage[AdminRefundReviewOut],
    responses=ERRORS,
    summary="검토가 필요한 환불 목록 (PG 거절·검토 사유·결과 불명)",
)
async def refunds_to_review(
    admin: CurrentAdmin,
    session: Session,
    status: str | None = None,
    reason: str | None = None,
    page: str | None = None,
) -> AdminPage[AdminRefundReviewOut]:
    rows, total, number = await service.refunds_to_review(
        session, status=status, reason=reason, page=page
    )
    return AdminPage[AdminRefundReviewOut](
        items=[refund_review_out(*row) for row in rows],
        total=total,
        page=number,
        page_size=PAGE_SIZE,
    )
