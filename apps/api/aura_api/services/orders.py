"""Order use cases: place an order (price, stock, coupon in one transaction) and list orders."""

import uuid
from collections.abc import Mapping
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.catalog import CUSTOM_PRODUCT_TYPE
from aura_api.domain.errors import Conflict
from aura_api.domain.ordering import OrderLine, price_order
from aura_api.infra.models import Product
from aura_api.infra.repositories import catalog as catalog_repository
from aura_api.infra.repositories import orders as repository
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
    session: AsyncSession, member_id: uuid.UUID, raw: Mapping[str, object]
) -> SavedOrder:
    async with session.begin():
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
            session, member_id, priced, snapshots, selection_names, coupon_id
        )
        if coupon_id and not await repository.use_coupon(session, coupon_id, order.id):
            raise Conflict("COUPON_UNAVAILABLE", "사용할 수 없는 쿠폰이에요.")
        return order
