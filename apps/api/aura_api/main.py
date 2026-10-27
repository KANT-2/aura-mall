from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.engine import make_url

from aura_api.api.errors import register_domain_errors
from aura_api.api.health import router as health_router
from aura_api.api.router import router as api_router
from aura_api.config import Settings
from aura_api.core.auth import JWTVerifier
from aura_api.core.csrf import CSRFMiddleware
from aura_api.core.exception_handlers import register_exception_handlers
from aura_api.core.middleware import RequestIDMiddleware
from aura_api.identity.postgres import PostgresAuthRepository
from aura_api.identity.repository import UnavailableAuthRepository
from aura_api.identity.service import AuthLifecycleService
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.openapi import DESCRIPTION, ERROR_RESPONSES, TAGS, configure_openapi


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    database_url = (
        make_url(settings.database_url.get_secret_value()) if settings.database_url else None
    )
    engine = (
        create_engine(
            database_url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)
        )
        if database_url is not None
        else None
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            if engine is not None:
                await engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        redirect_slashes=False,
        lifespan=lifespan,
        description=DESCRIPTION,
        openapi_tags=TAGS,
        responses=ERROR_RESPONSES,
        swagger_ui_parameters={
            "persistAuthorization": False,
            "displayRequestDuration": True,
            "defaultModelsExpandDepth": 0,
        },
    )
    app.state.sessionmaker = create_sessionmaker(engine) if engine is not None else None
    app.state.jwt_verifier = JWTVerifier(settings)
    app.state.auth_repository = (
        PostgresAuthRepository(
            database_url.set(drivername="postgresql").render_as_string(hide_password=False),
            settings.jwt_issuer or "",
        )
        if database_url is not None
        else UnavailableAuthRepository()
    )
    app.state.auth_service = AuthLifecycleService(settings, app.state.auth_repository)
    app.add_middleware(
        CSRFMiddleware,
        allowed_origins=settings.csrf_allowed_origins,
        server_key=settings.bff_shared_key.get_secret_value() if settings.bff_shared_key else None,
    )
    app.add_middleware(RequestIDMiddleware)
    register_exception_handlers(app)
    register_domain_errors(app)
    app.include_router(health_router, include_in_schema=False)
    app.include_router(api_router, prefix=settings.api_prefix)
    configure_openapi(app, settings.api_prefix)
    return app


app = create_app()
