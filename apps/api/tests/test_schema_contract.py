"""Offline metadata contract tests; never connect to a real database."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import anyio
import jwt
import psycopg
import pytest
from fastapi.testclient import TestClient

from aura_api.config import Settings
from aura_api.core.auth import CurrentUser
from aura_api.identity.postgres import PostgresAuthRepository
from aura_api.identity.repository import AuthStorageUnavailable
from aura_api.identity.schema_contract import (
    FOREIGN_KEYS,
    PRIMARY_KEYS,
    REQUIRED_COLUMNS,
    contract_gaps,
)
from aura_api.identity.service import AuthLifecycleService
from aura_api.main import create_app


def extension_metadata():
    columns = [
        {
            "table_name": table,
            "column_name": name,
            "udt_name": rule[:-1],
            "is_nullable": "YES" if rule.endswith("?") else "NO",
            "character_maximum_length": {"email": 254, "password_hash": 255, "token_hash": 64}.get(
                name
            ),
        }
        for table, fields in REQUIRED_COLUMNS.items()
        for name, rule in fields.items()
    ]
    constraints = [
        {"table_name": table, "kind": "p", "columns": list(fields)}
        for table, fields in PRIMARY_KEYS.items()
    ] + [
        {
            "table_name": table,
            "kind": "f",
            "columns": list(fields),
            "target_schema": "public",
            "target_table": target,
            "target_columns": list(target_fields),
        }
        for table, fields, target, target_fields in FOREIGN_KEYS
    ]
    indexes = [
        {
            "table_name": "users",
            "columns": [None],
            "expression": "lower((email)::text)",
            "key_count": 1,
        },
        {
            "table_name": "refresh_tokens",
            "columns": ["token_hash"],
            "expression": None,
            "key_count": 1,
        },
        {
            "table_name": "refresh_tokens",
            "columns": ["access_jti"],
            "expression": None,
            "key_count": 1,
        },
    ]
    return columns, constraints, indexes


def pr33_metadata():
    # Independent relevant identity snapshot: origin/develop 3d71af9, PR #33.
    fields = [
        ("users", "id", "uuid", None),
        ("users", "email", "varchar", 254),
        ("users", "name", "varchar", 100),
        ("users", "password_hash", "varchar", 255),
        ("users", "marketing", "bool", None),
        ("users", "created_at", "timestamptz", None),
        ("revoked_tokens", "jti", "uuid", None),
        ("revoked_tokens", "expires_at", "timestamptz", None),
        ("admins", "status", "varchar", 20),
    ]
    columns = [
        {
            "table_name": table,
            "column_name": name,
            "udt_name": kind,
            "is_nullable": "NO",
            "character_maximum_length": length,
        }
        for table, name, kind, length in fields
    ]
    constraints = [
        {"table_name": "users", "kind": "p", "columns": ["id"]},
        {"table_name": "revoked_tokens", "kind": "p", "columns": ["jti"]},
    ]
    indexes = [
        {
            "table_name": "users",
            "columns": [None],
            "expression": "lower((email)::text)",
            "key_count": 1,
        }
    ]
    return columns, constraints, indexes


def test_merged_base_is_compatible_but_required_extension_is_missing():
    gaps = contract_gaps(*pr33_metadata(), "public")
    assert "users.is_active: missing column" in gaps
    for table in ("refresh_tokens", "auth_token_families"):
        assert f"{table}: missing table" in gaps
    assert not any("auth_access_tokens" in gap for gap in gaps)
    assert not any(
        gap.startswith("revoked_tokens:") or gap.startswith("revoked_tokens.") for gap in gaps
    )
    assert not any("users.email" in gap or "users.password_hash" in gap for gap in gaps)


def test_pending_extension_passes_structural_guard_without_assuming_approval():
    assert contract_gaps(*extension_metadata(), "public") == []


@pytest.mark.parametrize("column", ["access_jti", "access_expires_at"])
@pytest.mark.parametrize("mutation", ["missing", "nullable", "type"])
def test_access_metadata_is_required_on_refresh_rows(column, mutation):
    columns, constraints, indexes = extension_metadata()
    row = next(row for row in columns if row["column_name"] == column)
    if mutation == "missing":
        columns.remove(row)
    elif mutation == "nullable":
        row["is_nullable"] = "YES"
    else:
        row["udt_name"] = "varchar"
    assert any(
        gap.startswith(f"refresh_tokens.{column}:")
        for gap in contract_gaps(columns, constraints, indexes, "public")
    )


@pytest.mark.parametrize("replacement", [None, ["access_jti", "family_id"]])
def test_access_jti_requires_its_own_unconditional_unique_index(replacement):
    columns, constraints, indexes = extension_metadata()
    index = next(row for row in indexes if row["columns"] == ["access_jti"])
    if replacement is None:
        indexes.remove(index)
    else:
        index["columns"] = replacement
        index["key_count"] = 2
    assert "refresh_tokens.access_jti: missing unconditional unique index" in contract_gaps(
        columns, constraints, indexes, "public"
    )


@pytest.mark.parametrize(
    "mutation", ["nullable", "type", "length", "primary", "foreign", "hash-unique", "email-unique"]
)
def test_incomplete_or_incompatible_extension_is_rejected(mutation):
    columns, constraints, indexes = extension_metadata()
    if mutation in {"nullable", "type", "length"}:
        row = next(row for row in columns if row["column_name"] == "token_hash")
        if mutation == "nullable":
            row["is_nullable"] = "YES"
        elif mutation == "type":
            row["udt_name"] = "uuid"
        else:
            row["character_maximum_length"] = 32
    elif mutation == "primary":
        constraints = [row for row in constraints if row["table_name"] != "revoked_tokens"]
    elif mutation == "foreign":
        constraints = [row for row in constraints if row["kind"] != "f"]
    elif mutation == "hash-unique":
        indexes = [row for row in indexes if row["columns"] != ["token_hash"]]
    else:
        indexes = indexes[1:]
    assert contract_gaps(columns, constraints, indexes, "public")


class MetadataConnection:
    def __init__(self, metadata):
        self.metadata = metadata
        self.statements = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def execute(self, query, params=None):
        self.statements.append(query)
        rows = []
        if isinstance(query, str):
            if "information_schema.columns" in query:
                rows = self.metadata[0]
            elif "FROM pg_constraint" in query:
                rows = self.metadata[1]
            elif "FROM pg_index" in query:
                rows = self.metadata[2]

        class Cursor:
            async def fetchall(self):
                return rows

            async def fetchone(self):
                return None

        return Cursor()


@pytest.fixture
def guarded_repository(monkeypatch):
    connection = MetadataConnection(pr33_metadata())

    async def connect(*args, **kwargs):
        return connection

    monkeypatch.setattr(psycopg.AsyncConnection, "connect", connect)
    return PostgresAuthRepository("never-connect", "schema-test"), connection


def test_read_only_diagnostic_and_no_business_query_on_schema_mismatch(guarded_repository):
    repository, connection = guarded_repository
    assert any("users.is_active" in gap for gap in anyio.run(repository.schema_gaps))
    with pytest.raises(AuthStorageUnavailable):
        anyio.run(repository.find_user, "private@example.com")
    statements = [query for query in connection.statements if isinstance(query, str)]
    assert not any(
        query.startswith(("INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"))
        for query in statements
    )
    assert not any("SELECT id, password_hash, is_active" in query for query in statements)


def test_customer_repository_never_falls_back_to_admin_accounts(monkeypatch):
    connection = MetadataConnection(extension_metadata())

    async def connect(*args, **kwargs):
        return connection

    monkeypatch.setattr(psycopg.AsyncConnection, "connect", connect)
    repository = PostgresAuthRepository("never-connect", "schema-test")
    assert anyio.run(repository.find_user, "admin-only@example.com") is None
    queries = [query.lower() for query in connection.statements if isinstance(query, str)]
    assert any("from users where lower(email)" in query for query in queries)
    assert not any("from admins" in query or "join admins" in query for query in queries)


def test_schema_mismatch_is_503_for_login_and_401_for_protected_api(guarded_repository):
    repository, _ = guarded_repository
    key = "test-only-schema-key-0123456789abcdef"
    settings = Settings(
        _env_file=None,
        jwt_algorithm="HS256",
        jwt_signing_key=key,
        jwt_issuer="schema-test",
        jwt_audience="api",
        database_url=None,
        csrf_allowed_origins=["https://mall.test"],
    )
    app = create_app(settings)
    app.state.auth_repository = repository
    app.state.auth_service = AuthLifecycleService(settings, repository)

    @app.get("/test/protected")
    async def protected(user: CurrentUser):
        return {"id": user.user_id}

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "jti": str(uuid4()),
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=1)).timestamp()),
            "iss": "schema-test",
            "aud": "api",
        },
        key,
        algorithm="HS256",
    )
    request_id = str(uuid4())
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "alice@example.com", "password": "private"},
            headers={"Origin": "https://mall.test", "X-Request-ID": request_id},
        )
        assert response.status_code == 503
        assert response.headers["x-request-id"] == request_id
        assert "is_active" not in response.text
        assert "private" not in response.text
        response = client.get(
            "/test/protected",
            headers={"Authorization": "Bearer " + token, "X-Request-ID": request_id},
        )
        assert response.status_code == 401
        assert response.headers["x-request-id"] == request_id
        assert "is_active" not in response.text
        assert client.get("/health").status_code == 200
