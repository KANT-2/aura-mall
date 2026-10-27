from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from aura_api.domain.identity import Registration
from aura_api.identity.tokens import IssuedTokens, UserRecord

TokenIssuer = Callable[[UUID, UUID], IssuedTokens]


class AuthStorageUnavailable(RuntimeError):
    """A storage operation did not complete; never report authentication success."""


class AuthRepository(Protocol):
    async def find_user(self, email: str) -> UserRecord | None: ...

    async def create_token_family(self, tokens: IssuedTokens) -> bool: ...

    async def register(
        self, registration: Registration, password_hash: str, tokens: IssuedTokens
    ) -> bool: ...

    async def profile(self, user_id: UUID) -> dict | None: ...

    async def rotate(self, token_hash: str, issue: TokenIssuer) -> IssuedTokens | None: ...

    async def logout(self, user_id: UUID, jti: UUID) -> bool: ...

    async def is_revoked(self, *, issuer: str, jti: str) -> bool: ...


class UnavailableAuthRepository:
    async def find_user(self, email):
        raise AuthStorageUnavailable()

    async def create_token_family(self, tokens):
        raise AuthStorageUnavailable()

    async def register(self, registration, password_hash, tokens):
        raise AuthStorageUnavailable()

    async def profile(self, user_id):
        raise AuthStorageUnavailable()

    async def rotate(self, token_hash, issue):
        raise AuthStorageUnavailable()

    async def logout(self, user_id, jti):
        raise AuthStorageUnavailable()

    async def is_revoked(self, *, issuer, jti):
        raise AuthStorageUnavailable()
