"""Partner inquiry table, including admin handling fields (db/schema.sql)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base


class PartnerInquiry(Base):
    __tablename__ = "partner_inquiries"
    __table_args__ = (
        CheckConstraint("consent", name="consent"),
        CheckConstraint(
            "char_length(introduction) <= 3000 AND char_length(message) <= 3000",
            name="text_length",
        ),
        CheckConstraint("status IN ('received', 'reviewing', 'done')", name="status"),
        CheckConstraint("version >= 1", name="version"),
        Index("partner_inquiries_status_created_idx", "status", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    brand: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(254))
    website: Mapped[str | None] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(30))
    introduction: Mapped[str] = mapped_column(Text)
    message: Mapped[str] = mapped_column(Text)
    consent: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(20), server_default=text("'received'"))
    internal_memo: Mapped[str] = mapped_column(Text, server_default=text("''"))
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
