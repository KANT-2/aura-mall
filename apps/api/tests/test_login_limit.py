"""Member login failure limits: 3 consecutive failures lock the email for 10 minutes."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import psycopg
from psycopg import sql
from test_lifecycle import PASSWORD, MemoryRepository, login, protected
from test_lifecycle import client as client
from test_lifecycle import repository as repository

from aura_api.identity.tokens import hash_login_email

WRONG = "wrong-password-123"


def fail(client, email="alice@example.com"):
    return login(client, email, WRONG)


def expire_lock(repository, email="alice@example.com"):
    key = hash_login_email(email)
    if isinstance(repository, MemoryRepository):
        failures, _ = repository.login_failures[key]
        repository.login_failures[key] = (failures, datetime.now(UTC) - timedelta(seconds=1))
        return
    with psycopg.connect(repository._dsn) as connection:
        connection.execute(
            sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(repository._schema))
        )
        connection.execute(
            "UPDATE login_failures SET locked_until = now() - interval '1 second' "
            "WHERE email_hash = %s",
            (key,),
        )


def test_third_failure_locks_even_the_correct_password(client):
    assert [fail(client).status_code for _ in range(3)] == [401, 401, 401]
    locked = login(client)
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "LOGIN_LOCKED"
    assert 590 <= int(locked.headers["retry-after"]) <= 600
    assert "access" not in locked.text.lower()
    # Other members and the email case/whitespace variants share the right keys.
    assert login(client, "bob@example.com").status_code == 200
    assert login(client, " ALICE@EXAMPLE.COM ").status_code == 429


def test_success_resets_consecutive_failures(client):
    assert fail(client).status_code == 401
    assert fail(client).status_code == 401
    assert login(client).status_code == 200
    assert fail(client).status_code == 401
    assert fail(client).status_code == 401
    assert login(client).status_code == 200


def test_unknown_email_is_limited_identically(client):
    known = [fail(client).json() for _ in range(3)] + [login(client).json()]
    unknown_responses = [fail(client, "missing@example.com") for _ in range(4)]
    assert [response.json() for response in unknown_responses] == known
    assert [response.status_code for response in unknown_responses] == [401, 401, 401, 429]


def test_lock_expires_and_next_failure_locks_again(client, repository):
    for _ in range(3):
        fail(client)
    expire_lock(repository)
    assert fail(client).status_code == 401
    assert login(client).status_code == 429
    expire_lock(repository)
    pair = login(client)
    assert pair.status_code == 200
    assert protected(client, pair.json()["accessToken"]).status_code == 200
    assert fail(client).status_code == 401


def test_concurrent_attempts_cannot_exceed_the_limit(client):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: fail(client).status_code, range(8)))
    assert results.count(401) == 3
    assert results.count(429) == 5
    assert login(client, password=PASSWORD).status_code == 429
