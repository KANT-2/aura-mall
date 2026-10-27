from contextlib import asynccontextmanager
from typing import TYPE_CHECKING
from uuid import UUID

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from aura_api.domain.identity import Registration
from aura_api.identity.repository import (
    LOGIN_FAILURE_LIMIT,
    LOGIN_LOCK,
    AuthStorageUnavailable,
    TokenIssuer,
)
from aura_api.identity.schema_contract import inspect_contract
from aura_api.identity.tokens import IssuedTokens, UserRecord, hash_login_email

if TYPE_CHECKING:
    from aura_api.infra.database_rotation import RotatingDatabase

# The legacy field remains compatible with UserRecord, but restoration is disabled.
USER_COLUMNS = "id, password_hash, is_active, deletion_requested_at, false AS restorable"
# Purged accounts keep their row for retained orders; nothing identifies the member.
DELETED_NAME = "탈퇴회원"
DELETED_PASSWORD_HASH = "!deleted"


def user_record(row) -> UserRecord | None:
    return UserRecord(**row) if row else None


class PostgresAuthRepository:
    """JWT token families and customer profiles; no automatic DDL or fallback."""

    def __init__(
        self,
        dsn: str,
        issuer: str,
        *,
        schema: str = "public",
        runtime: "RotatingDatabase | None" = None,
    ):
        self._dsn = dsn
        self._issuer = issuer
        self._schema = schema
        self._runtime = runtime

    @asynccontextmanager
    async def _dsn_lease(self):
        if self._runtime is None:
            yield self._dsn
        else:
            async with self._runtime.lease() as generation:
                yield generation.dsn

    @asynccontextmanager
    async def _connection(self, *, check_schema: bool = True):
        try:
            async with (
                self._dsn_lease() as dsn,
                await psycopg.AsyncConnection.connect(
                    dsn, row_factory=dict_row, connect_timeout=3
                ) as connection,
            ):
                await connection.execute(
                    sql.SQL("SET LOCAL search_path TO pg_catalog, {}").format(
                        sql.Identifier(self._schema)
                    )
                )
                await connection.execute("SET LOCAL statement_timeout = '5000ms'")
                await connection.execute("SET LOCAL lock_timeout = '3000ms'")
                if check_schema and await inspect_contract(connection, self._schema):
                    raise AuthStorageUnavailable("Authentication schema is incompatible")
                yield connection
            # AsyncConnection context commits here; failures cannot become successful responses.
        except (psycopg.Error, OSError, TimeoutError):
            raise AuthStorageUnavailable("Authentication storage unavailable") from None

    async def schema_gaps(self) -> list[str]:
        """Read metadata only. Not a public endpoint or an automatic schema migration."""
        async with self._connection(check_schema=False) as connection:
            return await inspect_contract(connection, self._schema)

    async def find_user(self, email: str) -> UserRecord | None:
        async with self._connection() as connection:
            cursor = await connection.execute(
                f"SELECT {USER_COLUMNS} FROM users WHERE lower(email) = %s "
                "AND deactivated_at IS NULL",
                (email,),
            )
            return user_record(await cursor.fetchone())

    async def find_user_by_id(self, user_id: UUID) -> UserRecord | None:
        async with self._connection() as connection:
            cursor = await connection.execute(
                f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (user_id,)
            )
            return user_record(await cursor.fetchone())

    async def reserve_login_attempt(self, email_hash: str) -> int:
        async with self._connection() as connection:
            # The row lock serializes concurrent attempts for one email, including unknown ones.
            await connection.execute(
                "INSERT INTO login_failures (email_hash) VALUES (%s) ON CONFLICT DO NOTHING",
                (email_hash,),
            )
            cursor = await connection.execute(
                """SELECT failure_count,
                     ceil(extract(epoch FROM locked_until - clock_timestamp()))::int AS wait
                   FROM login_failures WHERE email_hash = %s FOR UPDATE""",
                (email_hash,),
            )
            row = await cursor.fetchone()
            if row["wait"] is not None and row["wait"] > 0:
                return row["wait"]
            # Count the attempt before verifying it; success clears the row afterwards.
            failures = row["failure_count"] + 1
            await connection.execute(
                """UPDATE login_failures SET failure_count = %s, updated_at = clock_timestamp(),
                     locked_until = CASE WHEN %s THEN clock_timestamp() + %s END
                   WHERE email_hash = %s""",
                (failures, failures >= LOGIN_FAILURE_LIMIT, LOGIN_LOCK, email_hash),
            )
        return 0

    async def clear_login_failures(self, email_hash: str) -> None:
        async with self._connection() as connection:
            await connection.execute(
                "DELETE FROM login_failures WHERE email_hash = %s", (email_hash,)
            )

    async def _active_user(self, connection, user_id):
        cursor = await connection.execute(
            "SELECT is_active FROM users WHERE id = %s FOR SHARE", (user_id,)
        )
        row = await cursor.fetchone()
        return row is not None and row["is_active"] is True

    async def _insert_tokens(self, connection, tokens: IssuedTokens):
        await connection.execute(
            """INSERT INTO refresh_tokens
               (id, user_id, family_id, token_hash, expires_at, created_at,
                access_jti, access_expires_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                tokens.refresh_id,
                tokens.user_id,
                tokens.family_id,
                tokens.refresh_hash,
                tokens.refresh_expires_at,
                tokens.issued_at,
                tokens.jti,
                tokens.access_expires_at,
            ),
        )

    async def register(
        self, registration: Registration, password_hash: str, tokens: IssuedTokens
    ) -> bool:
        async with self._connection() as connection:
            cursor = await connection.execute(
                """INSERT INTO users (id, email, name, password_hash, marketing, is_active)
                   VALUES (%s, %s, %s, %s, %s, true)
                   ON CONFLICT (lower(email)) WHERE deactivated_at IS NULL
                   DO NOTHING RETURNING id""",
                (
                    tokens.user_id,
                    registration.email,
                    registration.name,
                    password_hash,
                    registration.marketing,
                ),
            )
            if await cursor.fetchone() is None:
                return False
            await connection.execute(
                "INSERT INTO user_coupons (user_id, type) VALUES (%s, 'FREE_SHIPPING')",
                (tokens.user_id,),
            )
            await connection.execute(
                "INSERT INTO auth_token_families (id, user_id, created_at) VALUES (%s, %s, %s)",
                (tokens.family_id, tokens.user_id, tokens.issued_at),
            )
            await self._insert_tokens(connection, tokens)
        return True

    async def profile(self, user_id: UUID) -> dict | None:
        async with self._connection() as connection:
            return await self._profile(connection, user_id)

    async def _profile(self, connection, user_id: UUID) -> dict | None:
        cursor = await connection.execute(
            """SELECT id, email, name, marketing,
                     EXISTS (SELECT 1 FROM user_coupons c WHERE c.user_id = u.id
                       AND c.type = 'FREE_SHIPPING' AND c.status = 'AVAILABLE') AS coupon
                   FROM users u WHERE id = %s AND is_active""",
            (user_id,),
        )
        row = await cursor.fetchone()
        return {**row, "id": str(row["id"]), "role": "member"} if row else None

    async def update_profile(
        self, user_id: UUID, *, name: str | None = None, marketing: bool | None = None
    ) -> dict | None:
        result = None
        async with self._connection() as connection:
            # Row-level UPDATE serialization preserves omitted fields, including false booleans.
            cursor = await connection.execute(
                """UPDATE users SET name = COALESCE(%s, name), marketing = COALESCE(%s, marketing)
                   WHERE id = %s AND is_active RETURNING id""",
                (name, marketing, user_id),
            )
            if await cursor.fetchone() is not None:
                result = await self._profile(connection, user_id)
        return result

    async def create_token_family(
        self, tokens: IssuedTokens, *, expected_password_hash: str
    ) -> bool:
        accepted = False
        async with self._connection() as connection:
            cursor = await connection.execute(
                "SELECT id FROM users WHERE id = %s AND is_active AND password_hash = %s FOR SHARE",
                (tokens.user_id, expected_password_hash),
            )
            if await cursor.fetchone() is not None:
                await connection.execute(
                    """INSERT INTO auth_token_families (id, user_id, created_at)
                       VALUES (%s, %s, %s)""",
                    (tokens.family_id, tokens.user_id, tokens.issued_at),
                )
                await self._insert_tokens(connection, tokens)
                accepted = True
        return accepted

    async def restore_token_family(
        self,
        tokens: IssuedTokens,
        *,
        expected_password_hash: str,
        expected_deletion_requested_at,
    ) -> bool:
        # Compatibility boundary: permanent deactivation is never restored.
        return False

    async def change_password(
        self, user_id: UUID, *, expected_password_hash: str, new_password_hash: str
    ) -> bool | None:
        async with self._connection() as connection:
            # Serialize against login/refresh before locking any family or token row.
            cursor = await connection.execute(
                "SELECT password_hash, is_active FROM users WHERE id = %s FOR UPDATE", (user_id,)
            )
            user = await cursor.fetchone()
            if user is None or user["is_active"] is not True:
                return None
            if user["password_hash"] != expected_password_hash:
                return False
            await connection.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s", (new_password_hash, user_id)
            )
            await self._revoke_user_families(connection, user_id)
        # Password and all revocations have committed together before reporting success.
        return True

    async def _revoke_user_families(self, connection, user_id):
        # Caller holds the user row lock; keep the common user -> family -> token order.
        cursor = await connection.execute(
            "SELECT id FROM auth_token_families WHERE user_id = %s ORDER BY id FOR UPDATE",
            (user_id,),
        )
        for family in await cursor.fetchall():
            await self._revoke_family(connection, family["id"])

    async def deactivate(self, user_id: UUID, *, expected_password_hash: str) -> bool | None:
        async with self._connection() as connection:
            cursor = await connection.execute(
                "SELECT password_hash, is_active FROM users WHERE id = %s FOR UPDATE", (user_id,)
            )
            user = await cursor.fetchone()
            if user is None or user["is_active"] is not True:
                return None
            if user["password_hash"] != expected_password_hash:
                return False
            # No automatic restore or deletion deadline. Retained data needs a reviewed policy.
            await connection.execute(
                """UPDATE users SET is_active = false, marketing = false,
                     deactivated_at = clock_timestamp(), password_hash = %s
                   WHERE id = %s""",
                (DELETED_PASSWORD_HASH, user_id),
            )
            await self._revoke_user_families(connection, user_id)
        return True

    async def due_member_ids(self, limit: int) -> list[UUID]:
        async with self._connection() as connection:
            cursor = await connection.execute(
                """SELECT id FROM users
                   WHERE NOT is_active AND deleted_at IS NULL AND deactivated_at IS NULL
                     AND deletion_scheduled_at <= clock_timestamp()
                   ORDER BY deletion_scheduled_at, id LIMIT %s""",
                (limit,),
            )
            return [row["id"] for row in await cursor.fetchall()]

    async def purge_member(self, user_id: UUID) -> bool:
        """Anonymize one expired member in one transaction; False if no longer due."""
        async with self._connection() as connection:
            # Recheck under the user lock: a restore that committed first wins.
            cursor = await connection.execute(
                """SELECT email FROM users
                   WHERE id = %s AND NOT is_active AND deleted_at IS NULL AND deactivated_at IS NULL
                     AND deletion_scheduled_at <= clock_timestamp()
                   FOR UPDATE""",
                (user_id,),
            )
            user = await cursor.fetchone()
            if user is None:
                return False
            await self._revoke_user_families(connection, user_id)
            await connection.execute(
                "DELETE FROM auth_token_families WHERE user_id = %s", (user_id,)
            )
            # Coupons tied to an order are kept with the retained order records.
            await connection.execute(
                """DELETE FROM user_coupons c
                   WHERE c.user_id = %s AND c.status = 'AVAILABLE' AND c.used_order_id IS NULL
                     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.coupon_id = c.id)""",
                (user_id,),
            )
            # Ingredients cascade; other members' children retain their rows with parent_id NULL.
            await connection.execute("DELETE FROM recipes WHERE user_id = %s", (user_id,))
            await connection.execute(
                "DELETE FROM login_failures WHERE email_hash = %s",
                (hash_login_email(user["email"].lower()),),
            )
            await connection.execute(
                """UPDATE users SET email = 'deleted-' || id || '@deleted.invalid', name = %s,
                     password_hash = %s, marketing = false, deleted_at = clock_timestamp()
                   WHERE id = %s""",
                (DELETED_NAME, DELETED_PASSWORD_HASH, user_id),
            )
        return True

    async def prune_login_failures(self) -> None:
        """Forget unlocked failure rows untouched for a day."""
        async with self._connection() as connection:
            await connection.execute(
                """DELETE FROM login_failures
                   WHERE updated_at < clock_timestamp() - interval '1 day'
                     AND (locked_until IS NULL OR locked_until <= clock_timestamp())"""
            )

    async def start_purge_run(self, *, dry_run: bool) -> UUID:
        async with self._connection() as connection:
            cursor = await connection.execute(
                "INSERT INTO member_deletion_runs (dry_run) VALUES (%s) RETURNING id", (dry_run,)
            )
            return (await cursor.fetchone())["id"]

    async def finish_purge_run(
        self, run_id: UUID, *, status: str, eligible: int, deleted: int, failed: list[UUID]
    ) -> None:
        async with self._connection() as connection:
            await connection.execute(
                """UPDATE member_deletion_runs
                   SET finished_at = clock_timestamp(), status = %s, eligible = %s,
                       deleted = %s, failed = %s, failed_user_ids = %s
                   WHERE id = %s""",
                (status, eligible, deleted, len(failed), failed, run_id),
            )

    async def _revoke_family(self, connection, family_id):
        await connection.execute(
            """UPDATE auth_token_families SET revoked_at = COALESCE(revoked_at, now())
               WHERE id = %s""",
            (family_id,),
        )
        await connection.execute(
            """UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now())
               WHERE family_id = %s""",
            (family_id,),
        )
        await connection.execute(
            """INSERT INTO revoked_tokens (jti, expires_at)
               SELECT access_jti, access_expires_at FROM refresh_tokens
               WHERE family_id = %s AND access_expires_at > clock_timestamp()
               ON CONFLICT (jti) DO UPDATE
               SET expires_at = GREATEST(revoked_tokens.expires_at, EXCLUDED.expires_at)""",
            (family_id,),
        )

    async def rotate(self, token_hash: str, issue: TokenIssuer) -> IssuedTokens | None:
        result = None
        async with self._connection() as connection:
            cursor = await connection.execute(
                """SELECT r.id, r.family_id, f.user_id FROM refresh_tokens r
                   JOIN auth_token_families f ON f.id = r.family_id WHERE r.token_hash = %s""",
                (token_hash,),
            )
            candidate = await cursor.fetchone()
            if candidate and await self._active_user(connection, candidate["user_id"]):
                # Lock order: user -> family -> refresh row. Refresh and logout share this order.
                cursor = await connection.execute(
                    "SELECT revoked_at FROM auth_token_families WHERE id = %s FOR UPDATE",
                    (candidate["family_id"],),
                )
                family = await cursor.fetchone()
                cursor = await connection.execute(
                    """SELECT consumed_at, revoked_at, expires_at > clock_timestamp() AS live
                       FROM refresh_tokens WHERE id = %s FOR UPDATE""",
                    (candidate["id"],),
                )
                current = await cursor.fetchone()
                if family and family["revoked_at"] is None and current:
                    if current["consumed_at"] is not None:
                        # Return rejection only AFTER this transaction commits revocation.
                        await self._revoke_family(connection, candidate["family_id"])
                    elif current["revoked_at"] is None and current["live"]:
                        result = issue(candidate["user_id"], candidate["family_id"])
                        await connection.execute(
                            "UPDATE refresh_tokens SET consumed_at = now() WHERE id = %s",
                            (candidate["id"],),
                        )
                        await self._insert_tokens(connection, result)
        return result

    async def logout(self, user_id: UUID, jti: UUID) -> bool:
        accepted = False
        async with self._connection() as connection:
            # Take the same user lock even if the account was disabled during the request.
            await connection.execute("SELECT id FROM users WHERE id = %s FOR SHARE", (user_id,))
            cursor = await connection.execute(
                """SELECT f.id, f.revoked_at FROM auth_token_families f
                   JOIN refresh_tokens t ON t.family_id = f.id
                   WHERE t.access_jti = %s AND f.user_id = %s
                     AND t.access_expires_at > clock_timestamp()
                   FOR UPDATE OF f""",
                (jti, user_id),
            )
            family = await cursor.fetchone()
            if family and family["revoked_at"] is None:
                await self._revoke_family(connection, family["id"])
                accepted = True
        return accepted

    async def is_revoked(self, *, issuer: str, jti: str) -> bool:
        if issuer != self._issuer:
            return True
        try:
            token_id = UUID(jti)
        except ValueError:
            return True
        async with self._connection() as connection:
            # A consumed/expired Refresh row still tracks its independently valid Access.
            # Admin access tokens (no refresh) are recorded in admin_sessions instead.
            cursor = await connection.execute(
                """SELECT NOT (
                     EXISTS (
                       SELECT 1 FROM refresh_tokens t
                       JOIN auth_token_families f ON f.id = t.family_id
                       JOIN users u ON u.id = f.user_id
                       WHERE t.access_jti = %s AND t.access_expires_at > clock_timestamp()
                         AND f.revoked_at IS NULL AND u.is_active
                         AND NOT EXISTS (SELECT 1 FROM revoked_tokens r WHERE r.jti = t.access_jti)
                     )
                     OR EXISTS (
                       SELECT 1 FROM admin_sessions s
                       JOIN admins a ON a.id = s.admin_id
                       WHERE s.jti = %s AND s.expires_at > clock_timestamp()
                         AND s.revoked_at IS NULL AND a.status = 'active'
                         AND NOT EXISTS (SELECT 1 FROM revoked_tokens r WHERE r.jti = s.jti)
                     )
                   ) AS revoked""",
                (token_id, token_id),
            )
            row = await cursor.fetchone()
        return row["revoked"] if row and type(row["revoked"]) is bool else True
