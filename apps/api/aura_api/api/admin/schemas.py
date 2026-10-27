"""Admin DTOs (web: features/admin/model/admin.ts). Never reused by consumer routes."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from aura_api.api.catalog import CamelModel
from aura_api.domain.admin import INQUIRY_STATUSES
from aura_api.domain.ordering import ActorType, OrderStatus
from aura_api.infra.models import AdminAuditLog, PartnerInquiry, Product
from aura_api.services.admin_operations import InquiryView, OrderView, Overview, line_name
from aura_api.services.admin_products import ProductDetail

InquiryStatus = Literal["received", "reviewing", "done"]


class AdminPage[T](CamelModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class HistoryChangeOut(BaseModel):
    field: str
    from_value: Any = Field(alias="from")
    to: Any


class HistoryEntryOut(CamelModel):
    id: uuid.UUID
    action: Literal["product.update", "product.stock", "inquiry.update"]
    actor: str
    changes: list[HistoryChangeOut]
    reason: str | None = None  # left out when the action had no reason
    created: datetime


class AdminProductOut(CamelModel):
    id: str
    collection: str
    type: str
    type_name: str
    name: str
    english_name: str
    volume: str
    price: int | None
    stock: int
    image: str
    description: str
    featured: bool
    is_new: bool
    version: int
    updated: datetime | None


class AdminProductDetailOut(AdminProductOut):
    image_options: list[str]
    history: list[HistoryEntryOut]


def history_out(entries: list[tuple[AdminAuditLog, str]]) -> list[HistoryEntryOut]:
    out = []
    for entry, actor in entries:
        optional = {"reason": entry.reason} if entry.reason else {}
        out.append(
            HistoryEntryOut(
                id=entry.id,
                action=entry.action,
                actor=actor,
                changes=entry.changes,
                created=entry.created_at,
                **optional,
            )
        )
    return out


def admin_product_out(product: Product, type_name: str) -> AdminProductOut:
    return AdminProductOut(
        id=product.id,
        collection=product.collection_id,
        type=product.type_id,
        type_name=type_name,
        name=product.name,
        english_name=product.english_name,
        volume=product.volume,
        price=product.price,
        stock=product.stock,
        image=product.image,
        description=product.description,
        featured=product.featured,
        is_new=product.is_new,
        version=product.version,
        updated=product.updated_at,
    )


def product_detail_out(detail: ProductDetail) -> AdminProductDetailOut:
    return AdminProductDetailOut(
        **admin_product_out(detail.product, detail.type_name).model_dump(),
        image_options=detail.image_options,
        history=history_out(detail.history),
    )


class AdminCustomerOut(CamelModel):
    id: uuid.UUID
    name: str
    email: str


class AdminOrderSummaryOut(CamelModel):
    id: uuid.UUID
    created: datetime
    customer: AdminCustomerOut | None
    recipient: str
    title: str
    item_count: int
    total: int
    status: OrderStatus


class AdminOrderStatusChangeOut(CamelModel):
    from_status: OrderStatus | None
    status: OrderStatus
    actor_type: ActorType
    reason: str | None
    changed: datetime


class AdminOrderItemOut(CamelModel):
    product_id: str
    name: str
    type_name: str
    volume: str
    option: str | None
    quantity: int
    unit_price: int | None


class AdminOrderOut(AdminOrderSummaryOut):
    address: str
    items: list[AdminOrderItemOut]
    status_history: list[AdminOrderStatusChangeOut]


class AdminInquirySummaryOut(CamelModel):
    id: uuid.UUID
    brand: str
    name: str
    type: str
    status: InquiryStatus
    created: datetime
    updated: datetime | None


class AdminInquiryOut(AdminInquirySummaryOut):
    email: str
    website: str
    introduction: str
    message: str
    memo: str
    version: int
    history: list[HistoryEntryOut]


class LowStockOut(CamelModel):
    id: str
    name: str
    stock: int


class OverviewProductsOut(CamelModel):
    total: int
    low_stock: int
    sold_out: int


class OverviewOrdersOut(CamelModel):
    total: int
    recent: int
    recent_revenue: int


class InquiryCountsOut(CamelModel):
    received: int
    reviewing: int
    done: int


class AdminOverviewOut(CamelModel):
    products: OverviewProductsOut
    low_stock_products: list[LowStockOut]
    orders: OverviewOrdersOut
    recent_orders: list[AdminOrderSummaryOut]
    inquiries: InquiryCountsOut
    recent_inquiries: list[AdminInquirySummaryOut]


def order_summary_out(view: OrderView) -> AdminOrderSummaryOut:
    order, user = view.order, view.customer
    return AdminOrderSummaryOut(
        id=order.id,
        created=order.created_at,
        customer=AdminCustomerOut(id=user.id, name=user.name, email=user.email)
        if user and user.deactivated_at is None
        else None,
        recipient=order.recipient,
        title=view.title,
        item_count=view.item_count,
        total=order.total,
        status=order.status,
    )


def order_out(view: OrderView) -> AdminOrderOut:
    items = []
    for item, chosen in view.lines:
        snapshot = item.product_snapshot
        if item.custom:
            option = "맞춤 조향 · " + item.custom["label"]
        else:
            option = ", ".join(chosen) if chosen else None
        items.append(
            AdminOrderItemOut(
                product_id=snapshot["id"],
                name=line_name(item),
                type_name=snapshot["typeName"],
                volume=snapshot["volume"],
                option=option,
                quantity=item.quantity,
                unit_price=item.unit_price,
            )
        )
    history = [
        AdminOrderStatusChangeOut(
            from_status=change.from_status,
            status=change.to_status,
            actor_type=change.actor_type,
            reason=change.reason,
            changed=change.changed_at,
        )
        for change in view.history
    ]
    return AdminOrderOut(
        **order_summary_out(view).model_dump(),
        address=view.order.address,
        items=items,
        status_history=history,
    )


def inquiry_summary_out(inquiry: PartnerInquiry) -> AdminInquirySummaryOut:
    return AdminInquirySummaryOut(
        id=inquiry.id,
        brand=inquiry.brand,
        name=inquiry.name,
        type=inquiry.type,
        status=inquiry.status,
        created=inquiry.created_at,
        updated=inquiry.updated_at,
    )


def inquiry_out(view: InquiryView) -> AdminInquiryOut:
    inquiry = view.inquiry
    return AdminInquiryOut(
        **inquiry_summary_out(inquiry).model_dump(),
        email=inquiry.email,
        website=inquiry.website or "",
        introduction=inquiry.introduction,
        message=inquiry.message,
        memo=inquiry.internal_memo,
        version=inquiry.version,
        history=history_out(view.history),
    )


def overview_out(view: Overview) -> AdminOverviewOut:
    counts = view.counts
    return AdminOverviewOut(
        products=OverviewProductsOut(
            total=counts.products, low_stock=counts.low_stock, sold_out=counts.sold_out
        ),
        low_stock_products=[
            LowStockOut(id=item.id, name=item.name, stock=item.stock)
            for item in counts.low_stock_products
        ],
        orders=OverviewOrdersOut(
            total=counts.orders, recent=counts.recent_orders, recent_revenue=counts.recent_revenue
        ),
        recent_orders=[order_summary_out(item) for item in view.recent_orders],
        inquiries=InquiryCountsOut(
            **{status: counts.inquiries.get(status, 0) for status in INQUIRY_STATUSES}
        ),
        recent_inquiries=[inquiry_summary_out(item) for item in view.recent_inquiries],
    )
