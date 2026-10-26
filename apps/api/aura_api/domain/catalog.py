"""Catalog domain: the product and ingredient facts other rules depend on."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

GIFT_SET_TYPE = "gift-set"
# Custom compositions are sold as this product type only (50 mL eau de parfum).
CUSTOM_PRODUCT_TYPE = "eau-de-parfum"

Stage = Literal["top", "middle", "base"]


@dataclass(frozen=True)
class Product:
    id: str
    collection: str
    type: str
    name: str
    price: int | None  # None = 가격 확인 중 (never treat as 0)
    stock: int

    @property
    def is_gift_set(self) -> bool:
        return self.type == GIFT_SET_TYPE


@dataclass(frozen=True)
class Ingredient:
    id: str
    name: str
    stage: Stage
    color: str  # "#rrggbb"


@dataclass(frozen=True)
class Catalog:
    """Read-only snapshot of products and ingredients, keyed by their original string IDs."""

    products: Mapping[str, Product]
    ingredients: Mapping[str, Ingredient]

    def product(self, product_id: str) -> Product | None:
        return self.products.get(product_id)

    def custom_base_price(self) -> int | None:
        """Price of a custom composition: the first eau de parfum in catalog order."""
        for product in self.products.values():
            if product.type == CUSTOM_PRODUCT_TYPE:
                return product.price
        return None
