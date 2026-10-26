import pytest

from aura_api.modules.atelier.domain import (
    mix_color,
    new_recipe,
    normalize_label,
    ratios,
    validate_counts,
    validate_draft,
)
from aura_api.modules.errors import InvalidInput


def test_counts_drop_zero_entries(catalog):
    assert validate_counts({"bergamot": 3, "rose": 0}, catalog.ingredients) == {"bergamot": 3}


@pytest.mark.parametrize(
    "counts",
    [
        {},
        {"bergamot": 0},
        {"bergamot": 21},
        {"bergamot": 15, "rose": 6},
        {"unknown": 1},
        {"bergamot": -1},
        {"bergamot": 1.5},
        {"bergamot": True},
        ["bergamot"],
    ],
)
def test_counts_reject_invalid_compositions(catalog, counts):
    with pytest.raises(InvalidInput):
        validate_counts(counts, catalog.ingredients)


def test_twenty_drops_is_the_maximum(catalog):
    assert validate_counts({"bergamot": 12, "rose": 8}, catalog.ingredients)


def test_ratios_are_derived_from_counts():
    assert ratios({"bergamot": 3, "rose": 2}) == {"bergamot": 0.6, "rose": 0.4}


def test_mix_color_is_count_weighted(catalog):
    assert mix_color({"bergamot": 1}, catalog.ingredients) == "#a5ad68"
    # (0xa5*1 + 0xd4*1) / 2 = 188.5 → 189 (halves round up)
    assert mix_color({"bergamot": 1, "rose": 1}, catalog.ingredients)[1:3] == "bd"


def test_unknown_label_falls_back_to_classic():
    assert normalize_label("paper") == "paper"
    assert normalize_label("neon") == "classic"


def test_new_recipe_starts_at_version_one(catalog):
    recipe = new_recipe(" 느린 오후 ", "minimal", {"bergamot": 3}, catalog.ingredients)

    assert (recipe.name, recipe.label, recipe.version, recipe.parent_id) == (
        "느린 오후",
        "minimal",
        1,
        None,
    )
    assert recipe.color == "#a5ad68"


def test_remake_is_a_new_version_of_the_parent(catalog):
    recipe = new_recipe(
        "느린 오후",
        "classic",
        {"bergamot": 3, "rose": 3},
        catalog.ingredients,
        parent_id="r-1",
        parent_version=2,
    )

    assert (recipe.version, recipe.parent_id) == (3, "r-1")


@pytest.mark.parametrize("name", ["", "   ", "가" * 31, None])
def test_recipe_name_is_required_and_short(catalog, name):
    with pytest.raises(InvalidInput):
        new_recipe(name, "classic", {"bergamot": 1}, catalog.ingredients)


def test_draft_keeps_only_known_steps(catalog):
    draft = validate_draft(
        {"counts": {"rose": 2}, "name": "작업 중", "label": "x", "step": "entry"},
        catalog.ingredients,
    )

    assert (draft.counts, draft.name, draft.label, draft.step) == (
        {"rose": 2},
        "작업 중",
        "classic",
        "select",
    )


def test_draft_requires_a_valid_composition(catalog):
    with pytest.raises(InvalidInput) as error:
        validate_draft({"counts": {}}, catalog.ingredients)

    assert error.value.code == "DRAFT_INVALID"
