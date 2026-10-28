"""Catalog routes without a database: repository reads are replaced with in-memory rows."""

import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
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
from aura_api.infra.repositories import catalog as repository
from aura_api.infra.repositories.catalog import CatalogRows
from aura_api.main import create_app


def product(id: str, **values) -> Product:
    fields = dict(
        id=id,
        collection_id="fresh",
        type_id="eau-de-parfum",
        name=id,
        english_name=id,
        volume="50 mL",
        price=None,
        stock=3,
        image=f"/assets/products/{id}.webp",
        image_url=f"/assets/products/{id}.webp",
        description="desc",
        category="향수",
        notes=["베르가못"],
        note_images=None,
        gift_images=None,
        featured=False,
        is_new=False,
        bestseller_rank=None,
        sort_order=1,
    )
    fields.update(values)
    return Product(**fields)


ROWS = CatalogRows(
    collections=[
        Collection(
            id="fresh", name="FRESH", title="t", description="d", color="#a5ad68", notes=["n"]
        )
    ],
    types=[ProductType(id="eau-de-parfum", name="Eau de Parfum", label="오 드 퍼퓸")],
    products=[
        product("fresh-eau-de-parfum", price=89_000, bestseller_rank=2, note_images={"a": "/a"}),
        product("fresh-gift-set", gift_images=["/g1"], bestseller_rank=1),
    ],
    ingredients=[
        Ingredient(id="bergamot", name="베르가못", stage="top", color="#e8d36b", description="d")
    ],
    scent_families=[
        ScentFamily(
            id="citrus", name="시트러스", english="CITRUS", asset="bergamot", description="d"
        )
    ],
    family_ingredients=[
        ScentFamilyIngredient(family_id="citrus", ingredient_id="bergamot", position=1),
        ScentFamilyIngredient(family_id="citrus", ingredient_id="lemon", position=2),
    ],
    suggested_names=[SuggestedName(collection_id="fresh", name="맑은 아침", sort_order=1)],
    promotions=[
        Promotion(audience="guest", title="g", copy="gc", cta="c", url="/register", image="/i"),
        Promotion(audience="member", title="m", copy="mc", cta="c", url="/atelier", image="/i"),
    ],
)


@pytest.fixture
def client(monkeypatch):
    async def load_catalog(session):
        return ROWS

    async def find_product(session, product_id):
        match = next((item for item in ROWS.products if item.id == product_id), None)
        return None if match is None else (match, "Eau de Parfum")

    async def no_session():
        yield None

    monkeypatch.setattr(repository, "load_catalog", load_catalog)
    monkeypatch.setattr(repository, "find_product", find_product)
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_session] = no_session
    with TestClient(app) as client:
        yield client


def test_catalog_matches_web_shape(client):
    body = client.get("/api/v1/catalog").json()

    assert set(body) == {
        "products",
        "collections",
        "types",
        "ingredients",
        "scentFamilies",
        "atelier",
        "home",
    }
    assert body["home"]["bestsellerIds"] == ["fresh-gift-set", "fresh-eau-de-parfum"]
    assert body["home"]["guestPromotions"][0]["copy"] == "gc"
    assert body["home"]["memberPromotions"][0]["url"] == "/atelier"
    assert body["scentFamilies"][0]["notes"] == ["bergamot", "lemon"]
    assert body["atelier"]["suggestedNames"] == {"fresh": ["맑은 아침"], "soft": [], "warm": []}
    assert body["types"] == [
        {"id": "eau-de-parfum", "name": "Eau de Parfum", "label": "오 드 퍼퓸"}
    ]


def test_optional_product_fields_are_omitted_but_null_price_is_kept(client):
    perfume, gift = client.get("/api/v1/catalog").json()["products"]

    assert perfume["price"] == 89_000 and perfume["noteImages"] == {"a": "/a"}
    assert "giftImages" not in perfume
    assert gift["price"] is None and gift["giftImages"] == ["/g1"]
    assert "noteImages" not in gift
    assert perfume["typeName"] == "Eau de Parfum" and perfume["imageUrl"].endswith(".webp")
    assert {"isNew", "englishName", "collection", "type"} <= set(perfume)


def test_product_by_id_and_legacy_alias(client):
    direct = client.get("/api/v1/catalog/products/fresh-eau-de-parfum")
    legacy = client.get("/api/v1/catalog/products/bergamot-veil")

    assert direct.status_code == legacy.status_code == 200
    assert legacy.json() == direct.json()
    assert direct.json()["id"] == "fresh-eau-de-parfum"


def test_unknown_product_is_404_in_common_error_shape(client):
    response = client.get("/api/v1/catalog/products/no-such-product")

    assert response.status_code == 404
    assert response.json()["error"] == {
        "code": "PRODUCT_NOT_FOUND",
        "message": "상품을 찾을 수 없어요.",
    }
    assert "x-request-id" in response.headers


def test_catalog_without_database_fails_closed():
    with TestClient(create_app(Settings(_env_file=None)), raise_server_exceptions=False) as client:
        response = client.get("/api/v1/catalog")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
