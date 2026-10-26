import re
import secrets
from uuid import UUID, uuid4

from anyio.to_thread import run_sync
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from aura_api.config import Settings
from aura_api.identity.repository import AuthRepository, AuthStorageUnavailable
from aura_api.identity.tokens import IssuedTokens, hash_refresh_token, issue_tokens

PASSWORD_HASHER = PasswordHasher()
# A timing substitute for nonexistent accounts, not a usable account or password.
DUMMY_HASH = PASSWORD_HASHER.hash(secrets.token_urlsafe(48))


def check_password(stored_hash: str | None, password: str) -> bool:
    supported = stored_hash is not None and stored_hash.startswith("$argon2id$")
    try:
        valid = PASSWORD_HASHER.verify(stored_hash if supported else DUMMY_HASH, password)
        return supported and valid
    except (VerificationError, InvalidHashError, UnicodeEncodeError):
        return False


class AuthenticationRejected(Exception):
    pass


class AuthLifecycleService:
    def __init__(self, settings: Settings, repository: AuthRepository):
        self.settings = settings
        self.repository = repository

    def _issue(self, user_id: UUID, family_id: UUID) -> IssuedTokens:
        return issue_tokens(self.settings, user_id, family_id)

    def _require_configured(self):
        if self.settings.jwt_signing_key is None:
            raise AuthStorageUnavailable()

    async def login(self, email: str, password: str) -> IssuedTokens:
        self._require_configured()
        user = await self.repository.find_user(email.strip().lower())
        valid = await run_sync(check_password, user.password_hash if user else None, password)
        if not valid or user is None or user.is_active is not True:
            raise AuthenticationRejected()
        tokens = self._issue(user.id, uuid4())
        # Recheck active status inside the persistence transaction.
        if not await self.repository.create_session(tokens):
            raise AuthenticationRejected()
        return tokens

    async def refresh(self, token: str) -> IssuedTokens:
        self._require_configured()
        if not re.fullmatch(r"r1_[A-Za-z0-9_-]{64}", token):
            raise AuthenticationRejected()
        tokens = await self.repository.rotate(hash_refresh_token(token), self._issue)
        # Repository returns only after commit, including replay-family revocation commits.
        if tokens is None:
            raise AuthenticationRejected()
        return tokens

    async def logout(self, user_id: str, jti: str):
        try:
            user_uuid, token_uuid = UUID(user_id), UUID(jti)
        except ValueError:
            raise AuthenticationRejected() from None
        if not await self.repository.logout(user_uuid, token_uuid):
            raise AuthenticationRejected()
