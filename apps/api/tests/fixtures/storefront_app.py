"""Test-only BFF contract server using production routes, services and domain rules.

Database repositories and revocation storage are test-only adapters. Production
admin auth/order routes, services, domain rules and JWT signing/verification are used.
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
from aura_api.identity.service import PASSWORD_HASHER
from aura_api.infra.database import get_session
from aura_api.infra.models import (
    Admin,
    AdminSession,
    Collection,
    Ingredient,
    Product,
    ProductType,
    Promotion,
    ScentFamily,
    ScentFamilyIngredient,
    SuggestedName,
)
from aura_api.infra.repositories import admin as admin_repository
from aura_api.infra.repositories import catalog, partner, recipes, users
from aura_api.infra.repositories import orders as order_repository
from aura_api.infra.repositories.catalog import CatalogRows
from aura_api.infra.repositories.orders import SavedItem, SavedOrder
from aura_api.infra.repositories.recipes import SavedRecipe
from aura_api.main import create_app

ROOT = Path(__file__).resolve().parents[4]
SOURCE = json.loads(
    (ROOT / "apps/web/mock-server/fixtures/catalog.json").read_text(encoding="utf-8")
)
settings = Settings(database_url=None)
app = create_app(settings)

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
    async def flush(self):
        pass

    @asynccontextmanager
    async def begin(self):
        yield

    async def rollback(self):
        pass


async def session():
    yield Session()


class Revocations:
    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        row = admin_tokens.get(uuid.UUID(jti))
        if row is None:
            return False  # Existing resource tests sign customer tokens in their test process.
        admin = admin_accounts.get(row.admin_id)
        return (
            issuer != settings.jwt_issuer
            or row.revoked_at is not None
            or row.expires_at <= datetime.now(UTC)
            or admin is None
            or admin.status != "active"
        )


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


# Real admin routes/services/JWT signer with test-only repository adapters.
admin_id = uuid.uuid4()
admin_accounts = {
    admin_id: Admin(
        id=admin_id,
        email="operator@example.com",
        name="운영자",
        password_hash=PASSWORD_HASHER.hash("admin-password123"),
        status="active",
    )
}
admin_tokens: dict[uuid.UUID, AdminSession] = {}


async def admin_by_email(session, email):
    return next((admin for admin in admin_accounts.values() if admin.email == email), None)


async def active_admin(session, admin_id):
    admin = admin_accounts.get(admin_id)
    return admin if admin is not None and admin.status == "active" else None


async def is_customer(session, user_id):
    return user_id not in admin_accounts


def add_admin_session(session, **values):
    admin_tokens[values["jti"]] = AdminSession(**values, revoked_at=None)


async def admin_session(session, jti):
    return admin_tokens.get(jti)


async def revoke_admin_session(session, row):
    row.revoked_at = datetime.now(UTC)


async def add_admin(session, **values):
    admin = Admin(id=uuid.uuid4(), **values, status="active")
    admin_accounts[admin.id] = admin
    return admin


async def admin_list_products(session, *, q, collection, stock, page):
    rows = [
        (product, next(kind.name for kind in ROWS.types if kind.id == product.type_id))
        for product in ROWS.products
        if (not q or q.lower() in product.name.lower())
        and (not collection or collection == product.collection_id)
    ]
    for product, _ in rows:
        product.version = 1
        product.updated_at = None
    return rows[(page - 1) * 20 : page * 20], len(rows)


admin_repository.admin_by_email = admin_by_email
admin_repository.active_admin = active_admin
admin_repository.is_customer = is_customer
admin_repository.add_admin_session = add_admin_session
admin_repository.admin_session = admin_session
admin_repository.revoke_admin_session = revoke_admin_session
admin_repository.add_admin = add_admin
admin_repository.add_audit = lambda *args, **kwargs: None
admin_repository.list_products = admin_list_products

# Order adapters keep the production pricing/domain/service and idempotency flow.
for position, product in enumerate(ROWS.products):
    product.sort_order = position
orders_by_member: dict[uuid.UUID, list[SavedOrder]] = {}
order_keys: dict[tuple[uuid.UUID, str], SavedOrder] = {}


async def list_orders(session, member_id):
    return list(orders_by_member.get(member_id, []))


async def order_by_key(session, member_id, key):
    return order_keys.get((member_id, key))


async def lock_available_coupon(session, member_id):
    return None


async def products_with_type_names(session):
    return {
        product.id: (product, next(kind.name for kind in ROWS.types if kind.id == product.type_id))
        for product in ROWS.products
    }


async def take_stock(session, product_id, quantity):
    return True


async def add_order(session, member_id, priced, snapshots, selection_names, coupon_id, key):
    items = [
        SavedItem(
            key=line.key,
            product=snapshot,
            quantity=line.quantity,
            selection=list(line.selection),
            custom=(
                {
                    "name": line.custom.name,
                    "label": line.custom.label,
                    "color": line.custom.color,
                    "counts": dict(line.custom.counts),
                    "productType": "eau-de-parfum",
                }
                if line.custom
                else None
            ),
            unit_price=line.unit_price,
        )
        for line, snapshot in zip(priced.lines, snapshots, strict=True)
    ]
    order = SavedOrder(
        id=uuid.uuid4(),
        items=items,
        total=priced.total,
        recipient=priced.recipient,
        address=priced.address,
        created_at=datetime.now(UTC),
    )
    orders_by_member.setdefault(member_id, []).insert(0, order)
    if key:
        order_keys[(member_id, key)] = order
    return order


order_repository.list_orders = list_orders
order_repository.order_by_key = order_by_key
order_repository.lock_available_coupon = lock_available_coupon
order_repository.products_with_type_names = products_with_type_names
order_repository.take_stock = take_stock
order_repository.add_order = add_order
