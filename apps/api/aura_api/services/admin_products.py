"""Admin product use cases: list, detail, edit (optimistic lock) and stock adjustment."""

import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain import admin as rules
from aura_api.domain.errors import Conflict, NotFound
from aura_api.infra.models import AdminAuditLog, Product
from aura_api.infra.repositories import admin as repository

# Column → field name the admin screens use in the change history.
CLIENT_FIELDS = {"english_name": "englishName", "is_new": "isNew", "is_active": "isActive"}


@dataclass(frozen=True)
class ProductDetail:
    product: Product
    type_name: str
    image_options: list[str]
    history: list[tuple[AdminAuditLog, str]]


def _not_found() -> NotFound:
    return NotFound("PRODUCT_NOT_FOUND", "상품을 찾을 수 없어요.")


async def _detail(session: AsyncSession, product: Product, type_name: str) -> ProductDetail:
    return ProductDetail(
        product,
        type_name,
        await repository.image_options(session),
        await repository.history(session, "product", product.id),
    )


async def list_products(
    session: AsyncSession, *, q: object, collection: object, stock: object, page: object
) -> tuple[list[tuple[Product, str]], int, int]:
    def text(value: object) -> str:
        return value.strip()[:100] if isinstance(value, str) else ""

    number = rules.page_number(page)
    rows, total = await repository.list_products(
        session, q=text(q), collection=text(collection), stock=text(stock), page=number
    )
    return rows, total, number


async def product_detail(session: AsyncSession, product_id: str) -> ProductDetail:
    found = await repository.product(session, product_id)
    if found is None:
        raise _not_found()
    return await _detail(session, *found)


def _touch(product: Product) -> None:
    product.version += 1
    product.updated_at = datetime.now(UTC)


async def update_product(
    session: AsyncSession, admin_id: uuid.UUID, product_id: str, raw: Mapping[str, Any]
) -> ProductDetail:
    async with session.begin():
        found = await repository.product(session, product_id, lock=True)
        if found is None:
            raise _not_found()
        product, type_name = found
        rules.check_version(raw.get("version"), product.version)
        changes = rules.product_changes(raw, await repository.image_options(session))
        diff = [
            {"field": CLIENT_FIELDS.get(field, field), "from": getattr(product, field), "to": value}
            for field, value in changes.items()
            if getattr(product, field) != value
        ]
        if diff:
            for field, value in changes.items():
                setattr(product, field, value)
            if "image" in changes:
                product.image_url = changes["image"]
            _touch(product)
            repository.add_audit(
                session,
                actor_id=admin_id,
                action="product.update",
                target_type="product",
                target_id=product.id,
                changes=diff,
            )
            await session.flush()
        return await _detail(session, product, type_name)


async def adjust_stock(
    session: AsyncSession, admin_id: uuid.UUID, product_id: str, raw: Mapping[str, Any]
) -> tuple[ProductDetail, bool]:
    """Returns the detail and whether the adjustment was applied now (False for a resend)."""
    try:
        async with session.begin():
            found = await repository.product(session, product_id, lock=True)
            if found is None:
                raise _not_found()
            product, type_name = found
            request = rules.stock_request(raw)
            previous = await repository.stock_request(session, request.key)
            if previous is not None:
                rules.ensure_same_request(
                    previous.product_id,
                    rules.StockAdjustment(previous.delta, previous.reason, previous.request_key),
                    product.id,
                    request,
                )
                return await _detail(session, product, type_name), False
            rules.check_version(raw.get("version"), product.version)
            before = product.stock
            product.stock = rules.adjusted_stock(before, request.delta)
            _touch(product)
            repository.add_stock_adjustment(
                session,
                product_id=product.id,
                before=before,
                after=product.stock,
                reason=request.reason,
                key=request.key,
                actor_id=admin_id,
            )
            repository.add_audit(
                session,
                actor_id=admin_id,
                action="product.stock",
                target_type="product",
                target_id=product.id,
                changes=[{"field": "stock", "from": before, "to": product.stock}],
                reason=request.reason,
            )
            await session.flush()
            return await _detail(session, product, type_name), True
    except IntegrityError as error:
        # The same key used at the same moment for another product.
        raise Conflict(
            "REQUEST_KEY_USED", "이미 사용한 요청 식별자예요. 새로 시도해 주세요."
        ) from error
