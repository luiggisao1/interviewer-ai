import os
from functools import lru_cache

import certifi
from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

if not os.environ.get("SSL_CERT_FILE"):
    try:
        os.environ["SSL_CERT_FILE"] = certifi.where()
    except Exception:
        pass

class Settings(BaseSettings):
    app_name: str = "Interviewer AI API"
    environment: str = "development"
    ai_provider: str = "gemini"
    openai_api_key: str | None = Field(default=None, repr=False)
    openai_model: str = "gpt-4o-mini"
    openai_realtime_model: str = "gpt-realtime-2.1-mini"
    anthropic_api_key: str | None = Field(default=None, repr=False)
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    google_api_key: str | None = Field(default=None, repr=False)
    gemini_model: str = "gemini-2.5-flash"
    gemini_realtime_model: str = "gemini-3.8-flash"
    recruiter_name: str = "Iris"
    frontend_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"), env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.frontend_origins.split(",")
            if origin.strip()
        ]

    @property
    def available_providers(self) -> list[str]:
        providers: list[str] = []
        if self.anthropic_api_key:
            providers.append("anthropic")
        if self.openai_api_key:
            providers.append("openai")
        if self.google_api_key:
            providers.append("gemini")
        if not providers or self.ai_provider.lower() == "mock":
            providers.append("mock")
        return providers

    @property
    def resolved_provider(self) -> str:
        provider = self.ai_provider.lower().strip()
        if provider == "mock":
            return "mock"
        if provider in ("anthropic", "claude") and self.anthropic_api_key:
            return "anthropic"
        if provider == "openai" and self.openai_api_key:
            return "openai"
        if provider in ("gemini", "google") and self.google_api_key:
            return "gemini"
        return "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
