"""Driver-boundary SQL contract checks; no PostgreSQL connection is opened.

These checks validate bindings and security predicates, not SQL execution or locks.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import uuid4

import anyio
import pytest

from aura_api.config import Settings
from aura_api.identity.postgres import PostgresAuthRepository
from aura_api.identity.tokens import issue_tokens


@pytest.fixture
def pair():
    return issue_tokens(
        Settings(
            _env_file=None,
            jwt_algorithm="HS256",
            jwt_signing_key="test-only-sql-key-0123456789abcdef",
            jwt_issuer="sql-test",
            jwt_audience="api",
            database_url=None,
        ),
        uuid4(),
        uuid4(),
    )


def test_pair_is_saved_in_one_refresh_row_without_raw_credentials(pair):
    connection = AsyncMock()
    repository = PostgresAuthRepository("never-connect", "sql-test")
    anyio.run(repository._insert_tokens, connection, pair)
    connection.execute.assert_awaited_once()
    query, params = connection.execute.await_args.args
    assert "INSERT INTO refresh_tokens" in query
    assert "access_jti, access_expires_at" in query
    assert params == (
        pair.refresh_id,
        pair.user_id,
        pair.family_id,
        pair.refresh_hash,
        pair.refresh_expires_at,
        pair.issued_at,
        pair.jti,
        pair.access_expires_at,
    )
    assert pair.access_token not in params
    assert pair.refresh_token not in params


def test_family_blacklist_uses_all_unexpired_access_records_even_after_refresh_consumption(pair):
    connection = AsyncMock()
    repository = PostgresAuthRepository("never-connect", "sql-test")
    anyio.run(repository._revoke_family, connection, pair.family_id)
    query, params = connection.execute.await_args.args
    assert "SELECT access_jti, access_expires_at FROM refresh_tokens" in query
    assert "access_expires_at > clock_timestamp()" in query
    assert "consumed_at" not in query
    assert "revoked_at" not in query
    assert "ON CONFLICT (jti) DO UPDATE" in query
    assert params == (pair.family_id,)


@pytest.mark.parametrize("operation", ["lookup", "logout"])
def test_access_operations_use_recorded_access_lifetime_and_family(pair, monkeypatch, operation):
    connection = AsyncMock()
    cursor = AsyncMock()
    cursor.fetchone.return_value = {"revoked": False, "id": pair.family_id, "revoked_at": None}
    connection.execute.return_value = cursor

    @asynccontextmanager
    async def connected():
        yield connection

    repository = PostgresAuthRepository("never-connect", "sql-test")
    monkeypatch.setattr(repository, "_connection", connected)

    async def run():
        if operation == "lookup":
            assert await repository.is_revoked(issuer="sql-test", jti=str(pair.jti)) is False
        else:
            assert await repository.logout(pair.user_id, pair.jti) is True

    anyio.run(run)
    queries = [call.args[0] for call in connection.execute.await_args_list]
    query = next(query for query in queries if "t.access_jti = %s" in query)
    assert "refresh_tokens t" in query
    assert "t.access_expires_at > clock_timestamp()" in query
    assert "t.consumed_at" not in query
    assert "t.expires_at" not in query
    assert "t.revoked_at" not in query
    assert not any("auth_access_tokens" in query for query in queries)
    if operation == "lookup":
        assert "f.revoked_at IS NULL AND u.is_active" in query
        assert "revoked_tokens" in query
    else:
        assert "f.user_id = %s" in query
        assert "FOR UPDATE OF f" in query
