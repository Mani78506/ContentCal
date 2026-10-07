"""Development/test provider.

Simulates the publish lifecycle locally WITHOUT contacting any real platform.
It is honest about what it is: accounts connected through it are tagged with
provider='mock' and are visually badged as mock in the UI."""

import asyncio
import uuid

from contentcal.models.social import SocialAccount, SocialProvider
from contentcal.providers.base import PublishRequest, PublishResult, SocialProviderBase


class MockProvider(SocialProviderBase):
    provider = SocialProvider.MOCK

    async def validate(self, account: SocialAccount) -> bool:
        await asyncio.sleep(0.05)
        return True

    async def publish(self, account: SocialAccount, request: PublishRequest) -> PublishResult:
        await asyncio.sleep(0.1)  # simulate network latency
        post_id = f"mock_{uuid.uuid4().hex[:16]}"
        return PublishResult(
            success=True,
            platform_post_id=post_id,
            platform_post_url=f"https://mock.local/p/{post_id}",
            raw={"idempotency_key": request.idempotency_key, "provider": "mock"},
        )

    async def get_status(self, account: SocialAccount, platform_post_id: str) -> dict:
        return {"state": "published", "platform_post_id": platform_post_id, "provider": "mock"}
