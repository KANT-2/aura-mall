"""JWT and SQLAlchemy wiring checks. No real database connection is opened."""

import asyncio
import runpy
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from aura_api import config, main
from aura_api.config import Settings
from aura_api.identity.repository import UnavailableAuthRepository


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+asyncpg"])
def test_both_database_drivers_and_jwt_state_are_preserved(monkeypatch, scheme):
    engine = AsyncMock()
    sessionmaker = object()
    engine_urls = []

    def create_engine(url):
        engine_urls.append(make_url(url))
        return engine

    def create_sessionmaker(received):
        assert received is engine
        return sessionmaker

    monkeypatch.setattr(main, "create_engine", create_engine)
    monkeypatch.setattr(main, "create_sessionmaker", create_sessionmaker)
    settings = Settings(
        _env_file=None,
        database_url=f"{scheme}://tester:p%40ss%2Fword@localhost:5432/aura_test",
    )
    app = main.create_app(settings)
    assert engine_urls[0].drivername == "postgresql+asyncpg"
    assert engine_urls[0].password == "p@ss/word"
    repository_url = make_url(app.state.auth_repository._dsn)
    assert repository_url.drivername == "postgresql"
    assert repository_url.password == engine_urls[0].password
    assert repository_url.database == engine_urls[0].database
    assert app.state.sessionmaker is sessionmaker
    assert app.state.auth_service is not None
    assert app.state.jwt_verifier is not None
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        paths = client.get("/openapi.json").json()["paths"]
        assert "/api/v1/auth/login" in paths
        assert "/api/v1/auth/refresh" in paths
        assert "/api/v1/auth/logout" in paths
    engine.dispose.assert_awaited_once()


def test_engine_is_disposed_even_if_lifespan_body_fails(monkeypatch):
    engine = AsyncMock()
    monkeypatch.setattr(main, "create_engine", lambda url: engine)
    monkeypatch.setattr(main, "create_sessionmaker", lambda engine: object())
    app = main.create_app(
        Settings(_env_file=None, database_url="postgresql+asyncpg://tester@localhost/test")
    )

    async def run():
        with pytest.raises(RuntimeError, match="test failure"):
            async with app.router.lifespan_context(app):
                raise RuntimeError("test failure")

    asyncio.run(run())
    engine.dispose.assert_awaited_once()


def test_unconfigured_database_stays_unavailable(monkeypatch):
    def unexpected_engine(url):
        pytest.fail("An unconfigured application must not create an engine")

    monkeypatch.setattr(main, "create_engine", unexpected_engine)
    app = main.create_app(Settings(_env_file=None, database_url=None))
    assert app.state.sessionmaker is None
    assert isinstance(app.state.auth_repository, UnavailableAuthRepository)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200


def test_bff_fixture_uses_production_token_contract_without_production_storage(monkeypatch):
    settings = Settings(
        _env_file=None,
        database_url=None,
        jwt_algorithm="HS256",
        jwt_signing_key="bff-fixture-test-only-key-0123456789",
        jwt_issuer="fixture-test",
        jwt_audience="fixture-test",
        csrf_allowed_origins=["https://bff.test"],
    )
    monkeypatch.setattr(config, "Settings", lambda **kwargs: settings)
    monkeypatch.syspath_prepend(str(Path(__file__).parent / "fixtures"))
    fixture = runpy.run_path(str(Path(__file__).parent / "fixtures" / "bff_app.py"))
    with TestClient(fixture["app"]) as client:
        response = client.post(
            "/api/v1/auth/login",
            headers={"Origin": "https://bff.test"},
            json={"email": "member-a@example.com", "password": "bff-password123"},
        )
        assert response.status_code == 200
        pair = response.json()
        assert "accessToken" in pair and "refreshToken" in pair
        assert not response.cookies
        token = pair["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}
        assert (
            client.get("/api/v1/auth/me", headers=headers).json()["email"] == "member-a@example.com"
        )
        response = client.post(
            "/api/v1/auth/logout",
            headers={**headers, "Origin": "https://bff.test"},
        )
        assert response.status_code == 204
        assert client.get("/api/v1/recipes", headers=headers).status_code == 401
