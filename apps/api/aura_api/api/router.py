from fastapi import APIRouter

from aura_api.api.catalog import router as catalog_router
from aura_api.api.health import router as health_router

router = APIRouter()
router.include_router(health_router)
router.include_router(catalog_router)
