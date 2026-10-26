import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from aura_api.core.auth import CurrentUser
from aura_api.identity.repository import AuthStorageUnavailable
from aura_api.identity.service import AuthenticationRejected, AuthLifecycleService
from aura_api.identity.tokens import IssuedTokens

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    email: str = Field(min_length=1, max_length=254)
    password: SecretStr = Field(min_length=1, max_length=256)

    @field_validator("password")
    @classmethod
    def validate_password_encoding(cls, value: SecretStr) -> SecretStr:
        try:
            value.get_secret_value().encode("utf-8")
        except UnicodeEncodeError:
            raise ValueError("Invalid login input") from None
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        # Match identity domain normalization; share its helper after branch synchronization.
        value = value.strip().lower()
        if not re.fullmatch(r"\S+@\S+\.\S+", value):
            raise ValueError("Invalid login input")
        return value


class RefreshInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    refresh_token: SecretStr = Field(alias="refreshToken", min_length=1, max_length=512)


class TokenResponse(BaseModel):
    accessToken: str = Field(repr=False)
    refreshToken: str = Field(repr=False)
    tokenType: str = "Bearer"
    expiresIn: int
    refreshExpiresIn: int


def token_response(tokens: IssuedTokens) -> TokenResponse:
    return TokenResponse(
        accessToken=tokens.access_token,
        refreshToken=tokens.refresh_token,
        expiresIn=int((tokens.access_expires_at - tokens.issued_at).total_seconds()),
        refreshExpiresIn=int((tokens.refresh_expires_at - tokens.issued_at).total_seconds()),
    )


def get_auth_service(request: Request) -> AuthLifecycleService:
    return request.app.state.auth_service


Service = Annotated[AuthLifecycleService, Depends(get_auth_service)]


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginInput, service: Service):
    try:
        return token_response(await service.login(body.email, body.password.get_secret_value()))
    except AuthenticationRejected:
        raise HTTPException(401, headers={"WWW-Authenticate": "Bearer"}) from None
    except AuthStorageUnavailable:
        raise HTTPException(503) from None


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshInput, service: Service):
    try:
        return token_response(await service.refresh(body.refresh_token.get_secret_value()))
    except AuthenticationRejected:
        raise HTTPException(401, headers={"WWW-Authenticate": "Bearer"}) from None
    except AuthStorageUnavailable:
        raise HTTPException(503) from None


@router.post("/logout", status_code=204)
async def logout(request: Request, user: CurrentUser, service: Service):
    # CurrentUser already validated the single Bearer header and revocation status.
    token = request.headers["authorization"].partition(" ")[2]
    claims = request.app.state.jwt_verifier.decode_claims(token)
    if claims is None:
        raise HTTPException(401, headers={"WWW-Authenticate": "Bearer"})
    try:
        await service.logout(user.user_id, claims["jti"])
    except AuthenticationRejected:
        raise HTTPException(401, headers={"WWW-Authenticate": "Bearer"}) from None
    except AuthStorageUnavailable:
        raise HTTPException(503) from None
    return Response(status_code=204)
