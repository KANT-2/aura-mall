"""Canonical product image bytes shared by all API replicas and database backups."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, LargeBinary, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base


class MediaAsset(Base):
    __tablename__ = "media_assets"
    __table_args__ = (CheckConstraint("octet_length(data) BETWEEN 1 AND 2097152", name="size"),)
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("admins.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
