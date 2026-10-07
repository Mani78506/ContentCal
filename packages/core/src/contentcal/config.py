"""Environment-driven settings. All secrets come from the environment only."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/content_cal"

    # Redis / queue
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 14
    cookie_secure: bool = False
    cookie_domain: str | None = None

    # Credential encryption at rest (Fernet requires urlsafe base64 32 bytes;
    # we accept 64 hex chars and derive from them)
    token_encryption_key: str = "0" * 64

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8010
    cors_origins: str = "http://localhost:3000"
    max_upload_mb: int = 50
    media_storage_dir: str = "media"

    # Scheduler / jobs
    scheduler_tick_seconds: int = 30
    job_max_retries: int = 3

    # Environment name; "test" enables test conveniences
    environment: str = "development"

    @field_validator("database_url")
    @classmethod
    def _must_be_async(cls, v: str) -> str:
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
