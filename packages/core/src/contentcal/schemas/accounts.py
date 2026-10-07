from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from contentcal.models.social import AccountStatus, SocialProvider


class SocialAccountOut(BaseModel):
    id: UUID
    provider: SocialProvider
    provider_account_id: str
    display_name: str
    avatar_url: str | None
    status: AccountStatus
    is_mock: bool
    scopes: list
    last_validated_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MockConnectRequest(BaseModel):
    """Development-only connect flow for the mock provider."""
    provider: SocialProvider = SocialProvider.MOCK
    display_name: str = "Mock Account"


class ProviderInfo(BaseModel):
    provider: SocialProvider
    name: str
    implemented: bool
    is_mock: bool


class DashboardSummary(BaseModel):
    drafts: int
    scheduled: int
    publishing: int
    published: int
    failed: int
    connected_accounts: int
    upcoming: list  # list[CalendarEvent]
    recent_content: list  # list[ContentSummary]
