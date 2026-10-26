"""Saved recipes. Rows are only inserted or deleted, never updated."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.atelier import RecipeDraft
from aura_api.infra.models import Recipe, RecipeIngredient


@dataclass(frozen=True)
class SavedRecipe:
    id: uuid.UUID
    parent_id: uuid.UUID | None
    version: int
    name: str
    label: str
    counts: dict[str, int]
    color: str
    created_at: datetime


async def list_recipes(session: AsyncSession, user_id: uuid.UUID) -> list[SavedRecipe]:
    recipes = list(
        await session.scalars(
            select(Recipe)
            .where(Recipe.user_id == user_id)
            .order_by(Recipe.created_at.desc(), Recipe.id)
        )
    )
    counts: dict[uuid.UUID, dict[str, int]] = {recipe.id: {} for recipe in recipes}
    if recipes:
        rows = await session.scalars(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id.in_(counts))
        )
        for row in rows:
            counts[row.recipe_id][row.ingredient_id] = row.count
    return [_saved(recipe, counts[recipe.id]) for recipe in recipes]


async def find_recipe(
    session: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID
) -> Recipe | None:
    """Only the member's own recipe; someone else's looks the same as a missing one."""
    return await session.scalar(
        select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user_id)
    )


async def add_recipe(session: AsyncSession, user_id: uuid.UUID, draft: RecipeDraft) -> SavedRecipe:
    recipe = Recipe(
        user_id=user_id,
        parent_id=uuid.UUID(draft.parent_id) if draft.parent_id else None,
        version=draft.version,
        name=draft.name,
        label=draft.label,
        color=draft.color,
    )
    session.add(recipe)
    await session.flush()
    session.add_all(
        RecipeIngredient(recipe_id=recipe.id, ingredient_id=ingredient_id, count=count)
        for ingredient_id, count in draft.counts.items()
    )
    await session.flush()
    await session.refresh(recipe, ["created_at"])
    return _saved(recipe, dict(draft.counts))


async def delete_recipe(session: AsyncSession, user_id: uuid.UUID, recipe_id: uuid.UUID) -> bool:
    result = await session.execute(
        delete(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user_id)
    )
    return result.rowcount == 1


def _saved(recipe: Recipe, counts: dict[str, int]) -> SavedRecipe:
    return SavedRecipe(
        id=recipe.id,
        parent_id=recipe.parent_id,
        version=recipe.version,
        name=recipe.name,
        label=recipe.label,
        counts=counts,
        color=recipe.color,
        created_at=recipe.created_at,
    )
