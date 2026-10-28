"""Admin authentication: login (access token only), logout and registering another admin.

Uses the member JWT signer and password hasher (identity/), but admin accounts, sessions
and permission checks stay separate from members.
"""

import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from anyio.to_thread import run_sync
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.config import Settings
from aura_api.domain.errors import Conflict, Unauthorized
from aura_api.domain.identity import validate_registration
from aura_api.identity.service import PASSWORD_HASHER, check_password
from aura_api.identity.tokens import AdminAccess, issue_admin_access
from aura_api.infra.models import Admin
from aura_api.infra.repositories import admin as repository

LOGIN_FAILED = "이메일 또는 비밀번호를 확인해 주세요."


@dataclass(frozen=True)
class AdminLogin:
    access: AdminAccess
    admin: Admin


async def login(session: AsyncSession, settings: Settings, email: str, password: str) -> AdminLogin:
    """Wrong email, wrong password and disabled account all look the same (401)."""
    if settings.jwt_signing_key is None:
        raise Unauthorized("LOGIN_UNAVAILABLE", LOGIN_FAILED)
    async with session.begin():
        admin = await repository.admin_by_email(session, email.strip().lower())
        # Verify even for unknown emails so timing does not reveal which accounts exist.
        valid = await run_sync(check_password, admin.password_hash if admin else None, password)
        if not valid or admin is None or admin.status != "active":
            raise Unauthorized("LOGIN_FAILED", LOGIN_FAILED)
        access = issue_admin_access(settings, admin.id)
        repository.add_admin_session(
            session,
            jti=access.jti,
            admin_id=admin.id,
            issued_at=access.issued_at,
            expires_at=access.expires_at,
        )
        admin.last_login_at = datetime.now(UTC)
        await session.flush()
        return AdminLogin(access, admin)


async def logout(session: AsyncSession, admin_id: uuid.UUID, jti: uuid.UUID) -> None:
    async with session.begin():
        row = await repository.admin_session(session, jti)
        if row is None or row.admin_id != admin_id:
            raise Unauthorized("LOGIN_REQUIRED", "로그인이 필요해요.")
        await repository.revoke_admin_session(session, row)


async def register(session: AsyncSession, actor_id: uuid.UUID, raw: Mapping[str, Any]) -> Admin:
    """Only a signed-in admin adds admins; the first one comes from the CLI command."""
    data = validate_registration(raw.get("name"), raw.get("email"), raw.get("password"))
    password_hash = await run_sync(PASSWORD_HASHER.hash, data.password)
    try:
        async with session.begin():
            if await repository.admin_by_email(session, data.email) is not None:
                raise _email_taken()
            admin = await repository.add_admin(
                session,
                email=data.email,
                name=data.name,
                password_hash=password_hash,
                created_by=actor_id,
            )
            repository.add_audit(
                session,
                actor_id=actor_id,
                action="admin.create",
                target_type="admin",
                target_id=str(admin.id),
                changes=[{"field": "email", "from": None, "to": admin.email}],
            )
            await session.flush()
            return admin
    except IntegrityError as error:
        # Two requests for the same email at the same moment.
        raise _email_taken() from error


def _email_taken() -> Conflict:
    return Conflict("ADMIN_EMAIL_TAKEN", "이미 등록된 관리자 이메일이에요.")


async def change_password(session: AsyncSession, actor: uuid.UUID, current: str, new: str) -> None:
    from sqlalchemy import select

    from aura_api.infra.models import AdminSession

    async with session.begin():
        admin = await session.scalar(
            select(Admin).where(Admin.id == actor, Admin.status == "active").with_for_update()
        )
        if admin is None or not await run_sync(check_password, admin.password_hash, current):
            raise Unauthorized("PASSWORD_MISMATCH", "현재 비밀번호를 확인해 주세요.")
        admin.password_hash = await run_sync(PASSWORD_HASHER.hash, new)
        sessions = list(
            await session.scalars(
                select(AdminSession).where(
                    AdminSession.admin_id == actor, AdminSession.revoked_at.is_(None)
                )
            )
        )
        for row in sessions:
            await repository.revoke_admin_session(session, row)
