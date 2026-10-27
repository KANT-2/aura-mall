"""Admin routes for orders, partner inquiries and the overview (#32 contract)."""

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from aura_api.api.admin.deps import CurrentAdmin
from aura_api.api.admin.schemas import (
    AdminInquiryOut,
    AdminInquirySummaryOut,
    AdminOrderOut,
    AdminOrderSummaryOut,
    AdminOverviewOut,
    AdminPage,
    inquiry_out,
    inquiry_summary_out,
    order_out,
    order_summary_out,
    overview_out,
)
from aura_api.api.deps import Session
from aura_api.core.errors import ErrorResponse
from aura_api.domain.admin import PAGE_SIZE
from aura_api.services import admin_operations as service

router = APIRouter()
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409)}


class InquiryUpdateIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "required": ["version"],
            "example": {"version": 1, "status": "reviewing", "memo": "담당자 확인 중"},
        }
    )
    version: Any = Field(default=None, json_schema_extra={"type": "integer", "minimum": 1})
    status: Any = Field(
        default=None,
        json_schema_extra={"type": "string", "enum": ["received", "reviewing", "done"]},
    )
    memo: Any = Field(default=None, json_schema_extra={"type": "string"})


@router.get("/overview", response_model=AdminOverviewOut, responses=ERRORS)
async def overview(admin: CurrentAdmin, session: Session) -> AdminOverviewOut:
    return overview_out(await service.overview(session))


@router.get("/orders", response_model=AdminPage[AdminOrderSummaryOut], responses=ERRORS)
async def list_orders(
    admin: CurrentAdmin,
    session: Session,
    start: str | None = Query(None, alias="from"),
    end: str | None = Query(None, alias="to"),
    page: str | None = None,
) -> AdminPage[AdminOrderSummaryOut]:
    views, total, number = await service.list_orders(session, start=start, end=end, page=page)
    return AdminPage[AdminOrderSummaryOut](
        items=[order_summary_out(view) for view in views],
        total=total,
        page=number,
        page_size=PAGE_SIZE,
    )


@router.get("/orders/{order_id}", response_model=AdminOrderOut, responses=ERRORS)
async def order_detail(order_id: str, admin: CurrentAdmin, session: Session) -> AdminOrderOut:
    return order_out(await service.order_detail(session, order_id))


@router.get("/inquiries", response_model=AdminPage[AdminInquirySummaryOut], responses=ERRORS)
async def list_inquiries(
    admin: CurrentAdmin,
    session: Session,
    status: str | None = None,
    page: str | None = None,
) -> AdminPage[AdminInquirySummaryOut]:
    rows, total, number = await service.list_inquiries(session, status=status, page=page)
    return AdminPage[AdminInquirySummaryOut](
        items=[inquiry_summary_out(row) for row in rows],
        total=total,
        page=number,
        page_size=PAGE_SIZE,
    )


@router.get(
    "/inquiries/{inquiry_id}",
    response_model=AdminInquiryOut,
    response_model_exclude_unset=True,
    responses=ERRORS,
)
async def inquiry_detail(inquiry_id: str, admin: CurrentAdmin, session: Session) -> AdminInquiryOut:
    return inquiry_out(await service.inquiry_detail(session, inquiry_id))


@router.patch(
    "/inquiries/{inquiry_id}",
    response_model=AdminInquiryOut,
    response_model_exclude_unset=True,
    responses=ERRORS,
)
async def update_inquiry(
    inquiry_id: str, body: InquiryUpdateIn, admin: CurrentAdmin, session: Session
) -> AdminInquiryOut:
    raw = body.model_dump(exclude_unset=True)
    return inquiry_out(await service.update_inquiry(session, admin.id, inquiry_id, raw))
