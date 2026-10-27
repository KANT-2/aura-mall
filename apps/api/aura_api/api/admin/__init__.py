"""Admin API (/admin/**): operators manage products, stock, orders and partner inquiries."""

from fastapi import APIRouter

from aura_api.api.admin.auth import router as auth_router
from aura_api.api.admin.operations import router as operations_router
from aura_api.api.admin.products import router as products_router

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(auth_router)
router.include_router(products_router)
router.include_router(operations_router)
