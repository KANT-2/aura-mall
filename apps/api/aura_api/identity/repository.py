from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Protocol
from uuid import UUID

from aura_api.domain.identity import Registration
from aura_api.identity.tokens import IssuedTokens, UserRecord

TokenIssuer = Callable[[UUID, UUID], IssuedTokens]

# Team policy (CRA-34 follow-up): deletion grace period and member login failure limits.
DELETION_GRACE = timedelta(days=30)
LOGIN_FAILURE_LIMIT = 3
LOGIN_LOCK = timedelta(minutes=10)


class AuthStorageUnavailable(RuntimeError):
    """A storage operation did not complete; never report authentication success."""


class AuthRepository(Protocol):
    async def find_user(self, email: str) -> UserRecord | None: ...

    async def find_user_by_id(self, user_id: UUID) -> UserRecord | None: ...

    async def create_token_family(
        self, tokens: IssuedTokens, *, expected_password_hash: str
    ) -> bool: ...

    async def restore_token_family(
        self,
        tokens: IssuedTokens,
        *,
        expected_password_hash: str,
        expected_deletion_requested_at: datetime,
    ) -> bool:
        """Cancel a pending deletion and save the new family in one transaction."""
        ...

    async def reserve_login_attempt(self, email_hash: str) -> int:
        """Count one attempt; return 0 when allowed, else seconds until the lock ends."""
        ...

    async def clear_login_failures(self, email_hash: str) -> None: ...

    async def change_password(
        self, user_id: UUID, *, expected_password_hash: str, new_password_hash: str
    ) -> bool | None:
        """True after commit; False for a stale hash; None for missing/inactive users."""
        ...

    async def register(
        self, registration: Registration, password_hash: str, tokens: IssuedTokens
    ) -> bool: ...

    async def deactivate(self, user_id: UUID, *, expected_password_hash: str) -> bool | None:
        """True after commit; False for a stale hash; None for missing/inactive users."""
        ...

    async def profile(self, user_id: UUID) -> dict | None: ...

    async def update_profile(
        self, user_id: UUID, *, name: str | None = None, marketing: bool | None = None
    ) -> dict | None: ...

    async def rotate(self, token_hash: str, issue: TokenIssuer) -> IssuedTokens | None: ...

    async def logout(self, user_id: UUID, jti: UUID) -> bool: ...

    async def is_revoked(self, *, issuer: str, jti: str) -> bool: ...


class UnavailableAuthRepository:
    async def find_user(self, email):
        raise AuthStorageUnavailable()

    async def find_user_by_id(self, user_id):
        raise AuthStorageUnavailable()

    async def create_token_family(self, tokens, *, expected_password_hash):
        raise AuthStorageUnavailable()

    async def restore_token_family(
        self, tokens, *, expected_password_hash, expected_deletion_requested_at
    ):
        raise AuthStorageUnavailable()

    async def reserve_login_attempt(self, email_hash):
        raise AuthStorageUnavailable()

    async def clear_login_failures(self, email_hash):
        raise AuthStorageUnavailable()

    async def change_password(self, user_id, *, expected_password_hash, new_password_hash):
        raise AuthStorageUnavailable()

    async def register(self, registration, password_hash, tokens):
        raise AuthStorageUnavailable()

    async def deactivate(self, user_id, *, expected_password_hash):
        raise AuthStorageUnavailable()

    async def profile(self, user_id):
        raise AuthStorageUnavailable()

    async def update_profile(self, user_id, *, name=None, marketing=None):
        raise AuthStorageUnavailable()

    async def rotate(self, token_hash, issue):
        raise AuthStorageUnavailable()

    async def logout(self, user_id, jti):
        raise AuthStorageUnavailable()

    async def is_revoked(self, *, issuer, jti):
        raise AuthStorageUnavailable()
