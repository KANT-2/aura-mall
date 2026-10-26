"""Atelier domain: ingredient counts, blend color, recipes and drafts."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from aura_api.modules.catalog.domain import Ingredient
from aura_api.modules.errors import InvalidInput

MAX_DROPS = 20
NAME_MAX = 30
LABELS = frozenset({"classic", "paper", "minimal"})
DEFAULT_LABEL = "classic"
DEFAULT_COLOR = "#d5b575"

DraftStep = Literal["select", "result"]


def validate_counts(counts: object, ingredients: Mapping[str, Ingredient]) -> dict[str, int]:
    """Known ingredients, whole numbers ≥ 0, total 1–20. Zero entries are dropped.

    Invalid compositions are rejected, never adjusted, so a user's proportions are kept.
    """
    if not isinstance(counts, Mapping):
        raise InvalidInput("COUNTS_INVALID", "향 이름과 향료 조합을 확인해 주세요.")
    used: dict[str, int] = {}
    total = 0
    for ingredient_id, count in counts.items():
        if (
            ingredient_id not in ingredients
            or isinstance(count, bool)
            or not isinstance(count, int)
            or count < 0
        ):
            raise InvalidInput("COUNTS_INVALID", "향 이름과 향료 조합을 확인해 주세요.")
        total += count
        if count > 0:
            used[ingredient_id] = count
    if not 0 < total <= MAX_DROPS:
        raise InvalidInput("COUNTS_INVALID", "향 이름과 향료 조합을 확인해 주세요.")
    return used


def normalize_label(label: object) -> str:
    """Unknown labels fall back to classic, as the web client does."""
    return label if isinstance(label, str) and label in LABELS else DEFAULT_LABEL


def total_drops(counts: Mapping[str, int]) -> int:
    return sum(counts.values())


def ratios(counts: Mapping[str, int]) -> dict[str, float]:
    """Share of each ingredient. Derived on read, never stored."""
    total = total_drops(counts)
    return {key: value / total for key, value in counts.items()} if total else {}


def mix_color(counts: Mapping[str, int], ingredients: Mapping[str, Ingredient]) -> str:
    """Count-weighted average of ingredient colors, rounded per channel."""
    total = total_drops(counts)
    if not total:
        return DEFAULT_COLOR
    channels = [0, 0, 0]
    for ingredient_id, count in counts.items():
        color = ingredients[ingredient_id].color
        for index in range(3):
            channels[index] += int(color[1 + index * 2 : 3 + index * 2], 16) * count
    # JavaScript Math.round: halves round up.
    return "#" + "".join(f"{int(value / total + 0.5):02x}" for value in channels)


@dataclass(frozen=True)
class RecipeDraft:
    """A recipe about to be saved. ID and creation time are set by the server."""

    name: str
    label: str
    counts: dict[str, int]
    color: str
    version: int
    parent_id: str | None


def new_recipe(
    name: object,
    label: object,
    counts: object,
    ingredients: Mapping[str, Ingredient],
    *,
    parent_id: str | None = None,
    parent_version: int | None = None,
) -> RecipeDraft:
    """Saving never edits an existing recipe: a remake is a new row with parent version + 1.

    The caller must have checked that the parent belongs to the same member.
    """
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > NAME_MAX:
        raise InvalidInput("RECIPE_INVALID", "향 이름과 향료 조합을 확인해 주세요.")
    valid = validate_counts(counts, ingredients)
    if (parent_id is None) != (parent_version is None):
        raise ValueError("parent_id and parent_version go together")
    return RecipeDraft(
        name=name.strip(),
        label=normalize_label(label),
        counts=valid,
        color=mix_color(valid, ingredients),
        version=(parent_version or 0) + 1,
        parent_id=parent_id,
    )


@dataclass(frozen=True)
class AtelierDraft:
    counts: dict[str, int]
    name: str
    label: str
    step: DraftStep


def validate_draft(raw: object, ingredients: Mapping[str, Ingredient]) -> AtelierDraft:
    """One draft per visitor, overwritten as a whole."""
    if not isinstance(raw, Mapping):
        raise InvalidInput("DRAFT_INVALID", "조향 초안을 확인해 주세요.")
    try:
        counts = validate_counts(raw.get("counts"), ingredients)
    except InvalidInput as error:
        raise InvalidInput("DRAFT_INVALID", "조향 초안을 확인해 주세요.") from error
    name = raw.get("name")
    name = name if isinstance(name, str) else ""
    if len(name) > NAME_MAX:
        raise InvalidInput("DRAFT_INVALID", "조향 초안을 확인해 주세요.")
    step: DraftStep = "result" if raw.get("step") == "result" else "select"
    return AtelierDraft(counts, name, normalize_label(raw.get("label")), step)
