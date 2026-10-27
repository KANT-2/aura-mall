from typing import Protocol

from fastapi import Request


class TokenRevocationStore(Protocol):
    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        """Return True if revoked, False only after a successful authoritative lookup."""
        ...


class RevocationLookupUnavailable(RuntimeError):
    """Revocation status could not be established; authentication must be denied."""


class UnavailableRevocationStore:
    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        raise RevocationLookupUnavailable("Token revocation store is not connected")


def get_token_revocation_store(request: Request) -> TokenRevocationStore:
    return request.app.state.auth_repository
