from fastapi import APIRouter

from aura_api.api.auth import router as auth_router
from aura_api.api.health import router as health_router

router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router)
