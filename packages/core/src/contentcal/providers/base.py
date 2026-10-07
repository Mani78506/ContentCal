"""Provider abstraction.

The calendar, scheduler, and worker NEVER talk to a social platform directly.
They ask this interface — `connect/disconnect/validate/publish/get_status` —
and the registry resolves the concrete implementation. Real integrations
(Instagram Graph API, LinkedIn, YouTube Data API, ...) are added by
implementing this ABC and registering it, with zero changes upstream."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from contentcal.models.social import SocialAccount, SocialProvider


@dataclass
class PublishRequest:
    content_title: str
    caption: str
    media: list[dict[str, Any]] = field(default_factory=list)  # {file_path, mime_type}
    platform_payload: dict[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""


@dataclass
class PublishResult:
    success: bool
    platform_post_id: str | None = None
    platform_post_url: str | None = None
    error: str | None = None
    retryable: bool = True
    raw: dict[str, Any] = field(default_factory=dict)


class SocialProviderBase(ABC):
    provider: SocialProvider

    @abstractmethod
    async def validate(self, account: SocialAccount) -> bool:
        """Check that stored credentials are still usable."""

    @abstractmethod
    async def publish(self, account: SocialAccount, request: PublishRequest) -> PublishResult:
        """Publish to the platform. MUST honour `request.idempotency_key`:
        calling publish twice with the same key must never create two posts."""

    async def get_status(self, account: SocialAccount, platform_post_id: str) -> dict[str, Any]:
        return {"state": "unknown"}
