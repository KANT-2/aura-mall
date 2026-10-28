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
    # Deletion request time; restorable is computed with the DB clock (grace period, not purged).
    deletion_requested_at: datetime | None = None
    restorable: bool = False


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


def hash_login_email(email: str) -> str:
    """Key for login failure limits; callers pass the normalized (lower-cased) email."""
    return hashlib.sha256(("aura-login-v1:" + email).encode()).hexdigest()


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


ADMIN_PERMISSION = "admin"
ADMIN_PRINCIPAL = "admin"


@dataclass(frozen=True)
class AdminAccess:
    """An admin access token. Admins get no refresh token; the jti is recorded instead."""

    admin_id: UUID
    jti: UUID
    issued_at: datetime
    expires_at: datetime
    access_token: str = field(repr=False)


def issue_admin_access(settings: Settings, admin_id: UUID) -> AdminAccess:
    """Same signer and registered claims as member tokens, plus the admin markers.

    `principal_type` and `permissions` both say "admin" so member routes can refuse it.
    """
    if settings.jwt_signing_key is None:
        raise ValueError("JWT issuance is not configured")
    now = datetime.now(UTC).replace(microsecond=0)
    expires = now + timedelta(seconds=settings.admin_access_ttl_seconds)
    jti = uuid4()
    token = jwt.encode(
        {
            "sub": str(admin_id),
            "jti": str(jti),
            "iat": int(now.timestamp()),
            "exp": int(expires.timestamp()),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "principal_type": ADMIN_PRINCIPAL,
            "permissions": [ADMIN_PERMISSION],
        },
        settings.jwt_signing_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
    return AdminAccess(admin_id, jti, now, expires, token)
