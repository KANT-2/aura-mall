import re

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from aura_api.core.security import source_origin


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AURA_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )

    app_name: str = "AURA API"
    api_prefix: str = Field(default="/api/v1", pattern=r"^/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+$")
    csrf_allowed_origins: list[str] = Field(default_factory=list)
    bff_shared_key: SecretStr | None = None

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
