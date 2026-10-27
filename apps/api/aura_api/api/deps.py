"""Request dependencies shared by business routes: DB session and the signed-in member."""

import uuid
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.core.auth import JWTVerifier, get_jwt_verifier, require_authenticated_user
from aura_api.core.revocation import TokenRevocationStore, get_token_revocation_store
from aura_api.domain.errors import Unauthorized
from aura_api.domain.identity import RequestOwner
from aura_api.identity.tokens import ADMIN_PERMISSION
from aura_api.infra.database import get_session
from aura_api.infra.repositories import users

Session = Annotated[AsyncSession, Depends(get_session)]


def bearer_claims(request: Request, verifier: JWTVerifier) -> dict | None:
    """Claims of the request's single Bearer token, after require_authenticated_user passed."""
    values = request.headers.getlist("authorization")
    if len(values) != 1:
        return None
    return verifier.decode_claims(values[0].partition(" ")[2])


async def optional_member(
    request: Request,
    session: Session,
    verifier: Annotated[JWTVerifier, Depends(get_jwt_verifier)],
    revocations: Annotated[TokenRevocationStore, Depends(get_token_revocation_store)],
) -> uuid.UUID | None:
    """The member behind a verified token, or None for no token or an anonymous visitor.

    A bad, expired or revoked token is still 401 (the BFF then clears the cookie).
    """
    if not request.headers.getlist("authorization"):
        return None
    user = await require_authenticated_user(request, verifier, revocations)
    claims = bearer_claims(request, verifier) or {}
    permissions = claims.get("permissions")
    if claims.get("principal_type") not in (None, "member") or (
        isinstance(permissions, list) and ADMIN_PERMISSION in permissions
    ):
        # An admin token never acts as a member, even if its subject also exists in users.
        raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
    try:
        member_id = uuid.UUID(user.user_id)
    except ValueError:
        return None
    exists = await users.member_exists(session, member_id)
    # End the read so the service can open its own transaction on this session.
    await session.rollback()
    if not exists:
        return None
    RequestOwner(guest_id="", user_id=str(member_id)).ensure_expected(
        request.headers.get("x-account-owner")
    )
    return member_id


OptionalMember = Annotated[uuid.UUID | None, Depends(optional_member)]


def member_required(message: str):
    """Dependency for member-only routes; anonymous visitors get 401 with `message`."""

    async def require(member_id: OptionalMember) -> uuid.UUID:
        if member_id is None:
            raise Unauthorized("LOGIN_REQUIRED", message)
        return member_id

    return require
