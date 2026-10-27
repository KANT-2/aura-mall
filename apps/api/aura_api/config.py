import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from aura_api.core.security import source_origin


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AURA_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )

    app_name: str = "AURA API"
    api_prefix: str = Field(default="/api/v1", pattern=r"^/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+$")
    jwt_algorithm: Literal["HS256"] | None = None
    jwt_signing_key: SecretStr | None = None
    jwt_issuer: str | None = None
    jwt_audience: str | None = None
    database_url: SecretStr | None = None
    jwt_access_ttl_seconds: int = Field(default=900, ge=1, le=86400)
    refresh_token_ttl_seconds: int = Field(default=604800, ge=1, le=7776000)
    csrf_allowed_origins: list[str] = Field(default_factory=list)
    bff_shared_key: SecretStr | None = None

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None:
            parts = urlsplit(value.get_secret_value())
            if (
                parts.scheme not in {"postgres", "postgresql", "postgresql+asyncpg"}
                or not parts.hostname
                or not parts.path.strip("/")
            ):
                raise ValueError("An explicit PostgreSQL database URL is required")
            if parts.port is not None and not 1 <= parts.port <= 65535:
                raise ValueError("Invalid PostgreSQL port")
        return value

    @model_validator(mode="after")
    def validate_jwt_configuration(self):
        values = (self.jwt_algorithm, self.jwt_signing_key, self.jwt_issuer, self.jwt_audience)
        if any(value is not None for value in values):
            if any(value is None for value in values):
                raise ValueError("All JWT settings must be configured together")
            key = self.jwt_signing_key.get_secret_value()
            if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", key):
                raise ValueError("JWT key must be 32-128 URL-safe ASCII characters")
            if not self.jwt_issuer.strip() or not self.jwt_audience.strip():
                raise ValueError("JWT issuer and audience must be nonempty")
        return self

    @field_validator("csrf_allowed_origins")
    @classmethod
    def validate_origins(cls, values: list[str]) -> list[str]:
        return [source_origin(value) for value in values]

    @field_validator("bff_shared_key")
    @classmethod
    def validate_shared_key(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not re.fullmatch(
            r"[A-Za-z0-9_-]{32,128}", value.get_secret_value()
        ):
            raise ValueError("BFF shared key must be 32-128 URL-safe ASCII characters")
        return value
