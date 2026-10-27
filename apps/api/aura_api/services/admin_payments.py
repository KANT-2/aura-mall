"""Admin lists of payments and refunds that need review. Read only: nothing here calls the PG."""

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain import admin as rules
from aura_api.domain.payments import PAYMENT_STATUSES, REFUND_STATUSES, review_filter
from aura_api.infra.repositories import admin_payments as repository
from aura_api.infra.repositories.admin_payments import PaymentRow, RefundRow


async def payments_to_review(
    session: AsyncSession, *, status: object, reason: object, page: object
) -> tuple[list[PaymentRow], int, int]:
    status, reason = review_filter(status, reason, PAYMENT_STATUSES)
    number = rules.page_number(page)
    rows, total = await repository.payments_to_review(
        session, status=status, reason=reason, page=number
    )
    return rows, total, number


async def refunds_to_review(
    session: AsyncSession, *, status: object, reason: object, page: object
) -> tuple[list[RefundRow], int, int]:
    status, reason = review_filter(status, reason, REFUND_STATUSES)
    number = rules.page_number(page)
    rows, total = await repository.refunds_to_review(
        session, status=status, reason=reason, page=number
    )
    return rows, total, number
