"""Driver-boundary SQL contract checks; no PostgreSQL connection is opened.

These checks validate bindings and security predicates, not SQL execution or locks.
"""

from contextlib import asynccontextmanager
from copy import deepcopy
from unittest.mock import AsyncMock
from uuid import uuid4

import anyio
import psycopg
import pytest

from aura_api.config import Settings
from aura_api.identity.postgres import PostgresAuthRepository
from aura_api.identity.repository import AuthStorageUnavailable
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


@pytest.mark.parametrize("failure", ["read", "commit"])
def test_profile_update_failure_exits_transaction_without_returning_success(monkeypatch, failure):
    class Connection:
        def __init__(self):
            self.row = {"id": uuid4(), "name": "Before", "marketing": False}
            self.before = deepcopy(self.row)
            self.rolled_back = False
            self.updated = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            # Driver double: verify transaction error propagation, not real PostgreSQL rollback.
            if exc_type is not None or failure == "commit":
                self.row = deepcopy(self.before)
                self.rolled_back = True
            if exc_type is None and failure == "commit":
                raise psycopg.OperationalError("private-commit-secret")

        async def execute(self, query, params=None):
            cursor = AsyncMock()
            if isinstance(query, str) and query.startswith("UPDATE users"):
                assert params == ("After", True, self.row["id"])
                assert "WHERE id = %s AND is_active" in query
                self.updated = True
                self.row.update(name=params[0], marketing=params[1])
                cursor.fetchone.return_value = {"id": self.row["id"]}
            elif isinstance(query, str) and "SELECT id, email, name, marketing" in query:
                assert self.updated
                if failure == "read":
                    raise psycopg.OperationalError("private-read-secret")
                cursor.fetchone.return_value = {
                    **self.row,
                    "email": "member@example.com",
                    "coupon": True,
                }
            return cursor

    connection = Connection()
    monkeypatch.setattr(psycopg.AsyncConnection, "connect", AsyncMock(return_value=connection))
    monkeypatch.setattr("aura_api.identity.postgres.inspect_contract", AsyncMock(return_value=[]))
    repository = PostgresAuthRepository("never-connect", "sql-test")

    async def run():
        with pytest.raises(AuthStorageUnavailable) as error:
            await repository.update_profile(connection.row["id"], name="After", marketing=True)
        assert "private" not in str(error.value)

    anyio.run(run)
    assert connection.updated and connection.rolled_back
    assert connection.row == connection.before
