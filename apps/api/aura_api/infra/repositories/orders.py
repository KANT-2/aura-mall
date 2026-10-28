"""Order intake and history. Items keep a snapshot of the product as it was when ordered."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.errors import Conflict
from aura_api.domain.ordering import ActorType, PricedOrder, ensure_status_change
from aura_api.infra.models import (
    Order,
    OrderItem,
    OrderItemSelection,
    OrderStatusHistory,
    Payment,
    Product,
    ProductType,
    UserCoupon,
)
from aura_api.infra.repositories import payments


@dataclass(frozen=True)
class SavedItem:
    key: str
    product: dict[str, Any]  # Product DTO snapshot (camelCase)
    quantity: int
    selection: list[str]
    custom: dict[str, Any] | None
    unit_price: int


@dataclass(frozen=True)
class SavedOrder:
    id: uuid.UUID
    items: list[SavedItem]
    total: int
    recipient: str
    address: str
    created_at: datetime
    status: str
    recipient_phone: str = ""
    delivery_note: str = ""
    courier: str = ""
    tracking_number: str = ""
    is_demo: bool = False


@dataclass(frozen=True)
class StatusChange:
    from_status: str | None
    to_status: str
    actor_type: str
    actor_id: uuid.UUID | None
    reason: str | None
    changed_at: datetime


async def products_with_type_names(session: AsyncSession) -> dict[str, tuple[Product, str]]:
    rows = await session.execute(
        select(Product, ProductType.name).join(ProductType, Product.type_id == ProductType.id)
    )
    return {product.id: (product, type_name) for product, type_name in rows}


async def lock_available_coupon(session: AsyncSession, user_id: uuid.UUID) -> UserCoupon | None:
    """The member's unused free-shipping coupon, locked until the order commits."""
    return await session.scalar(
        select(UserCoupon)
        .where(UserCoupon.user_id == user_id, UserCoupon.status == "AVAILABLE")
        .with_for_update()
    )


async def take_stock(session: AsyncSession, product_id: str, quantity: int) -> bool:
    """Decrement only if enough is left; False means another order got there first."""
    result = await session.execute(
        update(Product)
        .where(Product.id == product_id, Product.stock >= quantity)
        .values(stock=Product.stock - quantity)
    )
    return result.rowcount == 1


async def use_coupon(session: AsyncSession, coupon_id: uuid.UUID, order_id: uuid.UUID) -> bool:
    result = await session.execute(
        update(UserCoupon)
        .where(UserCoupon.id == coupon_id, UserCoupon.status == "AVAILABLE")
        .values(status="USED", used_order_id=order_id, used_at=datetime.now(UTC))
    )
    return result.rowcount == 1


async def add_order(
    session: AsyncSession,
    user_id: uuid.UUID,
    priced: PricedOrder,
    snapshots: list[dict[str, Any]],
    selection_names: dict[str, str],
    coupon_id: uuid.UUID | None,
    idempotency_key: str | None = None,
    *,
    recipient_phone: str = "",
    delivery_note: str = "",
) -> SavedOrder:
    """`snapshots[i]` is the product DTO for `priced.lines[i]`."""
    order = Order(
        user_id=user_id,
        idempotency_key=idempotency_key,
        recipient=priced.recipient,
        recipient_phone=recipient_phone,
        delivery_note=delivery_note,
        address=priced.address,
        items_amount=priced.items_amount,
        shipping_fee=priced.shipping_fee,
        total=priced.total,
        coupon_id=coupon_id,
    )
    session.add(order)
    await session.flush()
    items: list[SavedItem] = []
    for position, (line, snapshot) in enumerate(zip(priced.lines, snapshots, strict=True)):
        custom = (
            {
                "name": line.custom.name,
                "label": line.custom.label,
                "color": line.custom.color,
                "counts": line.custom.counts,
                "productType": line.custom.product_type,
            }
            if line.custom
            else None
        )
        row = OrderItem(
            order_id=order.id,
            position=position,
            line_key=line.key,
            kind=line.kind,
            product_id=snapshot["id"],
            product_snapshot=snapshot,
            unit_price=line.unit_price,
            quantity=line.quantity,
            custom=custom,
        )
        session.add(row)
        await session.flush()
        session.add_all(
            OrderItemSelection(
                order_item_id=row.id,
                product_id=product_id,
                product_name=selection_names[product_id],
                unit_price=line.unit_price,
                position=index,
            )
            for index, product_id in enumerate(line.selection)
        )
        items.append(
            SavedItem(
                line.key, snapshot, line.quantity, list(line.selection), custom, line.unit_price
            )
        )
    await session.flush()
    await session.refresh(order, ["created_at", "status"])
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            to_status=order.status,
            actor_type="member",
            actor_id=user_id,
            changed_at=order.created_at,
        )
    )
    await session.flush()
    return SavedOrder(
        order.id,
        items,
        order.total,
        order.recipient,
        order.address,
        order.created_at,
        order.status,
        order.recipient_phone,
        order.delivery_note,
        order.courier,
        order.tracking_number,
        order.is_demo,
    )


async def list_orders(session: AsyncSession, user_id: uuid.UUID) -> list[SavedOrder]:
    orders = list(
        await session.scalars(
            select(Order)
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc(), Order.id)
        )
    )
    return await _saved(session, orders)


async def order_by_key(
    session: AsyncSession, user_id: uuid.UUID, idempotency_key: str
) -> SavedOrder | None:
    """The member's earlier order sent with the same idempotency key."""
    order = await session.scalar(
        select(Order).where(Order.user_id == user_id, Order.idempotency_key == idempotency_key)
    )
    return (await _saved(session, [order]))[0] if order else None


async def member_order(
    session: AsyncSession, user_id: uuid.UUID, order_id: uuid.UUID
) -> SavedOrder | None:
    order = await session.scalar(
        select(Order)
        .where(Order.id == order_id, Order.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    return (await _saved(session, [order]))[0] if order else None


async def stored_lines(
    session: AsyncSession, order_id: uuid.UUID
) -> list[tuple[str, str, int, list[str]]]:
    """(kind, product ID, quantity, Gift Set product IDs) for each item of the order."""
    rows = list(
        await session.scalars(
            select(OrderItem).where(OrderItem.order_id == order_id).order_by(OrderItem.position)
        )
    )
    chosen: dict[uuid.UUID, list[str]] = {}
    if rows:
        selections = await session.scalars(
            select(OrderItemSelection).where(
                OrderItemSelection.order_item_id.in_([row.id for row in rows])
            )
        )
        for selection in selections:
            chosen.setdefault(selection.order_item_id, []).append(selection.product_id)
    return [(row.kind, row.product_id, row.quantity, chosen.get(row.id, [])) for row in rows]


async def give_back_stock(session: AsyncSession, product_id: str, quantity: int) -> None:
    await session.execute(
        update(Product).where(Product.id == product_id).values(stock=Product.stock + quantity)
    )


async def give_back_coupon(
    session: AsyncSession, coupon_id: uuid.UUID, order_id: uuid.UUID
) -> bool:
    """Make the coupon usable again, only if this order is the one that used it."""
    result = await session.execute(
        update(UserCoupon)
        .where(
            UserCoupon.id == coupon_id,
            UserCoupon.status == "USED",
            UserCoupon.used_order_id == order_id,
        )
        .values(status="AVAILABLE", used_order_id=None, used_at=None)
    )
    return result.rowcount == 1


async def unpaid_before(session: AsyncSession, cutoff: datetime, limit: int) -> list[uuid.UUID]:
    """Eligible `received` orders, excluding unknown/approved payments before LIMIT."""
    return list(
        await session.scalars(
            select(Order.id)
            .where(
                Order.status == "received",
                Order.is_demo.is_(False),
                Order.created_at <= cutoff,
                ~select(Payment.id)
                .where(Payment.order_id == Order.id, Payment.status.in_(("IN_PROGRESS", "DONE")))
                .exists(),
            )
            .order_by(Order.created_at, Order.id)
            .limit(limit)
        )
    )


async def _saved(session: AsyncSession, orders: list[Order]) -> list[SavedOrder]:
    if not orders:
        return []
    order_ids = [order.id for order in orders]
    rows = list(
        await session.scalars(
            select(OrderItem)
            .where(OrderItem.order_id.in_(order_ids))
            .order_by(OrderItem.order_id, OrderItem.position)
        )
    )
    selections: dict[uuid.UUID, list[str]] = {}
    if rows:
        chosen = await session.scalars(
            select(OrderItemSelection)
            .where(OrderItemSelection.order_item_id.in_([row.id for row in rows]))
            .order_by(OrderItemSelection.order_item_id, OrderItemSelection.position)
        )
        for item in chosen:
            selections.setdefault(item.order_item_id, []).append(item.product_id)
    items: dict[uuid.UUID, list[SavedItem]] = {order_id: [] for order_id in order_ids}
    for row in rows:
        items[row.order_id].append(
            SavedItem(
                row.line_key,
                row.product_snapshot,
                row.quantity,
                selections.get(row.id, []),
                row.custom,
                row.unit_price,
            )
        )
    return [
        SavedOrder(
            order.id,
            items[order.id],
            order.total,
            order.recipient,
            order.address,
            order.created_at,
            order.status,
            order.recipient_phone,
            order.delivery_note,
            order.courier,
            order.tracking_number,
            order.is_demo,
        )
        for order in orders
    ]


async def status_history(session: AsyncSession, order_id: uuid.UUID) -> list[StatusChange]:
    """Oldest first, including the first 'received' entry."""
    rows = await session.scalars(
        select(OrderStatusHistory)
        .where(OrderStatusHistory.order_id == order_id)
        .order_by(OrderStatusHistory.changed_at, OrderStatusHistory.id)
    )
    return [
        StatusChange(
            row.from_status, row.to_status, row.actor_type, row.actor_id, row.reason, row.changed_at
        )
        for row in rows
    ]


async def change_status(
    session: AsyncSession,
    order_id: uuid.UUID,
    new_status: object,
    *,
    actor_type: ActorType,
    actor_id: uuid.UUID | None,
    reason: object = None,
    owner_id: uuid.UUID | None = None,
    payment_verified: bool = False,
) -> Order | None:
    """Apply one status change under the order row lock and record it.

    `owner_id` limits the change to that member's order. None means no such order. The
    caller's transaction commits the change; follow-up work (stock, coupon) joins it.
    """
    # Reload under the lock even if this session already holds the order with an older status.
    query = (
        select(Order)
        .where(Order.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if owner_id is not None:
        query = query.where(Order.user_id == owner_id)
    order = await session.scalar(query)
    if order is None:
        return None
    note = ensure_status_change(order.status, new_status, reason, payment_verified=payment_verified)
    if order.status in ("paid", "preparing") and await payments.has_pending_refund(
        session, order.id
    ):
        # The PG may be returning the money right now: the refund decides what the order becomes.
        raise Conflict("REFUND_IN_PROGRESS", "환불을 확인하고 있어 주문 상태를 바꿀 수 없어요.")
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=order.status,
            to_status=new_status,
            actor_type=actor_type,
            actor_id=actor_id,
            reason=note,
        )
    )
    order.status = new_status
    await session.flush()
    return order
