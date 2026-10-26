"""Identity tables: customers, admins, coupons, logout blacklist (db/schema.sql)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base

UUID_DEFAULT = text("gen_random_uuid()")


class User(Base):
    """Customer account. Admins are a separate table."""

    __tablename__ = "users"
    __table_args__ = (Index("users_email_lower_key", func.lower(text("email")), unique=True),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    email: Mapped[str] = mapped_column(String(254))
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    marketing: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Admin(Base):
    __tablename__ = "admins"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'disabled')", name="status"),
        Index("admins_email_lower_key", func.lower(text("email")), unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    email: Mapped[str] = mapped_column(String(254))
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), server_default=text("'active'"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("admins.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserCoupon(Base):
    __tablename__ = "user_coupons"
    __table_args__ = (
        CheckConstraint("type IN ('FREE_SHIPPING')", name="type"),
        CheckConstraint("status IN ('AVAILABLE', 'USED')", name="status"),
        UniqueConstraint("user_id", "type", name="user_coupons_user_type_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), server_default=text("'AVAILABLE'"))
    # orders.coupon_id also points here, so this side is added after both tables exist.
    used_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", use_alter=True, name="user_coupons_used_order_fkey")
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RevokedToken(Base):
    """jti of signed-out tokens (customers and admins). Rows past expires_at can be pruned."""

    __tablename__ = "revoked_tokens"
    __table_args__ = (Index("revoked_tokens_expires_at_idx", "expires_at"),)

    jti: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
