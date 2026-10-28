import re
from dataclasses import dataclass, field
from math import isfinite
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request

from aura_api.config import Settings
from aura_api.core.revocation import TokenRevocationStore, get_token_revocation_store


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    """Server-verified identity and permissions; never contains a token or key."""

    user_id: str
    permissions: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        if not isinstance(self.user_id, str) or not self.user_id.strip():
            raise ValueError("A verified user ID is required")
        if not isinstance(self.permissions, frozenset) or any(
            not isinstance(permission, str) or not permission.strip()
            for permission in self.permissions
        ):
            raise ValueError("Permissions must be a frozenset of nonempty strings")


class JWTVerifier:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def decode_claims(self, token: str) -> dict | None:
        settings = self._settings
        if settings.jwt_signing_key is None:
            return None
        if len(token) > 8192 or not re.fullmatch(
            r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token
        ):
            return None
        try:
            # Never select an algorithm/key from the unverified token header.
            claims = jwt.decode(
                token,
                settings.jwt_signing_key.get_secret_value(),
                algorithms=[settings.jwt_algorithm],
                issuer=settings.jwt_issuer,
                audience=settings.jwt_audience,
                options={"require": ["exp", "iss", "aud", "sub", "jti", "iat"], "strict_aud": True},
            )
            # Only inspect identity/permissions after signature and registered-claim validation.
            for name in ("exp", "iat", "nbf"):
                if name in claims and (
                    type(claims[name]) not in (int, float) or not isfinite(claims[name])
                ):
                    return None
            subject = claims["sub"]
            if not isinstance(subject, str) or not subject.strip():
                return None
            jti = claims["jti"]
            if not isinstance(jti, str) or not jti.strip():
                return None
            if claims["iat"] < 0 or claims["exp"] <= claims["iat"]:
                return None
            permissions = claims.get("permissions", [])
            if not isinstance(permissions, list) or any(
                not isinstance(item, str) or not item.strip() for item in permissions
            ):
                return None
            return claims
        except (jwt.InvalidTokenError, ValueError, TypeError, OverflowError):
            return None

    async def verify_token(
        self, token: str, revocations: TokenRevocationStore
    ) -> AuthenticatedUser | None:
        claims = self.decode_claims(token)
        if claims is None:
            return None
        try:
            # Only verified claims reach the store. Do not cache or log token material.
            revoked = await revocations.is_revoked(issuer=claims["iss"], jti=claims["jti"])
        except Exception:
            # Storage outages, timeouts, and integration errors must never allow a token.
            return None
        if revoked is not False:
            return None
        return AuthenticatedUser(claims["sub"], frozenset(claims.get("permissions", [])))


def get_jwt_verifier(request: Request) -> JWTVerifier:
    return request.app.state.jwt_verifier


async def require_authenticated_user(
    request: Request,
    verifier: Annotated[JWTVerifier, Depends(get_jwt_verifier)],
    revocations: Annotated[TokenRevocationStore, Depends(get_token_revocation_store)],
) -> AuthenticatedUser:
    values = request.headers.getlist("authorization")
    scheme, separator, token = values[0].partition(" ") if len(values) == 1 else ("", "", "")
    if scheme.lower() != "bearer" or not separator or not token:
        raise HTTPException(status_code=401, headers={"WWW-Authenticate": "Bearer"})
    user = await verifier.verify_token(token, revocations)
    if user is None:
        raise HTTPException(status_code=401, headers={"WWW-Authenticate": "Bearer"})
    return user


CurrentUser = Annotated[AuthenticatedUser, Depends(require_authenticated_user)]
