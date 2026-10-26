import re
from typing import Literal

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
    csrf_allowed_origins: list[str] = Field(default_factory=list)
    bff_shared_key: SecretStr | None = None
    # postgresql+asyncpg://user:password@host:5432/db — unset means no database (fails closed).
    database_url: SecretStr | None = None

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

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not value.get_secret_value().startswith("postgresql+asyncpg://"):
            raise ValueError("Database URL must use the postgresql+asyncpg:// driver")
        return value

    @field_validator("bff_shared_key")
    @classmethod
    def validate_shared_key(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not re.fullmatch(
            r"[A-Za-z0-9_-]{32,128}", value.get_secret_value()
        ):
            raise ValueError("BFF shared key must be 32-128 URL-safe ASCII characters")
        return value
