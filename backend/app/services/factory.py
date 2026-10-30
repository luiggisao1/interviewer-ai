from app.config import Settings
from app.services.anthropic_provider import AnthropicProvider
from app.services.base import AIProvider
from app.services.mock_provider import MockProvider


def create_provider(settings: Settings, provider_override: str | None = None) -> AIProvider:
    provider = (provider_override or settings.resolved_provider).lower().strip()
    if provider in ("anthropic", "claude") and settings.anthropic_api_key:
        return AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model)
    return MockProvider()
