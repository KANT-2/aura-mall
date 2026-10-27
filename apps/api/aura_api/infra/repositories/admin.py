"""Admin reads and writes: accounts, products, stock, orders, inquiries and the audit log."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.admin import HISTORY_LIMIT, LOW_STOCK, PAGE_SIZE
from aura_api.infra.models import (
    Admin,
    AdminAuditLog,
    Order,
    OrderItem,
    OrderItemSelection,
    PartnerInquiry,
    Product,
    ProductType,
    StockAdjustment,
    User,
)


async def active_admin(session: AsyncSession, admin_id: uuid.UUID) -> Admin | None:
    """Checked on every admin request, so a disabled admin is refused at once."""
    return await session.scalar(select(Admin).where(Admin.id == admin_id, Admin.status == "active"))


async def is_customer(session: AsyncSession, user_id: uuid.UUID) -> bool:
    return await session.scalar(select(User.id).where(User.id == user_id)) is not None


async def image_options(session: AsyncSession) -> list[str]:
    return list(await session.scalars(select(Product.image).distinct().order_by(Product.image)))


def _product_query():
    return select(Product, ProductType.name).join(ProductType, Product.type_id == ProductType.id)


async def list_products(
    session: AsyncSession, *, q: str, collection: str, stock: str, page: int
) -> tuple[list[tuple[Product, str]], int]:
    """Catalog order, 20 per page. `q` matches ID, names and type name, ignoring case."""
    query = _product_query()
    if collection:
        query = query.where(Product.collection_id == collection)
    if stock == "low":
        query = query.where(Product.stock <= LOW_STOCK)
    elif stock == "out":
        query = query.where(Product.stock == 0)
    if q:
        pattern = f"%{q.lower()}%"
        query = query.where(
            or_(
                *(
                    func.lower(column).like(pattern)
                    for column in (Product.id, Product.name, Product.english_name, ProductType.name)
                )
            )
        )
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.execute(
        query.order_by(Product.sort_order).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
    )
    return [(product, type_name) for product, type_name in rows], total or 0


async def product(
    session: AsyncSession, product_id: str, *, lock: bool = False
) -> tuple[Product, str] | None:
    """`lock` holds the row until commit so concurrent edits are checked one at a time."""
    query = _product_query().where(Product.id == product_id)
    if lock:
        query = query.with_for_update(of=Product)
    row = (await session.execute(query)).first()
    return None if row is None else (row[0], row[1])


async def stock_request(session: AsyncSession, key: str) -> StockAdjustment | None:
    return await session.scalar(select(StockAdjustment).where(StockAdjustment.request_key == key))


def add_stock_adjustment(
    session: AsyncSession,
    *,
    product_id: str,
    before: int,
    after: int,
    reason: str,
    key: str,
    actor_id: uuid.UUID,
) -> None:
    session.add(
        StockAdjustment(
            product_id=product_id,
            delta=after - before,
            stock_before=before,
            stock_after=after,
            reason=reason,
            request_key=key,
            actor_id=actor_id,
        )
    )


def add_audit(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID,
    action: str,
    target_type: str,
    target_id: str,
    changes: list[dict[str, Any]],
    reason: str | None = None,
) -> None:
    session.add(
        AdminAuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            changes=changes,
            reason=reason,
        )
    )


async def history(
    session: AsyncSession, target_type: str, target_id: str
) -> list[tuple[AdminAuditLog, str]]:
    """Newest 30 entries with the acting admin's name."""
    rows = await session.execute(
        select(AdminAuditLog, Admin.name)
        .join(Admin, AdminAuditLog.actor_id == Admin.id)
        .where(AdminAuditLog.target_type == target_type, AdminAuditLog.target_id == target_id)
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id)
        .limit(HISTORY_LIMIT)
    )
    return [(entry, name) for entry, name in rows]


async def list_orders(
    session: AsyncSession, *, since: datetime | None, until: datetime | None, page: int
) -> tuple[list[tuple[Order, User | None]], int]:
    """Newest first, with the ordering member (None if the account was removed)."""
    query = select(Order, User).outerjoin(User, Order.user_id == User.id)
    if since is not None:
        query = query.where(Order.created_at >= since)
    if until is not None:
        query = query.where(Order.created_at < until)
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.execute(
        query.order_by(Order.created_at.desc(), Order.id)
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    )
    return [(order, user) for order, user in rows], total or 0


async def order(session: AsyncSession, order_id: uuid.UUID) -> tuple[Order, User | None] | None:
    row = (
        await session.execute(
            select(Order, User)
            .outerjoin(User, Order.user_id == User.id)
            .where(Order.id == order_id)
        )
    ).first()
    return None if row is None else (row[0], row[1])


async def order_lines(
    session: AsyncSession, order_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[OrderItem, list[str]]]]:
    """Items in order position with the Gift Set product names chosen at order time."""
    lines: dict[uuid.UUID, list[tuple[OrderItem, list[str]]]] = {key: [] for key in order_ids}
    if not order_ids:
        return lines
    items = list(
        await session.scalars(
            select(OrderItem)
            .where(OrderItem.order_id.in_(order_ids))
            .order_by(OrderItem.order_id, OrderItem.position)
        )
    )
    names: dict[uuid.UUID, list[str]] = {}
    if items:
        chosen = await session.scalars(
            select(OrderItemSelection)
            .where(OrderItemSelection.order_item_id.in_([item.id for item in items]))
            .order_by(OrderItemSelection.order_item_id, OrderItemSelection.position)
        )
        for selection in chosen:
            names.setdefault(selection.order_item_id, []).append(selection.product_name)
    for item in items:
        lines[item.order_id].append((item, names.get(item.id, [])))
    return lines


async def list_inquiries(
    session: AsyncSession, *, status: str, page: int
) -> tuple[list[PartnerInquiry], int]:
    query = select(PartnerInquiry)
    if status:
        query = query.where(PartnerInquiry.status == status)
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.scalars(
        query.order_by(PartnerInquiry.created_at.desc(), PartnerInquiry.id)
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    )
    return list(rows), total or 0


async def inquiry(
    session: AsyncSession, inquiry_id: uuid.UUID, *, lock: bool = False
) -> PartnerInquiry | None:
    query = select(PartnerInquiry).where(PartnerInquiry.id == inquiry_id)
    if lock:
        query = query.with_for_update()
    return await session.scalar(query)


@dataclass(frozen=True)
class OverviewCounts:
    products: int
    low_stock: int
    sold_out: int
    low_stock_products: list[Product]
    orders: int
    recent_orders: int
    recent_revenue: int
    inquiries: dict[str, int]


async def overview_counts(session: AsyncSession, since: datetime) -> OverviewCounts:
    products = await session.scalar(select(func.count()).select_from(Product))
    low = await session.scalar(
        select(func.count()).where(Product.stock > 0, Product.stock <= LOW_STOCK)
    )
    sold_out = await session.scalar(select(func.count()).where(Product.stock == 0))
    lowest = list(
        await session.scalars(
            select(Product)
            .where(Product.stock <= LOW_STOCK)
            .order_by(Product.stock, Product.sort_order)
            .limit(5)
        )
    )
    orders = await session.scalar(select(func.count()).select_from(Order))
    recent, revenue = (
        await session.execute(
            select(func.count(), func.coalesce(func.sum(Order.total), 0)).where(
                Order.created_at >= since
            )
        )
    ).one()
    statuses = dict(
        (
            await session.execute(
                select(PartnerInquiry.status, func.count()).group_by(PartnerInquiry.status)
            )
        ).all()
    )
    return OverviewCounts(
        products=products or 0,
        low_stock=low or 0,
        sold_out=sold_out or 0,
        low_stock_products=lowest,
        orders=orders or 0,
        recent_orders=recent,
        recent_revenue=int(revenue),
        inquiries=statuses,
    )
