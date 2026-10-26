"""Catalog routes: GET /catalog and GET /catalog/products/{id} (BFF contract, camelCase JSON)."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.core.errors import ErrorResponse
from aura_api.domain.errors import NotFound
from aura_api.infra.database import get_session
from aura_api.infra.models import Product
from aura_api.infra.repositories.catalog import CatalogRows
from aura_api.services import catalog as service

router = APIRouter(prefix="/catalog", tags=["catalog"])
Session = Annotated[AsyncSession, Depends(get_session)]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProductOut(CamelModel):
    id: str
    collection: str
    type: str
    type_name: str
    name: str
    english_name: str
    volume: str
    price: int | None
    stock: int
    image: str
    description: str
    notes: list[str]
    featured: bool
    # Optional in the web type: left out of the JSON when the product has none.
    note_images: dict[str, str] | None = None
    gift_images: list[str] | None = None
    image_url: str
    category: str
    is_new: bool


class CollectionOut(CamelModel):
    id: str
    name: str
    title: str
    description: str
    color: str
    notes: list[str]


class ProductTypeOut(CamelModel):
    id: str
    name: str
    label: str


class IngredientOut(CamelModel):
    id: str
    name: str
    stage: Literal["top", "middle", "base"]
    color: str
    description: str


class ScentFamilyOut(CamelModel):
    id: str
    name: str
    english: str
    asset: str
    description: str
    notes: list[str]


class PromotionOut(CamelModel):
    title: str
    copy_: str = Field(alias="copy")  # `copy` would shadow BaseModel.copy
    cta: str
    url: str
    image: str


class SuggestedNamesOut(CamelModel):
    fresh: list[str]
    soft: list[str]
    warm: list[str]


class AtelierOut(CamelModel):
    suggested_names: SuggestedNamesOut


class HomeOut(CamelModel):
    bestseller_ids: list[str]
    guest_promotions: list[PromotionOut]
    member_promotions: list[PromotionOut]


class CatalogOut(CamelModel):
    products: list[ProductOut]
    collections: list[CollectionOut]
    types: list[ProductTypeOut]
    ingredients: list[IngredientOut]
    scent_families: list[ScentFamilyOut]
    atelier: AtelierOut
    home: HomeOut


def product_out(product: Product, type_name: str) -> ProductOut:
    optional = {}
    if product.note_images is not None:
        optional["note_images"] = product.note_images
    if product.gift_images is not None:
        optional["gift_images"] = product.gift_images
    return ProductOut(
        id=product.id,
        collection=product.collection_id,
        type=product.type_id,
        type_name=type_name,
        name=product.name,
        english_name=product.english_name,
        volume=product.volume,
        price=product.price,
        stock=product.stock,
        image=product.image,
        description=product.description,
        notes=product.notes,
        featured=product.featured,
        image_url=product.image_url,
        category=product.category,
        is_new=product.is_new,
        **optional,
    )


def catalog_out(rows: CatalogRows) -> CatalogOut:
    type_names = {item.id: item.name for item in rows.types}
    family_notes: dict[str, list[str]] = {}
    for link in rows.family_ingredients:
        family_notes.setdefault(link.family_id, []).append(link.ingredient_id)
    suggested: dict[str, list[str]] = {}
    for item in rows.suggested_names:
        suggested.setdefault(item.collection_id, []).append(item.name)
    promotions: dict[str, list[PromotionOut]] = {"guest": [], "member": []}
    for item in rows.promotions:
        promotions[item.audience].append(
            PromotionOut(
                title=item.title, copy_=item.copy, cta=item.cta, url=item.url, image=item.image
            )
        )
    bestsellers = sorted(
        (item for item in rows.products if item.bestseller_rank is not None),
        key=lambda item: item.bestseller_rank,
    )
    return CatalogOut(
        products=[product_out(item, type_names[item.type_id]) for item in rows.products],
        collections=[
            CollectionOut(
                id=item.id,
                name=item.name,
                title=item.title,
                description=item.description,
                color=item.color,
                notes=item.notes,
            )
            for item in rows.collections
        ],
        types=[ProductTypeOut(id=item.id, name=item.name, label=item.label) for item in rows.types],
        ingredients=[
            IngredientOut(
                id=item.id,
                name=item.name,
                stage=item.stage,
                color=item.color,
                description=item.description,
            )
            for item in rows.ingredients
        ],
        scent_families=[
            ScentFamilyOut(
                id=item.id,
                name=item.name,
                english=item.english,
                asset=item.asset,
                description=item.description,
                notes=family_notes.get(item.id, []),
            )
            for item in rows.scent_families
        ],
        atelier=AtelierOut(
            suggested_names=SuggestedNamesOut(
                fresh=suggested.get("fresh", []),
                soft=suggested.get("soft", []),
                warm=suggested.get("warm", []),
            )
        ),
        home=HomeOut(
            bestseller_ids=[item.id for item in bestsellers],
            guest_promotions=promotions["guest"],
            member_promotions=promotions["member"],
        ),
    )


@router.get("", response_model=CatalogOut, response_model_exclude_unset=True)
async def read_catalog(session: Session) -> CatalogOut:
    return catalog_out(await service.get_catalog(session))


@router.get(
    "/products/{product_id}",
    response_model=ProductOut,
    response_model_exclude_unset=True,
    responses={404: {"model": ErrorResponse}},
)
async def read_product(product_id: str, session: Session) -> ProductOut:
    try:
        product, type_name = await service.get_product(session, product_id)
    except NotFound:
        raise HTTPException(status_code=404) from None
    return product_out(product, type_name)
