"""Catalog reads. Every list comes back in display order."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain import catalog as domain
from aura_api.infra.models import (
    Collection,
    Ingredient,
    Product,
    ProductType,
    Promotion,
    ScentFamily,
    ScentFamilyIngredient,
    SuggestedName,
)


@dataclass(frozen=True)
class CatalogRows:
    collections: list[Collection]
    types: list[ProductType]
    products: list[Product]
    ingredients: list[Ingredient]
    scent_families: list[ScentFamily]
    family_ingredients: list[ScentFamilyIngredient]
    suggested_names: list[SuggestedName]
    promotions: list[Promotion]


async def load_catalog(session: AsyncSession) -> CatalogRows:
    async def rows(model, *order):
        return list(await session.scalars(select(model).order_by(*order)))

    return CatalogRows(
        collections=await rows(Collection, Collection.sort_order),
        types=await rows(ProductType, ProductType.sort_order),
        products=list(
            await session.scalars(
                select(Product).where(Product.is_active.is_(True)).order_by(Product.sort_order)
            )
        ),
        ingredients=await rows(Ingredient, Ingredient.sort_order),
        scent_families=await rows(ScentFamily, ScentFamily.sort_order),
        family_ingredients=await rows(
            ScentFamilyIngredient,
            ScentFamilyIngredient.family_id,
            ScentFamilyIngredient.position,
        ),
        suggested_names=await rows(
            SuggestedName, SuggestedName.collection_id, SuggestedName.sort_order
        ),
        promotions=await rows(Promotion, Promotion.audience, Promotion.sort_order),
    )


async def find_product(session: AsyncSession, product_id: str) -> tuple[Product, str] | None:
    """The product with its type name (Product.typeName), or None."""
    row = (
        await session.execute(
            select(Product, ProductType.name)
            .join(ProductType, Product.type_id == ProductType.id)
            .where(Product.id == product_id, Product.is_active.is_(True))
        )
    ).first()
    return None if row is None else (row[0], row[1])


async def load_rule_catalog(session: AsyncSession) -> domain.Catalog:
    """Products and ingredients as the domain rules see them (catalog order kept)."""
    products = await session.scalars(
        select(Product).where(Product.is_active.is_(True)).order_by(Product.sort_order)
    )
    ingredients = await session.scalars(select(Ingredient).order_by(Ingredient.sort_order))
    return domain.Catalog(
        products={
            item.id: domain.Product(
                id=item.id,
                collection=item.collection_id,
                type=item.type_id,
                name=item.name,
                price=item.price,
                stock=item.stock,
            )
            for item in products
        },
        ingredients={
            item.id: domain.Ingredient(
                id=item.id, name=item.name, stage=item.stage, color=item.color
            )
            for item in ingredients
        },
    )
