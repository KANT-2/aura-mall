"""Replay whole read dependencies, bound outages, and never replay a write or SQL bug."""

import asyncio
from socket import gaierror
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError

from aura_api.infra.database import create_engine
from aura_api.infra.database_errors import DatabaseUnavailable
from aura_api.infra.database_failures import (
    CatalogFailoverMiddleware,
    connection_failure,
    database_exception_handler,
)


def disconnected():
    return DBAPIError(
        "private SQL",
        {"password": "private-password"},
        Exception("private URL"),
        connection_invalidated=True,
    )


def test_raw_database_dns_failure_is_normalized_without_exposing_credentials(monkeypatch):
    engine = create_engine("postgresql://user:private-password@db-not-present/test")

    def fail(*args, **kwargs):
        raise gaierror("private-address")

    monkeypatch.setattr(engine.sync_engine.dialect, "connect", fail)

    async def attempt():
        try:
            with pytest.raises(DatabaseUnavailable) as failure:
                async with engine.connect():
                    pass
            assert "private" not in str(failure.value)
        finally:
            await engine.dispose()

    asyncio.run(attempt())


def test_read_releases_failed_session_and_retries_with_fresh_dependencies():
    app = FastAPI()
    app.add_middleware(CatalogFailoverMiddleware, prefix="/api/v1", seconds=1)
    app.add_exception_handler(DBAPIError, database_exception_handler)
    active = []
    retired = []

    async def session():
        assert active == []
        current = object()
        active.append(current)
        try:
            yield current
        finally:
            active.remove(current)
            retired.append(current)

    @app.get("/api/v1/catalog")
    async def read(current: Annotated[object, Depends(session)]):
        if len(retired) < 2:
            raise disconnected()
        return {"ok": True}

    with TestClient(app) as client:
        response = client.get("/api/v1/catalog")
    assert response.status_code == 200 and response.json() == {"ok": True}
    assert len(retired) == 3 and len(set(retired)) == 3 and active == []


@pytest.mark.parametrize("method,path", [("POST", "/api/v1/catalog"), ("GET", "/other")])
def test_writes_and_unapproved_gets_are_not_replayed(method, path):
    app = FastAPI()
    app.add_middleware(CatalogFailoverMiddleware, prefix="/api/v1", seconds=1)
    app.add_exception_handler(DBAPIError, database_exception_handler)
    calls = []

    @app.api_route(path, methods=[method])
    async def operation():
        calls.append("executed")
        raise disconnected()

    with TestClient(app) as client:
        response = client.request(method, path)
    assert calls == ["executed"]
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert response.headers["retry-after"] == "1"
    assert "private" not in response.text


def test_exhausted_read_budget_returns_safe_503():
    app = FastAPI()
    app.add_middleware(CatalogFailoverMiddleware, prefix="/api/v1", seconds=0.05)
    app.add_exception_handler(DBAPIError, database_exception_handler)

    @app.get("/api/v1/catalog/products/test")
    async def read():
        raise disconnected()

    with TestClient(app) as client:
        response = client.get("/api/v1/catalog/products/test")
    assert response.status_code == 503 and "private" not in response.text


def test_non_connection_sql_failure_is_not_retried():
    error = DBAPIError("private SQL", {}, Exception("syntax error"))
    assert not connection_failure(error)
    app = FastAPI()
    app.add_middleware(CatalogFailoverMiddleware, prefix="/api/v1", seconds=1)
    app.add_exception_handler(DBAPIError, database_exception_handler)
    calls = []

    @app.get("/api/v1/catalog")
    async def read():
        calls.append(1)
        raise error

    with TestClient(app) as client:
        response = client.get("/api/v1/catalog")
    assert response.status_code == 500 and calls == [1]
