from app.config import Settings
from app.services.base import AIProvider
from app.services.mock_provider import MockProvider


def create_provider(
    settings: Settings, provider_override: str | None = None
) -> AIProvider:
    return MockProvider()
