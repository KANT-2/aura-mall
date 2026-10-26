from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from aura_api.api.health import router as health_router
from aura_api.api.router import router as api_router
from aura_api.config import Settings
from aura_api.core.auth import JWTVerifier
from aura_api.core.csrf import CSRFMiddleware
from aura_api.core.exception_handlers import register_exception_handlers
from aura_api.core.middleware import RequestIDMiddleware
from aura_api.infra.database import create_engine, create_sessionmaker


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine = (
        create_engine(settings.database_url.get_secret_value()) if settings.database_url else None
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        if engine is not None:
            await engine.dispose()

    app = FastAPI(
        title=settings.app_name, version="0.1.0", redirect_slashes=False, lifespan=lifespan
    )
    app.state.sessionmaker = create_sessionmaker(engine) if engine is not None else None
    app.state.jwt_verifier = JWTVerifier(settings)
    app.add_middleware(
        CSRFMiddleware,
        allowed_origins=settings.csrf_allowed_origins,
        server_key=settings.bff_shared_key.get_secret_value() if settings.bff_shared_key else None,
    )
    app.add_middleware(RequestIDMiddleware)
    register_exception_handlers(app)
    app.include_router(health_router, include_in_schema=False)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
