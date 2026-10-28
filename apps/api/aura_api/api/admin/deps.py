"""Who may call /admin/**: an admin token whose session and account are both active."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request

from aura_api.api.deps import Session, bearer_claims
from aura_api.core.auth import JWTVerifier, get_jwt_verifier, require_authenticated_user
from aura_api.core.revocation import TokenRevocationStore, get_token_revocation_store
from aura_api.domain.errors import Forbidden, Unauthorized
from aura_api.identity.tokens import ADMIN_PERMISSION, ADMIN_PRINCIPAL
from aura_api.infra.repositories import admin as repository


@dataclass(frozen=True)
class AdminActor:
    id: uuid.UUID
    name: str
    email: str
    jti: uuid.UUID


def is_admin_token(claims: dict) -> bool:
    permissions = claims.get("permissions")
    return claims.get("principal_type") == ADMIN_PRINCIPAL and (
        isinstance(permissions, list) and ADMIN_PERMISSION in permissions
    )


def _uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(value) if isinstance(value, str) else None
    except ValueError:
        return None


async def current_admin(
    request: Request,
    session: Session,
    verifier: Annotated[JWTVerifier, Depends(get_jwt_verifier)],
    revocations: Annotated[TokenRevocationStore, Depends(get_token_revocation_store)],
) -> AdminActor:
    """Missing, bad, expired, revoked or logged-out token → 401. A customer's token → 403.

    The revocation store already checks the admin session (not expired, not revoked, admin
    active); here the session must also belong to the token's subject.
    """
    user = await require_authenticated_user(request, verifier, revocations)
    claims = bearer_claims(request, verifier) or {}
    subject, jti = _uuid(user.user_id), _uuid(claims.get("jti"))
    if subject is None:
        raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
    actor = None
    customer = False
    if is_admin_token(claims) and jti is not None:
        row = await repository.admin_session(session, jti)
        admin = await repository.active_admin(session, subject)
        if (
            row is not None
            and row.admin_id == subject
            and admin is not None
            and row.revoked_at is None
            and row.expires_at > datetime.now(UTC)
        ):
            actor = AdminActor(admin.id, admin.name, admin.email, jti)
    else:
        customer = await repository.is_customer(session, subject)
    # End the read so the service can open its own transaction on this session.
    await session.rollback()
    if actor is not None:
        return actor
    if customer:
        raise Forbidden("ADMIN_REQUIRED", "관리자 권한이 필요해요.")
    raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")


CurrentAdmin = Annotated[AdminActor, Depends(current_admin)]
