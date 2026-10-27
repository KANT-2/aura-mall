"""Order routes (BFF contract): GET /orders and POST /orders. Members only."""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from aura_api.api.catalog import CamelModel, ProductOut
from aura_api.api.deps import Session, member_required
from aura_api.core.errors import ErrorResponse
from aura_api.infra.repositories.orders import SavedOrder
from aura_api.services import orders as service

router = APIRouter(prefix="/orders", tags=["orders"])
Member = Annotated[uuid.UUID, Depends(member_required("로그인이 필요해요."))]
OrderMember = Annotated[uuid.UUID, Depends(member_required("로그인 후 주문할 수 있어요."))]


class OrderIn(BaseModel):
    # Items, recipient and address are domain rules (OR-01~15); raw values go to the domain.
    recipient: Any = None
    address: Any = None
    coupon: bool | None = None
    items: Any = None


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
    responses={code: {"model": ErrorResponse} for code in (400, 401, 409)},
)
async def place_order(body: OrderIn, member_id: OrderMember, session: Session) -> OrderOut:
    return order_out(await service.place_order(session, member_id, body.model_dump()))
