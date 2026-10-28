"""Configuration must fail closed; both database drivers share a verified TLS URL."""

import ssl
from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from aura_api.config import Settings
from aura_api.infra import database


def test_database_secret_file_is_loaded_and_conflicting_sources_are_rejected(tmp_path):
    secret = tmp_path / "database-url"
    url = "postgresql://app:private-password@db/aura?sslmode=verify-full&sslrootcert=/ca.crt"
    secret.write_text(url + "\n")
    settings = Settings(_env_file=None, database_url="", database_url_file=secret)
    assert settings.database_url.get_secret_value() == url
    assert "private-password" not in repr(settings)
    with pytest.raises(ValidationError, match="only one"):
        Settings(_env_file=None, database_url=url, database_url_file=secret)


@pytest.mark.parametrize("content", ["", "not-a-url", "postgresql://app:private-password@db/"])
def test_invalid_secret_file_fails_without_disclosing_content(tmp_path, content):
    secret = tmp_path / "database-url"
    secret.write_text(content)
    with pytest.raises(ValidationError, match="Cannot load") as error:
        Settings(_env_file=None, database_url_file=secret)
    assert "private-password" not in str(error.value)


def test_missing_secret_file_cannot_fall_back_to_an_unconfigured_database(tmp_path):
    with pytest.raises(ValidationError, match="Cannot load"):
        Settings(_env_file=None, database_url_file=tmp_path / "missing")


def test_libpq_tls_options_are_translated_for_sqlalchemy_asyncpg(monkeypatch):
    context = ssl.create_default_context()
    create_context = Mock(return_value=context)
    create_engine = Mock(wraps=database.create_async_engine)
    monkeypatch.setattr(database, "create_default_context", create_context)
    monkeypatch.setattr(database, "create_async_engine", create_engine)
    database.create_engine(
        "postgresql://app:p%40ss@db/aura?sslmode=verify-full&sslrootcert=/ca.crt"
    )
    url = create_engine.call_args.args[0]
    assert url.drivername == "postgresql+asyncpg"
    assert url.password == "p@ss"
    assert not url.query
    create_context.assert_called_once_with(cafile="/ca.crt")
    assert create_engine.call_args.kwargs["connect_args"] == {"ssl": context, "timeout": 3}
    assert context.check_hostname
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.minimum_version == ssl.TLSVersion.TLSv1_2


@pytest.mark.parametrize(
    "query",
    [
        "sslmode=require",
        "sslmode=prefer",
        "sslmode=disable",
        "sslmode=verify-full",
        "sslmode=verify-ca&sslrootcert=/ca",
    ],
)
def test_incomplete_or_unverified_explicit_tls_configuration_is_rejected(query):
    with pytest.raises(ValueError, match="TLS requires"):
        database.create_engine(f"postgresql://app@db/aura?{query}")
