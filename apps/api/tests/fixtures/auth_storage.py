"""Test-only token-family storage. Production never imports this module."""

import threading
from datetime import UTC, datetime
from uuid import UUID

from aura_api.identity.tokens import UserRecord


class MemoryAuthRepository:
    def __init__(self, issuer):
        self.users = {}
        self.issuer = issuer
        self.families, self.refreshes, self.revoked = {}, {}, {}
        self.lock = threading.RLock()

    async def find_user(self, email):
        return self.users.get(email)

    async def register(self, registration, password_hash, pair):
        with self.lock:
            if registration.email in self.users:
                return False
            self.users[registration.email] = UserRecord(pair.user_id, password_hash, True)
            self.families[pair.family_id] = False
            self.save(pair)
        return True

    async def profile(self, user_id):
        for email, user in self.users.items():
            if user.id == user_id and user.is_active:
                return {
                    "id": str(user_id),
                    "email": email,
                    "name": "Test customer",
                    "marketing": False,
                    "coupon": True,
                    "role": "member",
                }
        return None

    def active(self, user_id):
        return any(user.id == user_id and user.is_active for user in self.users.values())

    def save(self, pair):
        self.refreshes[pair.refresh_hash] = {
            "id": pair.refresh_id,
            "user": pair.user_id,
            "family": pair.family_id,
            "expires": pair.refresh_expires_at,
            "consumed": False,
            "revoked": False,
            "access_jti": pair.jti,
            "access_expires_at": pair.access_expires_at,
        }

    async def create_token_family(self, pair, *, expected_password_hash):
        with self.lock:
            if not any(
                user.id == pair.user_id
                and user.is_active
                and user.password_hash == expected_password_hash
                for user in self.users.values()
            ):
                return False
            self.families[pair.family_id] = False
            self.save(pair)
        return True

    def revoke(self, family):
        self.families[family] = True
        for row in self.refreshes.values():
            if row["family"] == family:
                row["revoked"] = True
                if row["access_expires_at"] > datetime.now(UTC):
                    self.revoked[row["access_jti"]] = row["access_expires_at"]

    async def rotate(self, token_hash, issue):
        with self.lock:
            row = self.refreshes.get(token_hash)
            if not row or self.families[row["family"]] or not self.active(row["user"]):
                return None
            if row["consumed"]:
                self.revoke(row["family"])
                return None
            if row["revoked"] or row["expires"] <= datetime.now(UTC):
                return None
            pair = issue(row["user"], row["family"])
            row["consumed"] = True
            self.save(pair)
            return pair

    async def logout(self, user_id, jti):
        with self.lock:
            row = next((row for row in self.refreshes.values() if row["access_jti"] == jti), None)
            if (
                not row
                or row["user"] != user_id
                or self.families[row["family"]]
                or row["access_expires_at"] <= datetime.now(UTC)
            ):
                return False
            self.revoke(row["family"])
            return True

    async def is_revoked(self, *, issuer, jti):
        with self.lock:
            row = next(
                (row for row in self.refreshes.values() if row["access_jti"] == UUID(jti)), None
            )
            return (
                issuer != self.issuer
                or not row
                or self.families[row["family"]]
                or not self.active(row["user"])
                or row["access_expires_at"] <= datetime.now(UTC)
                or row["access_jti"] in self.revoked
            )
