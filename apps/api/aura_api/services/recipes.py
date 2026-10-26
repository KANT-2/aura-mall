"""Recipe use cases for a signed-in member: list, save (new or remake) and delete."""

import uuid
from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.atelier import new_recipe
from aura_api.domain.errors import NotFound
from aura_api.infra.repositories import catalog as catalog_repository
from aura_api.infra.repositories import recipes as repository
from aura_api.infra.repositories.recipes import SavedRecipe


def _uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(value) if isinstance(value, str) else None
    except ValueError:
        return None


async def list_recipes(session: AsyncSession, member_id: uuid.UUID) -> list[SavedRecipe]:
    return await repository.list_recipes(session, member_id)


async def save_recipe(
    session: AsyncSession, member_id: uuid.UUID, raw: Mapping[str, object]
) -> SavedRecipe:
    async with session.begin():
        catalog = await catalog_repository.load_rule_catalog(session)
        parent = None
        if raw.get("parent"):
            parent_id = _uuid(raw["parent"])
            parent = parent_id and await repository.find_recipe(session, member_id, parent_id)
            if not parent:
                raise NotFound("RECIPE_PARENT_NOT_FOUND", "저장한 원본 향을 찾을 수 없어요.")
        draft = new_recipe(
            raw.get("name"),
            raw.get("label"),
            raw.get("counts"),
            catalog.ingredients,
            parent_id=str(parent.id) if parent else None,
            parent_version=parent.version if parent else None,
        )
        return await repository.add_recipe(session, member_id, draft)


async def delete_recipe(
    session: AsyncSession, member_id: uuid.UUID, recipe_id: str
) -> list[SavedRecipe]:
    async with session.begin():
        target = _uuid(recipe_id)
        if target is None or not await repository.delete_recipe(session, member_id, target):
            raise NotFound("RECIPE_NOT_FOUND", "저장한 향을 찾을 수 없어요.")
    return await repository.list_recipes(session, member_id)
