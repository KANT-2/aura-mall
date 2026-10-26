from dataclasses import dataclass, field
from typing import Annotated, Protocol

from fastapi import Depends, HTTPException, Request


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    """Server-verified identity and permissions; never contains a session secret."""

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


class SessionVerifier(Protocol):
    async def verify_session(self, session_token: str) -> AuthenticatedUser | None:
        """Return identity only after validating a live session; invalid sessions return None."""
        ...


class RejectAllSessions:
    async def verify_session(self, session_token: str) -> None:
        return None


def get_session_verifier() -> SessionVerifier:
    # No real session store exists yet. Tests override this provider on their own app.
    return RejectAllSessions()


async def require_authenticated_user(
    request: Request,
    verifier: Annotated[SessionVerifier, Depends(get_session_verifier)],
) -> AuthenticatedUser:
    cookie_name = request.app.state.auth_session_cookie
    # Reject ambiguous duplicate session cookies rather than choosing first/last.
    matching = [
        part
        for header in request.headers.getlist("cookie")
        for part in header.split(";")
        if part.partition("=")[0].strip() == cookie_name
    ]
    token = request.cookies.get(cookie_name) if len(matching) == 1 else None
    if not token:
        raise HTTPException(status_code=401)
    user = await verifier.verify_session(token)
    if user is None:
        raise HTTPException(status_code=401)
    if not isinstance(user, AuthenticatedUser):
        # An invalid adapter result is a server integration error, never an identity.
        raise TypeError("Invalid session verifier result")
    return user


CurrentUser = Annotated[AuthenticatedUser, Depends(require_authenticated_user)]
