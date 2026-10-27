"""Order use cases: place, list and cancel orders; stock and coupon change with the order."""

import uuid
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.catalog import CUSTOM_PRODUCT_TYPE
from aura_api.domain.errors import Conflict, NotFound, Unauthorized
from aura_api.domain.ordering import OrderLine, idempotency_key, price_order, restock_needs
from aura_api.infra.models import Order, Product
from aura_api.infra.repositories import catalog as catalog_repository
from aura_api.infra.repositories import orders as repository
from aura_api.infra.repositories import payments as payment_repository
from aura_api.infra.repositories import users
from aura_api.infra.repositories.orders import SavedOrder


def product_snapshot(product: Product, type_name: str) -> dict[str, Any]:
    """The product as `GET /catalog` shows it, frozen into the order."""
    snapshot: dict[str, Any] = {
        "id": product.id,
        "collection": product.collection_id,
        "type": product.type_id,
        "typeName": type_name,
        "name": product.name,
        "englishName": product.english_name,
        "volume": product.volume,
        "price": product.price,
        "stock": product.stock,
        "image": product.image,
        "description": product.description,
        "notes": list(product.notes),
        "featured": product.featured,
        "imageUrl": product.image_url,
        "category": product.category,
        "isNew": product.is_new,
    }
    if product.note_images is not None:
        snapshot["noteImages"] = product.note_images
    if product.gift_images is not None:
        snapshot["giftImages"] = list(product.gift_images)
    return snapshot


def custom_snapshot(name: str, base: Product, type_name: str) -> dict[str, Any]:
    """Placeholder product for a custom composition, the same shape the web cart builds."""
    return {
        "id": "custom-atelier",
        "collection": "atelier",
        "type": base.type_id,
        "typeName": type_name,
        "name": name or "나만의 조향 향수",
        "englishName": "AURA Personal Composition",
        "volume": base.volume,
        "price": base.price,
        "stock": 15,
        "image": "/assets/editorial/custom-bottle.svg",
        "description": "내가 고른 향료로 완성한 커스텀 조합",
        "notes": [],
        "featured": False,
        "imageUrl": "/assets/editorial/custom-bottle.svg",
        "category": "커스텀 향",
        "isNew": False,
    }


def _snapshot(line: OrderLine, products: Mapping[str, tuple[Product, str]]) -> dict[str, Any]:
    if line.product is not None:
        return product_snapshot(*products[line.product.id])
    # Catalog order decides the base, as for the custom price (first eau de parfum).
    base = next(
        pair
        for pair in sorted(products.values(), key=lambda pair: pair[0].sort_order)
        if pair[0].type_id == CUSTOM_PRODUCT_TYPE
    )
    return custom_snapshot(line.custom.name, *base)


async def list_orders(session: AsyncSession, member_id: uuid.UUID) -> list[SavedOrder]:
    return await repository.list_orders(session, member_id)


async def place_order(
    session: AsyncSession,
    member_id: uuid.UUID,
    raw: Mapping[str, object],
    key: object = None,
) -> tuple[SavedOrder, bool]:
    """Returns the order and whether it was created now (False: same key sent again)."""
    request_key = idempotency_key(key)
    try:
        return await _place(session, member_id, raw, request_key)
    except IntegrityError:
        # The same key committed by a concurrent request: answer with that order.
        if request_key is None:
            raise
        await session.rollback()
        earlier = await repository.order_by_key(session, member_id, request_key)
        if earlier is None:
            raise
        return earlier, False


async def _place(
    session: AsyncSession, member_id: uuid.UUID, raw: Mapping[str, object], key: str | None
) -> tuple[SavedOrder, bool]:
    async with session.begin():
        if not await users.lock_active_member(session, member_id):
            raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
        if key is not None:
            earlier = await repository.order_by_key(session, member_id, key)
            if earlier is not None:
                return earlier, False
        catalog = await catalog_repository.load_rule_catalog(session)
        coupon = await repository.lock_available_coupon(session, member_id)
        priced = price_order(
            raw.get("items"),
            catalog,
            recipient=raw.get("recipient"),
            address=raw.get("address"),
            use_coupon=bool(raw.get("coupon")),
            coupon_available=coupon is not None,
        )
        products = await repository.products_with_type_names(session)
        snapshots = [_snapshot(line, products) for line in priced.lines]
        # Fixed order (product ID) so concurrent orders never wait on each other in a cycle.
        for product_id in sorted(priced.stock_needs):
            if not await repository.take_stock(session, product_id, priced.stock_needs[product_id]):
                raise Conflict("OUT_OF_STOCK", "상품 재고를 확인해 주세요.")
        selection_names = {
            product_id: products[product_id][0].name
            for line in priced.lines
            for product_id in line.selection
        }
        coupon_id = coupon.id if priced.use_coupon and coupon else None
        order = await repository.add_order(
            session, member_id, priced, snapshots, selection_names, coupon_id, key
        )
        if coupon_id and not await repository.use_coupon(session, coupon_id, order.id):
            raise Conflict("COUPON_UNAVAILABLE", "사용할 수 없는 쿠폰이에요.")
        return order, True


async def _cancel(
    session: AsyncSession,
    order: Order,
    *,
    actor_type: str,
    actor_id: uuid.UUID | None,
    reason: str,
) -> None:
    """Cancel a `received` order the caller has locked, inside the caller's transaction.

    The order status, its unused payment attempt, the coupon and the stock all change together.
    """
    payment = await payment_repository.open_payment(session, order.id)
    if payment is not None and payment.status == "IN_PROGRESS":
        # The PG may be approving right now: never cancel on an unknown payment result.
        raise Conflict("PAYMENT_IN_PROGRESS", "결제를 확인하고 있어요. 잠시 후 다시 시도해 주세요.")
    if payment is not None and payment.status == "DONE":
        raise Conflict("ORDER_ALREADY_PAID", "결제된 주문은 환불과 함께 취소해야 해요.")
    if payment is not None:  # READY: issued but never sent for approval
        payment.status = "CANCELED"
        payment.failure_code = "ORDER_CANCELLED"
        payment.updated_at = datetime.now(UTC)
    await repository.change_status(
        session, order.id, "cancelled", actor_type=actor_type, actor_id=actor_id, reason=reason
    )
    await release_holdings(session, order)


async def release_holdings(session: AsyncSession, order: Order) -> None:
    """Give back what the order took when it was placed: its coupon and its stock.

    Same lock order as placing an order: the coupon first, then products by ID. The caller has
    locked the order and runs this inside the transaction that cancels it.
    """
    if order.coupon_id is not None:
        await repository.give_back_coupon(session, order.coupon_id, order.id)
    needs = restock_needs(await repository.stored_lines(session, order.id))
    for product_id in sorted(needs):
        await repository.give_back_stock(session, product_id, needs[product_id])


def _order_uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(value) if isinstance(value, str) else None
    except ValueError:
        return None


async def cancel_order(session: AsyncSession, member_id: uuid.UUID, order_id: object) -> SavedOrder:
    """The member cancels their own unpaid order. Cancelling it again changes nothing."""
    target = _order_uuid(order_id)
    async with session.begin():
        if not await users.lock_active_member(session, member_id):
            raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
        order = await payment_repository.lock_order(session, target, member_id) if target else None
        if order is None:
            raise NotFound("ORDER_NOT_FOUND", "주문을 찾을 수 없어요.")
        if order.status == "received":
            await _cancel(
                session, order, actor_type="member", actor_id=member_id, reason="member request"
            )
        elif order.status != "cancelled":
            # Paid orders go through refunds.py first; later states cannot be cancelled.
            raise Conflict("ORDER_NOT_CANCELLABLE", "취소할 수 없는 주문 상태예요.")
        return await repository.member_order(session, member_id, order.id)


async def expire_unpaid_orders(
    session: AsyncSession, *, older_than: timedelta, limit: int = 100, execute: bool = False
) -> dict[str, int]:
    """Cancel `received` orders older than `older_than`, one transaction per order.

    `due` is the number of candidates in this batch (at most `limit`). Orders with a payment in
    progress or approved are skipped, never cancelled. A dry run changes nothing and reports
    the same counts the run would produce now: `cancelled` and `skipped` are predictions.
    """
    cutoff = datetime.now(UTC) - older_than
    async with session.begin():
        ids = await repository.unpaid_before(session, cutoff, limit)
        if not execute:
            blocked = await payment_repository.orders_with_payment(
                session, ids, ("IN_PROGRESS", "DONE")
            )
            return {"due": len(ids), "cancelled": len(ids) - len(blocked), "skipped": len(blocked)}
    counts = {"due": len(ids), "cancelled": 0, "skipped": 0}
    for order_id in ids:
        try:
            async with session.begin():
                order = await payment_repository.lock_order(session, order_id)
                # Recheck under the lock: paid or cancelled meanwhile means nothing to do.
                if order is None or order.status != "received" or order.created_at > cutoff:
                    counts["skipped"] += 1
                    continue
                await _cancel(
                    session,
                    order,
                    actor_type="system",
                    actor_id=None,
                    reason="unpaid order expired",
                )
                counts["cancelled"] += 1
        except Conflict:
            counts["skipped"] += 1
    return counts
