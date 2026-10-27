"""PG payment attempts per order (db/schema.sql, migration 0007)."""

import uuid
from datetime import datetime

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
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base


class Payment(Base):
    """One attempt to pay an order. The amount is copied from orders.total when issued."""

    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("pg_order_id", name="payments_pg_order_id_key"),
        UniqueConstraint("payment_key", name="payments_payment_key_key"),
        CheckConstraint(
            "status IN ('READY', 'IN_PROGRESS', 'DONE', 'FAILED', 'CANCELED')", name="status"
        ),
        CheckConstraint("amount > 0", name="amount"),
        CheckConstraint("pg_order_id ~ '^[A-Za-z0-9_-]{6,64}$'", name="pg_order_id"),
        CheckConstraint(
            "status IN ('READY', 'CANCELED') "
            "OR (payment_key IS NOT NULL AND confirm_started_at IS NOT NULL)",
            name="claimed",
        ),
        CheckConstraint("(status = 'DONE') = (approved_at IS NOT NULL)", name="approved"),
        Index(
            "payments_order_open_key",
            "order_id",
            unique=True,
            postgresql_where=text("status IN ('READY', 'IN_PROGRESS', 'DONE')"),
        ),
        Index("payments_order_idx", "order_id", text("created_at DESC")),
        Index(
            "payments_in_progress_idx",
            "confirm_started_at",
            postgresql_where=text("status = 'IN_PROGRESS'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"))
    provider: Mapped[str] = mapped_column(String(20))
    pg_order_id: Mapped[str] = mapped_column(String(64))
    payment_key: Mapped[str | None] = mapped_column(String(200))
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), server_default=text("'READY'"))
    method: Mapped[str | None] = mapped_column(String(30))
    failure_code: Mapped[str | None] = mapped_column(String(100))
    failure_message: Mapped[str | None] = mapped_column(String(500))
    review_reason: Mapped[str | None] = mapped_column(String(100))
    confirm_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
