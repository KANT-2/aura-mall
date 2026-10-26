"""Catalog use cases: the whole catalog and single-product lookup."""

from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.domain.errors import NotFound
from aura_api.infra.models import Product
from aura_api.infra.repositories import catalog as repository
from aura_api.infra.repositories.catalog import CatalogRows

# Product IDs used by earlier web builds; kept so old links still open (same as the Mock).
LEGACY_PRODUCT_IDS = {
    "bergamot-veil": "fresh-eau-de-parfum",
    "petal-haze": "soft-eau-de-parfum",
    "cedar-trace": "warm-eau-de-parfum",
    "soft-skin": "soft-eau-de-parfum",
    "fig-reverie": "soft-eau-de-parfum",
    "amber-dusk": "warm-eau-de-parfum",
}


async def get_catalog(session: AsyncSession) -> CatalogRows:
    return await repository.load_catalog(session)


async def get_product(session: AsyncSession, product_id: str) -> tuple[Product, str]:
    found = await repository.find_product(session, LEGACY_PRODUCT_IDS.get(product_id, product_id))
    if found is None:
        raise NotFound("PRODUCT_NOT_FOUND", "상품을 찾을 수 없어요.")
    return found
