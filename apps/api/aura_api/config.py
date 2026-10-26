from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AURA_", env_file=".env", extra="ignore")

    app_name: str = "AURA API"
    api_prefix: str = Field(default="/api/v1", pattern=r"^/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+$")
