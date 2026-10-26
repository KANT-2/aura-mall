"""Atelier tables: saved recipes (never edited) and per-visitor drafts (db/schema.sql)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base


class Recipe(Base):
    __tablename__ = "recipes"
    __table_args__ = (
        CheckConstraint("version >= 1", name="version"),
        CheckConstraint("label IN ('classic', 'paper', 'minimal')", name="label"),
        Index("recipes_user_created_idx", "user_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("recipes.id", ondelete="SET NULL")
    )
    version: Mapped[int] = mapped_column(SmallInteger)
    name: Mapped[str] = mapped_column(String(30))
    label: Mapped[str] = mapped_column(String(10))
    color: Mapped[str] = mapped_column(CHAR(7))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecipeIngredient(Base):
    """Drops per ingredient. The 1–20 total spans rows and is checked by the domain layer."""

    __tablename__ = "recipe_ingredients"
    __table_args__ = (CheckConstraint("count BETWEEN 1 AND 20", name="count"),)

    recipe_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True
    )
    ingredient_id: Mapped[str] = mapped_column(ForeignKey("ingredients.id"), primary_key=True)
    count: Mapped[int] = mapped_column(SmallInteger)


class AtelierDraft(Base):
    __tablename__ = "atelier_drafts"
    __table_args__ = (
        CheckConstraint("label IN ('classic', 'paper', 'minimal')", name="label"),
        CheckConstraint("step IN ('select', 'result')", name="step"),
    )

    guest_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    counts: Mapped[dict[str, int]] = mapped_column(JSONB)
    name: Mapped[str] = mapped_column(String(30), server_default=text("''"))
    label: Mapped[str] = mapped_column(String(10))
    step: Mapped[str] = mapped_column(String(10))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
