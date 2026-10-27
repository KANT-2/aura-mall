"""Admin product routes: list, detail, edit and stock adjustment (#32 contract)."""

from typing import Any

from fastapi import APIRouter, Response
from pydantic import BaseModel

from aura_api.api.admin.deps import CurrentAdmin
from aura_api.api.admin.schemas import (
    AdminPage,
    AdminProductDetailOut,
    AdminProductOut,
    admin_product_out,
    product_detail_out,
)
from aura_api.api.deps import Session
from aura_api.core.errors import ErrorResponse
from aura_api.domain.admin import PAGE_SIZE
from aura_api.services import admin_products as service

router = APIRouter(prefix="/products")
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409)}


class ProductUpdateIn(BaseModel):
    # Values are checked by the admin domain rules; raw values go there unchanged.
    version: Any = None
    name: Any = None
    englishName: Any = None  # noqa: N815 - JSON field name from the contract
    description: Any = None
    price: Any = None
    image: Any = None
    featured: Any = None
    isNew: Any = None  # noqa: N815


class StockAdjustmentIn(BaseModel):
    version: Any = None
    delta: Any = None
    reason: Any = None
    key: Any = None


@router.get("", response_model=AdminPage[AdminProductOut], responses=ERRORS)
async def list_products(
    admin: CurrentAdmin,
    session: Session,
    q: str | None = None,
    collection: str | None = None,
    stock: str | None = None,
    page: str | None = None,
) -> AdminPage[AdminProductOut]:
    rows, total, number = await service.list_products(
        session, q=q, collection=collection, stock=stock, page=page
    )
    return AdminPage[AdminProductOut](
        items=[admin_product_out(*row) for row in rows],
        total=total,
        page=number,
        page_size=PAGE_SIZE,
    )


@router.get(
    "/{product_id}",
    response_model=AdminProductDetailOut,
    response_model_exclude_unset=True,
    responses=ERRORS,
)
async def product_detail(
    product_id: str, admin: CurrentAdmin, session: Session
) -> AdminProductDetailOut:
    return product_detail_out(await service.product_detail(session, product_id))


@router.patch(
    "/{product_id}",
    response_model=AdminProductDetailOut,
    response_model_exclude_unset=True,
    responses=ERRORS,
)
async def update_product(
    product_id: str, body: ProductUpdateIn, admin: CurrentAdmin, session: Session
) -> AdminProductDetailOut:
    # Only fields present in the request are edits; `price: null` means "price unknown".
    raw = body.model_dump(exclude_unset=True)
    return product_detail_out(await service.update_product(session, admin.id, product_id, raw))


@router.post(
    "/{product_id}/stock-adjustments",
    status_code=201,
    response_model=AdminProductDetailOut,
    response_model_exclude_unset=True,
    responses=ERRORS,
)
async def adjust_stock(
    product_id: str,
    body: StockAdjustmentIn,
    admin: CurrentAdmin,
    session: Session,
    response: Response,
) -> AdminProductDetailOut:
    detail, applied = await service.adjust_stock(session, admin.id, product_id, body.model_dump())
    if not applied:
        response.status_code = 200  # same key resent: nothing applied again
    return product_detail_out(detail)
