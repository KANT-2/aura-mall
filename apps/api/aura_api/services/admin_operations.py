"""Admin use cases for orders, partner inquiries and the overview."""

import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain import admin as rules
from aura_api.domain.errors import Conflict, NotFound
from aura_api.infra.models import AdminAuditLog, Order, OrderItem, PartnerInquiry, User
from aura_api.infra.repositories import admin as repository
from aura_api.infra.repositories import orders as order_repository
from aura_api.infra.repositories.admin import OverviewCounts
from aura_api.infra.repositories.orders import StatusChange


@dataclass(frozen=True)
class OrderView:
    order: Order
    customer: User | None
    lines: list[tuple[OrderItem, list[str]]]  # item, Gift Set product names
    history: list[StatusChange] = field(default_factory=list)  # filled for the detail only

    @property
    def title(self) -> str:
        if not self.lines:
            return "주문 상품 없음"
        rest = len(self.lines) - 1
        return line_name(self.lines[0][0]) + (f" 외 {rest}건" if rest else "")

    @property
    def item_count(self) -> int:
        return sum(item.quantity for item, _ in self.lines)


@dataclass(frozen=True)
class InquiryView:
    inquiry: PartnerInquiry
    history: list[tuple[AdminAuditLog, str]]


@dataclass(frozen=True)
class Overview:
    counts: OverviewCounts
    recent_orders: list[OrderView]
    recent_inquiries: list[PartnerInquiry]


def line_name(item: OrderItem) -> str:
    """The custom composition's own name, otherwise the product name at order time."""
    return item.custom["name"] if item.custom else item.product_snapshot["name"]


def _uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _text(value: object) -> str:
    return value.strip()[:100] if isinstance(value, str) else ""


async def _order_views(
    session: AsyncSession, rows: list[tuple[Order, User | None]]
) -> list[OrderView]:
    lines = await repository.order_lines(session, [order.id for order, _ in rows])
    return [OrderView(order, user, lines[order.id]) for order, user in rows]


async def list_orders(
    session: AsyncSession, *, start: object, end: object, page: object
) -> tuple[list[OrderView], int, int]:
    since, until = rules.date_range(start, end)
    number = rules.page_number(page)
    rows, total = await repository.list_orders(session, since=since, until=until, page=number)
    return await _order_views(session, rows), total, number


async def order_detail(session: AsyncSession, order_id: str) -> OrderView:
    target = _uuid(order_id)
    found = await repository.order(session, target) if target else None
    if found is None:
        raise NotFound("ORDER_NOT_FOUND", "주문을 찾을 수 없어요.")
    [view] = await _order_views(session, [found])
    return replace(view, history=await order_repository.status_history(session, view.order.id))


async def list_inquiries(
    session: AsyncSession, *, status: object, page: object
) -> tuple[list[PartnerInquiry], int, int]:
    number = rules.page_number(page)
    rows, total = await repository.list_inquiries(session, status=_text(status), page=number)
    return rows, total, number


def _inquiry_not_found() -> NotFound:
    return NotFound("INQUIRY_NOT_FOUND", "입점 문의를 찾을 수 없어요.")


async def inquiry_detail(session: AsyncSession, inquiry_id: str) -> InquiryView:
    target = _uuid(inquiry_id)
    inquiry = await repository.inquiry(session, target) if target else None
    if inquiry is None:
        raise _inquiry_not_found()
    return InquiryView(inquiry, await repository.history(session, "inquiry", str(inquiry.id)))


async def update_inquiry(
    session: AsyncSession, admin_id: uuid.UUID, inquiry_id: str, raw: Mapping[str, Any]
) -> InquiryView:
    target = _uuid(inquiry_id)
    async with session.begin():
        inquiry = await repository.inquiry(session, target, lock=True) if target else None
        if inquiry is None:
            raise _inquiry_not_found()
        rules.check_version(raw.get("version"), inquiry.version)
        changes = rules.inquiry_changes(raw, inquiry.status, inquiry.internal_memo)
        if changes:
            for change in changes:
                if change["field"] == "status":
                    inquiry.status = change["to"]
                else:
                    inquiry.internal_memo = change["to"]
            inquiry.version += 1
            inquiry.updated_at = datetime.now(UTC)
            repository.add_audit(
                session,
                actor_id=admin_id,
                action="inquiry.update",
                target_type="inquiry",
                target_id=str(inquiry.id),
                changes=changes,
            )
            await session.flush()
        return InquiryView(inquiry, await repository.history(session, "inquiry", str(inquiry.id)))


async def overview(session: AsyncSession) -> Overview:
    since = datetime.now(UTC) - timedelta(days=rules.RECENT_DAYS)
    counts = await repository.overview_counts(session, since)
    orders, _ = await repository.list_orders(session, since=None, until=None, page=1)
    inquiries, _ = await repository.list_inquiries(session, status="", page=1)
    return Overview(counts, await _order_views(session, orders[:5]), inquiries[:5])


async def fulfill_order(
    session: AsyncSession, admin_id: uuid.UUID, order_id: str, raw: dict
) -> OrderView:
    from sqlalchemy import select

    target = _uuid(order_id)
    async with session.begin():
        order = (
            await session.scalar(select(Order).where(Order.id == target).with_for_update())
            if target
            else None
        )
        if order is None:
            raise NotFound("ORDER_NOT_FOUND", "주문을 찾을 수 없어요.")
        if order.status != raw["expected_status"]:
            raise Conflict("ORDER_CHANGED", "주문 상태가 바뀌었어요. 최신 내용을 확인해 주세요.")
        if raw["status"] == "shipped":
            order.courier = raw["courier"].strip()
            order.tracking_number = raw["tracking_number"].strip()
            if not order.courier or not order.tracking_number:
                raise Conflict("TRACKING_REQUIRED", "택배사와 운송장 번호를 입력해 주세요.")
        await order_repository.change_status(
            session,
            order.id,
            raw["status"],
            actor_type="admin",
            actor_id=admin_id,
            reason=raw["reason"],
        )
        await session.flush()
        return await order_detail(session, str(order.id))
