from collections.abc import Awaitable, Callable

from fastapi import HTTPException

from aura_api.core.auth import AuthenticatedUser, CurrentUser


def require_permissions(*permissions: str) -> Callable[..., Awaitable[AuthenticatedUser]]:
    """Require every named permission; role assignment belongs to the session adapter."""
    if not permissions or any(
        not isinstance(item, str) or not item.strip() for item in permissions
    ):
        raise ValueError("At least one nonempty permission is required")
    required = frozenset(permissions)

    async def check_permissions(user: CurrentUser) -> AuthenticatedUser:
        if not required.issubset(user.permissions):
            raise HTTPException(status_code=403)
        return user

    return check_permissions


def ensure_resource_owner(user: AuthenticatedUser, owner_user_id: str) -> None:
    """Compare with the owner loaded by trusted server code, not a client-supplied ID."""
    if user.user_id != owner_user_id:
        raise HTTPException(status_code=403)
