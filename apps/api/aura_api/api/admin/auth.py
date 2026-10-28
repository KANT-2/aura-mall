"""Admin login, logout, session and registration. Separate from the member /auth routes."""

import uuid
from typing import Any

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from aura_api.api.admin.deps import CurrentAdmin
from aura_api.api.auth import ChangePasswordInput, LoginInput
from aura_api.api.catalog import CamelModel
from aura_api.api.deps import Session
from aura_api.core.errors import ErrorResponse
from aura_api.services import admin_auth as service

router = APIRouter()
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 403, 409)}


class AdminAccountOut(CamelModel):
    id: uuid.UUID
    email: str
    name: str


class AdminTokenOut(CamelModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    admin: AdminAccountOut


class AdminCreateIn(BaseModel):
    model_config = ConfigDict(json_schema_extra={"required": ["name", "email", "password"]})
    # Name, email and password follow the member registration rules (domain/identity.py).
    email: Any = Field(default=None, json_schema_extra={"type": "string", "maxLength": 254})
    name: Any = Field(default=None, json_schema_extra={"type": "string", "maxLength": 100})
    password: Any = Field(
        default=None,
        repr=False,
        json_schema_extra={
            "type": "string",
            "format": "password",
            "writeOnly": True,
            "minLength": 8,
            "maxLength": 256,
        },
    )


@router.post(
    "/auth/login", response_model=AdminTokenOut, responses=ERRORS, summary="관리자 JWT 로그인"
)
async def login(body: LoginInput, request: Request, session: Session) -> AdminTokenOut:
    result = await service.login(
        session,
        request.app.state.auth_service.settings,
        body.email,
        body.password.get_secret_value(),
    )
    access, admin = result.access, result.admin
    return AdminTokenOut(
        access_token=access.access_token,
        expires_in=int((access.expires_at - access.issued_at).total_seconds()),
        admin=AdminAccountOut(id=admin.id, email=admin.email, name=admin.name),
    )


@router.post("/auth/logout", status_code=204, responses=ERRORS, summary="관리자 JWT 폐기")
async def logout(admin: CurrentAdmin, session: Session) -> Response:
    await service.logout(session, admin.id, admin.jti)
    return Response(status_code=204)


@router.get(
    "/session", response_model=AdminAccountOut, responses=ERRORS, summary="관리자 JWT 프로필 조회"
)
async def current_session(admin: CurrentAdmin) -> AdminAccountOut:
    return AdminAccountOut(id=admin.id, email=admin.email, name=admin.name)


@router.post(
    "/admins",
    status_code=201,
    response_model=AdminAccountOut,
    responses=ERRORS,
    summary="관리자 계정 등록",
)
async def create_admin(
    body: AdminCreateIn, admin: CurrentAdmin, session: Session
) -> AdminAccountOut:
    created = await service.register(session, admin.id, body.model_dump())
    return AdminAccountOut(id=created.id, email=created.email, name=created.name)


@router.post("/auth/change-password", status_code=204, responses=ERRORS)
async def change_password(
    body: ChangePasswordInput, admin: CurrentAdmin, session: Session
) -> Response:
    await service.change_password(
        session,
        admin.id,
        body.current_password.get_secret_value(),
        body.new_password.get_secret_value(),
    )
    return Response(status_code=204)
