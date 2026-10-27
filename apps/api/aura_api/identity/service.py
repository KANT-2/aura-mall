import re
import secrets
from uuid import UUID, uuid4

from anyio.to_thread import run_sync
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from aura_api.config import Settings
from aura_api.domain.errors import Conflict, InvalidInput, RateLimited
from aura_api.domain.identity import PASSWORD_MAX, PASSWORD_MIN, Registration, validate_name
from aura_api.identity.repository import AuthRepository, AuthStorageUnavailable
from aura_api.identity.tokens import (
    IssuedTokens,
    hash_login_email,
    hash_refresh_token,
    issue_tokens,
)

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
        email = email.strip().lower()
        email_hash = hash_login_email(email)
        # Unknown emails are limited the same way, so the lock never reveals an account.
        wait = await self.repository.reserve_login_attempt(email_hash)
        if wait > 0:
            raise RateLimited(
                "LOGIN_LOCKED", "로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.", wait
            )
        user = await self.repository.find_user(email)
        valid = await run_sync(check_password, user.password_hash if user else None, password)
        if not valid or user is None or user.is_active is not True:
            raise AuthenticationRejected()
        await self.repository.clear_login_failures(email_hash)
        tokens = self._issue(user.id, uuid4())
        # Recheck credentials under the user lock, not just before Argon2 verification.
        saved = await self.repository.create_token_family(
            tokens, expected_password_hash=user.password_hash
        )
        if not saved:
            raise AuthenticationRejected()
        return tokens

    async def register(self, registration: Registration) -> IssuedTokens:
        self._require_configured()
        password_hash = await run_sync(PASSWORD_HASHER.hash, registration.password)
        tokens = self._issue(uuid4(), uuid4())
        if not await self.repository.register(registration, password_hash, tokens):
            raise Conflict("EMAIL_EXISTS", "이미 가입된 이메일입니다.")
        return tokens

    async def me(self, user_id: str) -> dict:
        try:
            user_uuid = UUID(user_id)
        except ValueError:
            raise AuthenticationRejected() from None
        profile = await self.repository.profile(user_uuid)
        if profile is None:
            raise AuthenticationRejected()
        return profile

    async def update_profile(
        self, user_id: str, *, name: str | None = None, marketing: bool | None = None
    ) -> dict:
        if name is None and marketing is None:
            raise InvalidInput("PROFILE_INVALID", "수정할 정보를 입력해 주세요.")
        if name is not None:
            name = validate_name(name)
            try:
                name.encode("utf-8")
            except UnicodeEncodeError:
                raise InvalidInput("NAME_INVALID", "이름을 입력해 주세요.") from None
            if "\x00" in name:
                raise InvalidInput("NAME_INVALID", "이름을 입력해 주세요.")
        if marketing is not None and type(marketing) is not bool:
            raise InvalidInput("PROFILE_INVALID", "마케팅 동의 값을 확인해 주세요.")
        try:
            user_uuid = UUID(user_id)
        except ValueError:
            raise AuthenticationRejected() from None
        profile = await self.repository.update_profile(user_uuid, name=name, marketing=marketing)
        if profile is None:
            raise AuthenticationRejected()
        return profile

    async def change_password(self, user_id: str, current_password: str, new_password: str):
        # Direct service callers receive the same length/encoding protection as the API.
        if (
            not isinstance(current_password, str)
            or not 1 <= len(current_password) <= PASSWORD_MAX
            or not isinstance(new_password, str)
            or not PASSWORD_MIN <= len(new_password) <= PASSWORD_MAX
        ):
            raise InvalidInput("PASSWORD_INVALID", "비밀번호 입력을 확인해 주세요.")
        try:
            current_password.encode("utf-8")
            new_password.encode("utf-8")
        except UnicodeEncodeError:
            raise InvalidInput("PASSWORD_INVALID", "비밀번호 입력을 확인해 주세요.") from None
        try:
            user_uuid = UUID(user_id)
        except ValueError:
            raise AuthenticationRejected() from None
        user = await self.repository.find_user_by_id(user_uuid)
        if user is None or user.is_active is not True:
            raise AuthenticationRejected()
        if not await run_sync(check_password, user.password_hash, current_password):
            raise InvalidInput("CURRENT_PASSWORD_INVALID", "현재 비밀번호를 확인해 주세요.")
        new_hash = await run_sync(PASSWORD_HASHER.hash, new_password)
        result = await self.repository.change_password(
            user_uuid, expected_password_hash=user.password_hash, new_password_hash=new_hash
        )
        if result is None:
            raise AuthenticationRejected()
        if result is not True:
            raise InvalidInput("CURRENT_PASSWORD_INVALID", "현재 비밀번호를 확인해 주세요.")

    async def deactivate(self, user_id: str, current_password: str):
        if not isinstance(current_password, str) or not 1 <= len(current_password) <= PASSWORD_MAX:
            raise InvalidInput("PASSWORD_INVALID", "비밀번호 입력을 확인해 주세요.")
        try:
            current_password.encode("utf-8")
        except UnicodeEncodeError:
            raise InvalidInput("PASSWORD_INVALID", "비밀번호 입력을 확인해 주세요.") from None
        try:
            user_uuid = UUID(user_id)
        except ValueError:
            raise AuthenticationRejected() from None
        user = await self.repository.find_user_by_id(user_uuid)
        if user is None or user.is_active is not True:
            raise AuthenticationRejected()
        if not await run_sync(check_password, user.password_hash, current_password):
            raise InvalidInput("CURRENT_PASSWORD_INVALID", "현재 비밀번호를 확인해 주세요.")
        result = await self.repository.deactivate(
            user_uuid, expected_password_hash=user.password_hash
        )
        if result is None:
            raise AuthenticationRejected()
        if result is not True:
            raise InvalidInput("CURRENT_PASSWORD_INVALID", "현재 비밀번호를 확인해 주세요.")

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
