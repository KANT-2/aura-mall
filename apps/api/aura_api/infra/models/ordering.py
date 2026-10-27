"""Ordering tables: order intake with snapshot items, no product FK (db/schema.sql)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base

UUID_DEFAULT = text("gen_random_uuid()")
# Same list as aura_api.domain.ordering.ORDER_STATUSES (0006 CHECK constraints).
STATUSES = "'received', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "items_amount >= 0 AND shipping_fee >= 0 AND total = items_amount + shipping_fee",
            name="amounts",
        ),
        CheckConstraint(f"status IN ({STATUSES})", name="status"),
        UniqueConstraint("user_id", "idempotency_key", name="orders_user_idempotency_key"),
        Index("orders_user_created_idx", "user_id", text("created_at DESC")),
        Index("orders_created_idx", text("created_at DESC")),
        Index(
            "orders_unpaid_created_idx", "created_at", postgresql_where=text("status = 'received'")
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    recipient: Mapped[str] = mapped_column(String(100))
    address: Mapped[str] = mapped_column(String(500))
    items_amount: Mapped[int] = mapped_column(Integer)
    shipping_fee: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    coupon_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_coupons.id"))
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 0006: every order is accepted as 'received'; changes go through order_status_history.
    status: Mapped[str] = mapped_column(String(20), server_default=text("'received'"))


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("kind IN ('product', 'gift_set', 'custom')", name="kind"),
        CheckConstraint("unit_price >= 0", name="unit_price"),
        CheckConstraint("quantity BETWEEN 1 AND 15", name="quantity"),
        UniqueConstraint("order_id", "position", name="order_items_order_position_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(SmallInteger)
    line_key: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(10))
    product_id: Mapped[str] = mapped_column(String(50))  # reference only, no FK
    product_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    unit_price: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(SmallInteger)
    custom: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class OrderItemSelection(Base):
    """Gift Set contents as chosen at order time."""

    __tablename__ = "order_item_selections"

    order_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_items.id", ondelete="CASCADE"), primary_key=True
    )
    product_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    product_name: Mapped[str] = mapped_column(String(100))
    unit_price: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(SmallInteger)


class OrderStatusHistory(Base):
    """One order status change; the first entry has no from_status (0006)."""

    __tablename__ = "order_status_history"
    __table_args__ = (
        CheckConstraint(f"from_status IS NULL OR from_status IN ({STATUSES})", name="from_status"),
        CheckConstraint(f"to_status IN ({STATUSES})", name="to_status"),
        CheckConstraint("actor_type IN ('member', 'admin', 'system')", name="actor_type"),
        CheckConstraint("(actor_type = 'system') = (actor_id IS NULL)", name="actor"),
        Index("order_status_history_order_idx", "order_id", "changed_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    actor_type: Mapped[str] = mapped_column(String(10))
    actor_id: Mapped[uuid.UUID | None]  # member or admin id; NULL for system changes
    reason: Mapped[str | None] = mapped_column(String(200))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
