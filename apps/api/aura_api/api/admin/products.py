"""Admin product routes: list, detail, edit and stock adjustment (#32 contract)."""

from typing import Any

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field

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
    model_config = ConfigDict(
        json_schema_extra={"required": ["version"], "example": {"version": 1, "price": 28000}}
    )
    # Values are checked by the admin domain rules; raw values go there unchanged.
    version: Any = Field(default=None, json_schema_extra={"type": "integer", "minimum": 1})
    name: Any = Field(default=None, json_schema_extra={"type": "string"})
    englishName: Any = Field(default=None, json_schema_extra={"type": "string"})  # noqa: N815
    description: Any = Field(default=None, json_schema_extra={"type": "string"})
    price: Any = Field(default=None, json_schema_extra={"type": ["integer", "null"], "minimum": 0})
    image: Any = Field(
        default=None,
        json_schema_extra={"type": "string", "description": "상세 응답 imageOptions 중 선택"},
    )
    featured: Any = Field(default=None, json_schema_extra={"type": "boolean"})
    isNew: Any = Field(default=None, json_schema_extra={"type": "boolean"})  # noqa: N815


class StockAdjustmentIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "required": ["version", "delta", "reason", "key"],
            "example": {
                "version": 1,
                "delta": 3,
                "reason": "정기 입고",
                "key": "11111111-1111-4111-8111-111111111111",
            },
        }
    )
    version: Any = Field(default=None, json_schema_extra={"type": "integer", "minimum": 1})
    delta: Any = Field(
        default=None,
        json_schema_extra={"type": "integer", "description": "0 제외, 변경 후 재고 0~99999"},
    )
    reason: Any = Field(default=None, json_schema_extra={"type": "string"})
    key: Any = Field(
        default=None,
        json_schema_extra={
            "type": "string",
            "pattern": "^[A-Za-z0-9-]{8,64}$",
            "description": "재전송 중복 적용 방지 키. 같은 키의 다른 조정은 409입니다.",
        },
    )


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
    responses={
        **ERRORS,
        200: {"model": AdminProductDetailOut, "description": "같은 조정 키의 재요청"},
    },
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
