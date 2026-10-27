from fastapi import APIRouter

from aura_api.api.admin import router as admin_router
from aura_api.api.auth import router as auth_router
from aura_api.api.catalog import router as catalog_router
from aura_api.api.drafts import router as drafts_router
from aura_api.api.health import router as health_router
from aura_api.api.orders import router as orders_router
from aura_api.api.partner import router as partner_router
from aura_api.api.payments import router as payments_router
from aura_api.api.recipes import router as recipes_router

router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(catalog_router)
router.include_router(partner_router)
router.include_router(recipes_router)
router.include_router(drafts_router)
router.include_router(orders_router)
router.include_router(payments_router)
router.include_router(admin_router)
