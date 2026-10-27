"""Order routes (BFF contract): GET /orders and POST /orders. Members only."""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Response
from pydantic import BaseModel, ConfigDict, Field

from aura_api.api.catalog import CamelModel, ProductOut
from aura_api.api.deps import Session, member_required
from aura_api.core.errors import ErrorResponse
from aura_api.infra.repositories.orders import SavedOrder
from aura_api.services import orders as service

router = APIRouter(prefix="/orders", tags=["orders"])
Member = Annotated[uuid.UUID, Depends(member_required("로그인이 필요해요."))]
OrderMember = Annotated[uuid.UUID, Depends(member_required("로그인 후 주문할 수 있어요."))]


class OrderIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "required": ["recipient", "address", "items"],
            "example": {
                "recipient": "받는 분",
                "address": "서울시 성동구 1",
                "items": [{"productId": "soft-hand-cream", "quantity": 1}],
            },
        }
    )
    # Items, recipient and address are domain rules (OR-01~15); raw values go to the domain.
    recipient: Any = Field(default=None, json_schema_extra={"type": "string", "maxLength": 100})
    address: Any = Field(default=None, json_schema_extra={"type": "string", "maxLength": 500})
    coupon: bool | None = None
    items: Any = Field(
        default=None,
        json_schema_extra={
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["quantity"],
                "properties": {
                    "productId": {"type": "string"},
                    "quantity": {"type": "integer", "minimum": 1, "maximum": 15},
                    "selection": {"type": "array", "items": {"type": "string"}},
                    "custom": {
                        "type": "object",
                        "required": ["name", "counts"],
                        "properties": {
                            "name": {"type": "string"},
                            "label": {"type": "string"},
                            "counts": {
                                "type": "object",
                                "additionalProperties": {"type": "integer", "minimum": 0},
                            },
                            "productType": {"type": "string", "enum": ["eau-de-parfum"]},
                        },
                    },
                },
                "oneOf": [
                    {"required": ["productId"], "not": {"required": ["custom"]}},
                    {"required": ["custom"], "not": {"required": ["productId"]}},
                ],
            },
        },
    )


class CustomOut(CamelModel):
    name: str
    label: str
    color: str
    counts: dict[str, int]
    product_type: str


class OrderItemOut(CamelModel):
    unit_price: int
    key: str
    product: ProductOut
    quantity: int
    selection: list[str]
    custom: CustomOut | None = None  # left out for catalog products


class OrderOut(CamelModel):
    id: uuid.UUID
    items: list[OrderItemOut]
    total: int
    recipient: str
    address: str
    created: datetime


def order_out(order: SavedOrder) -> OrderOut:
    items = []
    for item in order.items:
        optional = {"custom": CustomOut.model_validate(item.custom)} if item.custom else {}
        items.append(
            OrderItemOut(
                unit_price=item.unit_price,
                key=item.key,
                product=ProductOut.model_validate(item.product),
                quantity=item.quantity,
                selection=item.selection,
                **optional,
            )
        )
    return OrderOut(
        id=order.id,
        items=items,
        total=order.total,
        recipient=order.recipient,
        address=order.address,
        created=order.created_at,
    )


@router.get("", response_model=list[OrderOut], response_model_exclude_unset=True)
async def list_orders(member_id: Member, session: Session) -> list[OrderOut]:
    return [order_out(order) for order in await service.list_orders(session, member_id)]


@router.post(
    "",
    status_code=201,
    response_model=OrderOut,
    response_model_exclude_unset=True,
    responses={
        **{code: {"model": ErrorResponse} for code in (400, 401, 409)},
        200: {"model": OrderOut, "description": "같은 회원·같은 Idempotency-Key의 기존 주문"},
    },
)
async def place_order(
    body: OrderIn,
    member_id: OrderMember,
    session: Session,
    response: Response,
    idempotency_key: Annotated[
        str | None,
        Header(
            alias="Idempotency-Key",
            description=(
                "선택적 8~64자 영숫자·하이픈. "
                "같은 회원·같은 키는 본문이 달라도 최초 주문을 반환합니다."
            ),
            json_schema_extra={"pattern": "^[A-Za-z0-9-]{8,64}$"},
        ),
    ] = None,
) -> OrderOut:
    order, created = await service.place_order(
        session, member_id, body.model_dump(), idempotency_key
    )
    if not created:
        response.status_code = 200  # same key sent again: the original order, nothing new
    return order_out(order)
