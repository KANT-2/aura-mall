"""Payment routes for members: issue an attempt, confirm it after the PG window, read it."""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from aura_api.api.catalog import CamelModel
from aura_api.api.deps import Session, member_required
from aura_api.core.errors import ErrorResponse
from aura_api.domain.payments import PaymentStatus
from aura_api.infra.payment_gateway import PaymentGateway
from aura_api.services import payments as service
from aura_api.services.payments import PaymentView

router = APIRouter(prefix="/payments", tags=["payments"])
Member = Annotated[uuid.UUID, Depends(member_required("로그인 후 결제할 수 있어요."))]
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 404, 409, 503)}


def gateway(request: Request) -> PaymentGateway:
    configured = getattr(request.app.state, "payment_gateway", None)
    if configured is None:
        raise HTTPException(503)  # no PG configured: never pretend a payment happened
    return configured


Gateway = Annotated[PaymentGateway, Depends(gateway)]


class PaymentStartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: Any = Field(default=None, alias="orderId", json_schema_extra={"type": "string"})


class PaymentConfirmIn(BaseModel):
    """The values the PG window returns to the success URL. The amount is only compared."""

    model_config = ConfigDict(extra="forbid")
    payment_key: Any = Field(
        default=None, alias="paymentKey", json_schema_extra={"type": "string", "maxLength": 200}
    )
    order_id: Any = Field(
        default=None, alias="orderId", json_schema_extra={"type": "string", "maxLength": 64}
    )
    amount: Any = Field(default=None, json_schema_extra={"type": "integer", "minimum": 1})


class PaymentOut(CamelModel):
    id: uuid.UUID
    order_id: uuid.UUID
    pg_order_id: str
    order_name: str
    amount: int
    status: PaymentStatus
    method: str | None
    approved: datetime | None
    failure_code: str | None
    failure_message: str | None


def payment_out(view: PaymentView) -> PaymentOut:
    return PaymentOut(
        id=view.id,
        order_id=view.order_id,
        pg_order_id=view.pg_order_id,
        order_name=view.order_name,
        amount=view.amount,
        status=view.status,
        method=view.method,
        approved=view.approved_at,
        failure_code=view.failure_code,
        failure_message=view.failure_message,
    )


@router.post(
    "",
    status_code=201,
    response_model=PaymentOut,
    responses={**ERRORS, 200: {"model": PaymentOut, "description": "이미 발급된 결제 대기 건"}},
    summary="주문 결제 시작 (PG 결제창에 넘길 주문번호·금액 발급)",
)
async def start_payment(
    body: PaymentStartIn, member_id: Member, session: Session, pg: Gateway, response: Response
) -> PaymentOut:
    view, created = await service.start_payment(session, pg, member_id, body.order_id)
    if not created:
        response.status_code = 200
    return payment_out(view)


@router.post(
    "/confirm",
    response_model=PaymentOut,
    responses={**ERRORS, 202: {"model": PaymentOut, "description": "PG 결과 확인 중"}},
    summary="PG 결제 승인 요청과 결과 기록",
)
async def confirm_payment(
    body: PaymentConfirmIn, member_id: Member, session: Session, pg: Gateway, response: Response
) -> PaymentOut:
    view = await service.confirm_payment(
        session, pg, member_id, body.payment_key, body.order_id, body.amount
    )
    if view.status == "IN_PROGRESS":
        response.status_code = 202  # result unknown: send the same confirmation again later
    return payment_out(view)


@router.get("/{payment_id}", response_model=PaymentOut, responses=ERRORS, summary="결제 조회")
async def payment_detail(payment_id: str, member_id: Member, session: Session) -> PaymentOut:
    return payment_out(await service.payment_detail(session, member_id, payment_id))
