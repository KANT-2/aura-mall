"""Identity tables: customers, admins, coupons, logout blacklist, refresh tokens (db/schema.sql)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
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
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))


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


class AuthTokenFamily(Base):
    """One per login; reusing a consumed refresh token revokes the whole family."""

    __tablename__ = "auth_token_families"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="auth_token_families_id_user_id_key"),
        Index("auth_token_families_user_id_idx", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshToken(Base):
    """SHA-256 hex of a refresh token plus the access token issued with it."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        ForeignKeyConstraint(
            ["family_id", "user_id"],
            ["auth_token_families.id", "auth_token_families.user_id"],
            ondelete="CASCADE",
            name="refresh_tokens_family_id_fkey",
        ),
        CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="token_hash"),
        CheckConstraint("expires_at > created_at", name="expires"),
        CheckConstraint("access_expires_at > created_at", name="access_expires"),
        Index("refresh_tokens_family_id_idx", "family_id"),
        Index("refresh_tokens_expires_at_idx", "expires_at"),
        Index("refresh_tokens_access_expires_at_idx", "access_expires_at"),
        Index(
            "refresh_tokens_family_active_key",
            "family_id",
            unique=True,
            postgresql_where=text("consumed_at IS NULL AND revoked_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=UUID_DEFAULT)
    user_id: Mapped[uuid.UUID]
    family_id: Mapped[uuid.UUID]
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    access_jti: Mapped[uuid.UUID] = mapped_column(unique=True)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
