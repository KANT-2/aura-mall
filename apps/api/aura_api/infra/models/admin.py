"""Admin operation tables: stock adjustments and audit log (db/schema.sql)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base

UUID_DEFAULT = text("gen_random_uuid()")


class StockAdjustment(Base):
    """Stock changes only through adjustments; request_key stops a resend applying twice."""

    __tablename__ = "stock_adjustments"
    __table_args__ = (
        CheckConstraint("delta <> 0", name="delta"),
        CheckConstraint(
            "stock_after = stock_before + delta AND stock_after BETWEEN 0 AND 99999", name="after"
        ),
        CheckConstraint("char_length(btrim(reason)) > 0", name="reason"),
        UniqueConstraint("request_key", name="stock_adjustments_request_key"),
        Index("stock_adjustments_product_created_idx", "product_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    delta: Mapped[int] = mapped_column(Integer)
    stock_before: Mapped[int] = mapped_column(Integer)
    stock_after: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(200))
    request_key: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("admins.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"
    __table_args__ = (
        CheckConstraint(
            "action IN ('product.update', 'product.stock', 'inquiry.update', 'admin.create')",
            name="action",
        ),
        CheckConstraint("target_type IN ('product', 'inquiry', 'admin')", name="target"),
        Index("admin_audit_logs_target_idx", "target_type", "target_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("admins.id"))
    action: Mapped[str] = mapped_column(String(40))
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[str] = mapped_column(String(64))
    changes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, server_default=text("'[]'"))
    reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
