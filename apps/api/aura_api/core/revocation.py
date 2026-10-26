from typing import Protocol


class TokenRevocationStore(Protocol):
    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        """Return True if revoked, False only after a successful authoritative lookup."""
        ...


class RevocationLookupUnavailable(RuntimeError):
    """Revocation status could not be established; authentication must be denied."""


class UnavailableRevocationStore:
    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        raise RevocationLookupUnavailable("Token revocation store is not connected")


def get_token_revocation_store() -> TokenRevocationStore:
    # No database adapter exists yet. Never default to an empty/allow-all blacklist.
    return UnavailableRevocationStore()
