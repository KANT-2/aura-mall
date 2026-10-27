from contextlib import asynccontextmanager
from uuid import UUID

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from aura_api.domain.identity import Registration
from aura_api.identity.repository import AuthStorageUnavailable, TokenIssuer
from aura_api.identity.schema_contract import inspect_contract
from aura_api.identity.tokens import IssuedTokens, UserRecord


class PostgresAuthRepository:
    """JWT token families and customer profiles; no automatic DDL or fallback."""

    def __init__(self, dsn: str, issuer: str, *, schema: str = "public"):
        self._dsn = dsn
        self._issuer = issuer
        self._schema = schema

    @asynccontextmanager
    async def _connection(self, *, check_schema: bool = True):
        try:
            async with await psycopg.AsyncConnection.connect(
                self._dsn, row_factory=dict_row, connect_timeout=3
            ) as connection:
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
                "SELECT id, password_hash, is_active FROM users WHERE lower(email) = %s", (email,)
            )
            row = await cursor.fetchone()
        return UserRecord(row["id"], row["password_hash"], row["is_active"]) if row else None

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
                   ON CONFLICT (lower(email)) DO NOTHING RETURNING id""",
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
            cursor = await connection.execute(
                """SELECT id, email, name, marketing,
                     EXISTS (SELECT 1 FROM user_coupons c WHERE c.user_id = u.id
                       AND c.type = 'FREE_SHIPPING' AND c.status = 'AVAILABLE') AS coupon
                   FROM users u WHERE id = %s AND is_active""",
                (user_id,),
            )
            row = await cursor.fetchone()
        return {**row, "id": str(row["id"]), "role": "member"} if row else None

    async def create_token_family(self, tokens: IssuedTokens) -> bool:
        accepted = False
        async with self._connection() as connection:
            if await self._active_user(connection, tokens.user_id):
                await connection.execute(
                    """INSERT INTO auth_token_families (id, user_id, created_at)
                       VALUES (%s, %s, %s)""",
                    (tokens.family_id, tokens.user_id, tokens.issued_at),
                )
                await self._insert_tokens(connection, tokens)
                accepted = True
        return accepted

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
