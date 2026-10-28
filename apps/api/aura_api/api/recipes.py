"""Recipe routes (BFF contract): list, save or remake, delete. Members only, except GET."""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from aura_api.api.deps import OptionalMember, Session, member_required
from aura_api.core.errors import ErrorResponse
from aura_api.infra.repositories.recipes import SavedRecipe
from aura_api.services import recipes as service

router = APIRouter(prefix="/recipes", tags=["recipes"])
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 404, 409)}
SaveMember = Annotated[uuid.UUID, Depends(member_required("로그인 후 향을 저장할 수 있어요."))]
Member = Annotated[uuid.UUID, Depends(member_required("로그인이 필요해요."))]


class RecipeIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "required": ["name", "counts"],
            "example": {"name": "오후의 향", "label": "paper", "counts": {"rose": 2}},
        }
    )
    # Name, label and counts are domain rules (AT-01~08); the raw values go to the domain.
    name: Any = Field(default=None, json_schema_extra={"type": "string", "maxLength": 30})
    label: Any = Field(
        default=None,
        json_schema_extra={
            "type": "string",
            "description": "classic / paper / minimal; 그 외 classic",
        },
    )
    counts: Any = Field(
        default=None,
        json_schema_extra={
            "type": "object",
            "additionalProperties": {"type": "integer", "minimum": 0},
            "description": "카탈로그 향료 ID별 방울 수, 합계 1~20",
        },
    )
    parent: str | None = None


class RecipeOut(BaseModel):
    id: uuid.UUID
    parent: uuid.UUID | None = None  # left out of the JSON for an original recipe
    version: int
    name: str
    label: str
    counts: dict[str, int]
    color: str
    created: datetime


def recipe_out(recipe: SavedRecipe) -> RecipeOut:
    optional = {"parent": recipe.parent_id} if recipe.parent_id else {}
    return RecipeOut(
        id=recipe.id,
        version=recipe.version,
        name=recipe.name,
        label=recipe.label,
        counts=recipe.counts,
        color=recipe.color,
        created=recipe.created_at,
        **optional,
    )


@router.get("", response_model=list[RecipeOut], response_model_exclude_unset=True)
async def list_recipes(member_id: OptionalMember, session: Session) -> list[RecipeOut]:
    if member_id is None:
        return []
    return [recipe_out(item) for item in await service.list_recipes(session, member_id)]


@router.post(
    "",
    status_code=201,
    response_model=RecipeOut,
    response_model_exclude_unset=True,
    responses=ERRORS,
)
async def save_recipe(body: RecipeIn, member_id: SaveMember, session: Session) -> RecipeOut:
    return recipe_out(await service.save_recipe(session, member_id, body.model_dump()))


@router.delete(
    "/{recipe_id}",
    response_model=list[RecipeOut],
    response_model_exclude_unset=True,
    responses=ERRORS,
)
async def delete_recipe(recipe_id: str, member_id: Member, session: Session) -> list[RecipeOut]:
    return [recipe_out(item) for item in await service.delete_recipe(session, member_id, recipe_id)]
