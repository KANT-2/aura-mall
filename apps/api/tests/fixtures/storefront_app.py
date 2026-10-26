"""Test-only BFF contract server using production routes, services and domain rules.

Only database repositories and revocation storage are replaced. No production
auth endpoints, signing keys, accounts or in-memory storage are registered.
This fixture verifies HTTP/DTO integration, not PostgreSQL transactions.
"""

import json
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from aura_api.config import Settings
from aura_api.core.revocation import get_token_revocation_store
from aura_api.domain import catalog as catalog_domain
from aura_api.infra.database import get_session
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
from aura_api.infra.repositories import catalog, partner, recipes, users
from aura_api.infra.repositories.catalog import CatalogRows
from aura_api.infra.repositories.recipes import SavedRecipe
from aura_api.main import create_app

ROOT = Path(__file__).resolve().parents[4]
SOURCE = json.loads((ROOT / "apps/web/mock-server/fixtures/catalog.json").read_text())
app = create_app(Settings(database_url=None))

# Use the same fixture that generates db/seed.sql, mapped to real ORM row shapes.
ROWS = CatalogRows(
    collections=[Collection(**item) for item in SOURCE["collections"]],
    types=[ProductType(**item) for item in SOURCE["types"]],
    products=[
        Product(
            id=item["id"],
            collection_id=item["collection"],
            type_id=item["type"],
            name=item["name"],
            english_name=item["englishName"],
            volume=item["volume"],
            price=item["price"],
            stock=item["stock"],
            image=item["image"],
            image_url=item["imageUrl"],
            description=item["description"],
            category=item["category"],
            notes=item["notes"],
            note_images=item.get("noteImages"),
            gift_images=item.get("giftImages"),
            featured=item["featured"],
            is_new=item["isNew"],
            bestseller_rank=(SOURCE["home"]["bestsellerIds"].index(item["id"]) + 1)
            if item["id"] in SOURCE["home"]["bestsellerIds"]
            else None,
        )
        for item in SOURCE["products"]
    ],
    ingredients=[Ingredient(**item) for item in SOURCE["ingredients"]],
    scent_families=[
        ScentFamily(**{key: value for key, value in item.items() if key != "notes"})
        for item in SOURCE["scentFamilies"]
    ],
    family_ingredients=[
        ScentFamilyIngredient(family_id=item["id"], ingredient_id=note, position=position)
        for item in SOURCE["scentFamilies"]
        for position, note in enumerate(item["notes"])
    ],
    suggested_names=[
        SuggestedName(collection_id=collection, name=name, sort_order=position)
        for collection, names in SOURCE["atelier"]["suggestedNames"].items()
        for position, name in enumerate(names)
    ],
    promotions=[
        Promotion(audience=audience, **item)
        for audience in ("guest", "member")
        for item in SOURCE["home"][f"{audience}Promotions"]
    ],
)
RULE_CATALOG = catalog_domain.Catalog(
    products={
        item.id: catalog_domain.Product(
            item.id, item.collection_id, item.type_id, item.name, item.price, item.stock
        )
        for item in ROWS.products
    },
    ingredients={
        item.id: catalog_domain.Ingredient(item.id, item.name, item.stage, item.color)
        for item in ROWS.ingredients
    },
)
saved: dict[uuid.UUID, list[SavedRecipe]] = {}


class Session:
    @asynccontextmanager
    async def begin(self):
        yield

    async def rollback(self):
        pass


async def session():
    yield Session()


class Revocations:
    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        return False


async def load_catalog(session):
    return ROWS


async def load_rule_catalog(session):
    return RULE_CATALOG


async def find_product(session, product_id):
    match = next((item for item in ROWS.products if item.id == product_id), None)
    product_type = next((item for item in ROWS.types if match and item.id == match.type_id), None)
    return (match, product_type.name) if match and product_type else None


async def member_exists(session, member_id):
    # Only called after the production verifier validates the signed UUID subject.
    return True


async def list_recipes(session, member_id):
    return list(saved.get(member_id, []))


async def find_recipe(session, member_id, recipe_id):
    return next((item for item in saved.get(member_id, []) if item.id == recipe_id), None)


async def add_recipe(session, member_id, draft):
    item = SavedRecipe(
        id=uuid.uuid4(),
        parent_id=uuid.UUID(draft.parent_id) if draft.parent_id else None,
        version=draft.version,
        name=draft.name,
        label=draft.label,
        counts=dict(draft.counts),
        color=draft.color,
        created_at=datetime.now(UTC),
    )
    saved.setdefault(member_id, []).insert(0, item)
    return item


async def delete_recipe(session, member_id, recipe_id):
    items = saved.get(member_id, [])
    previous = len(items)
    saved[member_id] = [item for item in items if item.id != recipe_id]
    return previous != len(saved[member_id])


async def add_inquiry(session, inquiry):
    return uuid.uuid4()


catalog.load_catalog = load_catalog
catalog.load_rule_catalog = load_rule_catalog
catalog.find_product = find_product
users.member_exists = member_exists
recipes.list_recipes = list_recipes
recipes.find_recipe = find_recipe
recipes.add_recipe = add_recipe
recipes.delete_recipe = delete_recipe
partner.add_inquiry = add_inquiry
app.dependency_overrides[get_session] = session
app.dependency_overrides[get_token_revocation_store] = Revocations
