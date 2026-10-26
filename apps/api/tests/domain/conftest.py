import pytest

from aura_api.domain.catalog import Catalog, Ingredient, Product


def _product(product_id: str, collection: str, type_: str, price: int | None, stock: int = 15):
    return Product(product_id, collection, type_, product_id, price, stock)


@pytest.fixture
def catalog() -> Catalog:
    products = [
        _product("fresh-hand-cream", "fresh", "hand-cream", 28_000),
        _product("fresh-eau-de-parfum", "fresh", "eau-de-parfum", 98_000),
        _product("fresh-candle", "fresh", "candle", 62_000),
        _product("fresh-diffuser", "fresh", "diffuser", 68_000, stock=0),
        _product("fresh-mystery", "fresh", "hair-mist", None),
        _product("fresh-gift-set", "fresh", "gift-set", None),
        _product("soft-hand-cream", "soft", "hand-cream", 28_000),
        _product("soft-eau-de-parfum", "soft", "eau-de-parfum", 98_000),
    ]
    ingredients = [
        Ingredient("bergamot", "베르가못", "top", "#a5ad68"),
        Ingredient("rose", "장미", "middle", "#d48a95"),
        Ingredient("sandalwood", "샌달우드", "base", "#8a6a4f"),
    ]
    return Catalog({p.id: p for p in products}, {i.id: i for i in ingredients})
