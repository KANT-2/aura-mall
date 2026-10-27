import re
from pathlib import Path
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
    database_url_file: Path | None = None
    database_runtime_dir: Path | None = None
    jwt_access_ttl_seconds: int = Field(default=900, ge=1, le=86400)
    refresh_token_ttl_seconds: int = Field(default=604800, ge=1, le=7776000)
    # Admins get no refresh token, so their access token lives a little longer.
    admin_access_ttl_seconds: int = Field(default=3600, ge=1, le=86400)
    csrf_allowed_origins: list[str] = Field(default_factory=list)
    bff_shared_key: SecretStr | None = None
    # Payments (Toss Payments). Without a provider the payment API answers 503.
    payment_provider: Literal["toss"] | None = None
    toss_secret_key: SecretStr | None = None
    toss_api_url: str = "https://api.tosspayments.com"
    payment_timeout_seconds: float = Field(default=30, gt=0, le=60)
    # Unpaid orders older than this are cancelled by the expiry job. No default on purpose:
    # the operating value is a policy decision, and the job refuses to run without it.
    unpaid_order_ttl_minutes: int | None = Field(default=None, ge=1, le=43200)

    @model_validator(mode="before")
    @classmethod
    def prefer_database_secret_file(cls, values):
        if isinstance(values, dict) and values.get("database_url_file"):
            if values.get("database_url") == "":
                return {**values, "database_url": None}
        return values

    @field_validator("database_url_file", mode="before")
    @classmethod
    def empty_database_setting(cls, value):
        return None if value == "" else value

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
    def read_database_secret(self):
        if self.database_url_file is not None:
            if self.database_url is not None:
                raise ValueError("Configure only one database URL source")
            try:
                value = self.database_url_file.read_text(encoding="utf-8").strip()
                if not value:
                    raise ValueError("Empty database secret")
                self.database_url = self.validate_database_url(SecretStr(value))
            except (OSError, ValueError):
                raise ValueError("Cannot load a valid PostgreSQL database secret") from None
        return self

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

    @model_validator(mode="after")
    def validate_payment_configuration(self):
        if self.payment_provider is None:
            if self.toss_secret_key is not None:
                raise ValueError("Set AURA_PAYMENT_PROVIDER=toss to use the Toss secret key")
            return self
        key = self.toss_secret_key.get_secret_value() if self.toss_secret_key else ""
        # Live keys are refused until real payments are approved for this service.
        if not re.fullmatch(r"test_g?sk_[A-Za-z0-9_-]{8,200}", key):
            raise ValueError("Toss payments require a test secret key (test_sk_ or test_gsk_)")
        if not self.toss_api_url.startswith("https://"):
            raise ValueError("The Toss API URL must use HTTPS")
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
