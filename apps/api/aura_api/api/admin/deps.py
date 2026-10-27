"""Who may call /admin/**: an active account in `admins`, looked up on every request."""

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from aura_api.api.deps import Session
from aura_api.core.auth import JWTVerifier, get_jwt_verifier, require_authenticated_user
from aura_api.core.revocation import TokenRevocationStore, get_token_revocation_store
from aura_api.domain.errors import Forbidden, Unauthorized
from aura_api.infra.repositories import admin as repository


@dataclass(frozen=True)
class AdminActor:
    id: uuid.UUID
    name: str


async def current_admin(
    request: Request,
    session: Session,
    verifier: Annotated[JWTVerifier, Depends(get_jwt_verifier)],
    revocations: Annotated[TokenRevocationStore, Depends(get_token_revocation_store)],
) -> AdminActor:
    """Missing, bad or revoked token → 401. A customer's token → 403.

    The admin token's `sub` is the admin ID; how admin tokens are issued is decided with the
    JWT login work, and only this function needs to change if that differs.
    """
    user = await require_authenticated_user(request, verifier, revocations)
    try:
        subject = uuid.UUID(user.user_id)
    except ValueError:
        raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.") from None
    admin = await repository.active_admin(session, subject)
    actor = AdminActor(admin.id, admin.name) if admin is not None else None
    customer = actor is None and await repository.is_customer(session, subject)
    # End the read so the service can open its own transaction on this session.
    await session.rollback()
    if actor is not None:
        return actor
    if customer:
        raise Forbidden("ADMIN_REQUIRED", "관리자 권한이 필요해요.")
    raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")


CurrentAdmin = Annotated[AdminActor, Depends(current_admin)]
