from contentcal.models.social import SocialProvider
from contentcal.providers.base import SocialProviderBase
from contentcal.providers.mock import MockProvider


class ProviderNotImplementedError(NotImplementedError):
    """Raised when a real provider integration has not been built yet.

    This is intentionally loud — the system must never pretend a real
    Instagram/YouTube/... publish happened when no API call was made."""


_REGISTRY: dict[SocialProvider, type[SocialProviderBase]] = {
    SocialProvider.MOCK: MockProvider,
    # Real integrations register here as they are implemented:
    # SocialProvider.INSTAGRAM: InstagramProvider,
    # SocialProvider.YOUTUBE: YouTubeProvider,
    # ...
}

PROVIDER_DISPLAY = {
    SocialProvider.INSTAGRAM: "Instagram",
    SocialProvider.FACEBOOK: "Facebook",
    SocialProvider.YOUTUBE: "YouTube",
    SocialProvider.LINKEDIN: "LinkedIn",
    SocialProvider.X: "X",
    SocialProvider.MOCK: "Mock (dev)",
}


def get_provider(provider: SocialProvider) -> SocialProviderBase:
    cls = _REGISTRY.get(provider)
    if cls is None:
        raise ProviderNotImplementedError(f"Provider '{provider.value}' is not implemented yet")
    return cls()


def list_providers() -> list[dict]:
    return [
        {
            "provider": p,
            "name": PROVIDER_DISPLAY[p],
            "implemented": p in _REGISTRY,
            "is_mock": p == SocialProvider.MOCK,
        }
        for p in SocialProvider
    ]
