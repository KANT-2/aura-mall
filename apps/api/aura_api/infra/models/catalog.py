"""Catalog tables keyed by the original string IDs of the web catalog (db/schema.sql)."""

from datetime import datetime

from sqlalchemy import (
    CHAR,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from aura_api.infra.database import Base

EMPTY_ARRAY = text("'{}'::text[]")


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    color: Mapped[str] = mapped_column(CHAR(7))
    notes: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=EMPTY_ARRAY)
    sort_order: Mapped[int] = mapped_column(SmallInteger)


class ProductType(Base):
    __tablename__ = "product_types"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(50))  # Product.typeName
    label: Mapped[str] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(SmallInteger)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price IS NULL OR price BETWEEN 0 AND 10000000", name="price"),
        CheckConstraint("stock BETWEEN 0 AND 99999", name="stock"),
        CheckConstraint("version >= 1", name="version"),
        UniqueConstraint("bestseller_rank", name="products_bestseller_rank_key"),
        Index("products_collection_idx", "collection_id"),
        Index("products_type_idx", "type_id"),
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    collection_id: Mapped[str] = mapped_column(ForeignKey("collections.id"))
    type_id: Mapped[str] = mapped_column(ForeignKey("product_types.id"))
    name: Mapped[str] = mapped_column(String(100))
    english_name: Mapped[str] = mapped_column(String(100))
    volume: Mapped[str] = mapped_column(String(30))
    price: Mapped[int | None] = mapped_column(Integer)  # None = 가격 확인 중
    stock: Mapped[int] = mapped_column(Integer)
    image: Mapped[str] = mapped_column(String(255))
    image_url: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50))
    notes: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=EMPTY_ARRAY)
    note_images: Mapped[dict[str, str] | None] = mapped_column(JSONB)
    gift_images: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    featured: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    is_new: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    bestseller_rank: Mapped[int | None] = mapped_column(SmallInteger)
    sort_order: Mapped[int] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    details: Mapped[dict[str, str]] = mapped_column(JSONB, server_default=text("'{}'"))
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Ingredient(Base):
    __tablename__ = "ingredients"
    __table_args__ = (CheckConstraint("stage IN ('top', 'middle', 'base')", name="stage"),)

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(30))
    stage: Mapped[str] = mapped_column(String(10))
    color: Mapped[str] = mapped_column(CHAR(7))
    description: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(SmallInteger)


class ScentFamily(Base):
    __tablename__ = "scent_families"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(30))
    english: Mapped[str] = mapped_column(String(30))
    asset: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(SmallInteger)


class ScentFamilyIngredient(Base):
    __tablename__ = "scent_family_ingredients"

    family_id: Mapped[str] = mapped_column(
        ForeignKey("scent_families.id", ondelete="CASCADE"), primary_key=True
    )
    ingredient_id: Mapped[str] = mapped_column(ForeignKey("ingredients.id"), primary_key=True)
    position: Mapped[int] = mapped_column(SmallInteger)


class SuggestedName(Base):
    __tablename__ = "suggested_names"
    __table_args__ = (
        UniqueConstraint("collection_id", "name", name="suggested_names_collection_name_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    collection_id: Mapped[str] = mapped_column(ForeignKey("collections.id"))
    name: Mapped[str] = mapped_column(String(30))
    sort_order: Mapped[int] = mapped_column(SmallInteger)


class Promotion(Base):
    __tablename__ = "promotions"
    __table_args__ = (
        CheckConstraint("audience IN ('guest', 'member')", name="audience"),
        UniqueConstraint("audience", "sort_order", name="promotions_audience_order_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audience: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(100))
    copy: Mapped[str] = mapped_column(Text)
    cta: Mapped[str] = mapped_column(String(50))
    url: Mapped[str] = mapped_column(String(255))
    image: Mapped[str] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(SmallInteger)
