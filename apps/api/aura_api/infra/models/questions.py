"""Customer product questions; private text is visible only to its owner and admins."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base


class ProductQuestion(Base):
    __tablename__ = "product_questions"
    __table_args__ = (
        CheckConstraint("version >= 1", name="version"),
        CheckConstraint("char_length(btrim(title)) BETWEEN 1 AND 120", name="title"),
        CheckConstraint("char_length(btrim(content)) BETWEEN 1 AND 3000", name="content"),
        CheckConstraint(
            "answer IS NULL OR char_length(btrim(answer)) BETWEEN 1 AND 3000", name="answer"
        ),
        Index("product_questions_product_created_idx", "product_id", text("created_at DESC")),
        Index("product_questions_user_created_idx", "user_id", text("created_at DESC")),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(120))
    content: Mapped[str] = mapped_column(Text)
    private: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    answer: Mapped[str | None] = mapped_column(Text)
    answered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("admins.id"))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
