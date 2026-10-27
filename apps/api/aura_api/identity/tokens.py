import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt

from aura_api.config import Settings


@dataclass(frozen=True)
class UserRecord:
    id: UUID
    password_hash: str = field(repr=False)
    is_active: bool


@dataclass(frozen=True)
class IssuedTokens:
    user_id: UUID
    family_id: UUID
    refresh_id: UUID
    jti: UUID
    issued_at: datetime
    access_expires_at: datetime
    refresh_expires_at: datetime
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    refresh_hash: str = field(repr=False)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(("aura-refresh-v1:" + token).encode()).hexdigest()


def issue_tokens(settings: Settings, user_id: UUID, family_id: UUID) -> IssuedTokens:
    if settings.jwt_signing_key is None:
        raise ValueError("JWT issuance is not configured")
    now = datetime.now(UTC).replace(microsecond=0)
    access_exp = now + timedelta(seconds=settings.jwt_access_ttl_seconds)
    refresh_exp = now + timedelta(seconds=settings.refresh_token_ttl_seconds)
    jti = uuid4()
    refresh = "r1_" + secrets.token_urlsafe(48)
    access = jwt.encode(
        {
            "sub": str(user_id),
            "jti": str(jti),
            "iat": int(now.timestamp()),
            "exp": int(access_exp.timestamp()),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        },
        settings.jwt_signing_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
    return IssuedTokens(
        user_id,
        family_id,
        uuid4(),
        jti,
        now,
        access_exp,
        refresh_exp,
        access,
        refresh,
        hash_refresh_token(refresh),
    )
