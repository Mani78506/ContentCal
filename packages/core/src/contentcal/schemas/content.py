from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from contentcal.models.content import ContentStatus
from contentcal.models.jobs import JobStatus
from contentcal.models.scheduling import ScheduledPostStatus
from contentcal.models.social import SocialProvider


class MediaOut(BaseModel):
    id: UUID
    file_name: str
    file_path: str  # relative storage path; served at /media/<path>
    mime_type: str
    size_bytes: int
    width: int | None
    height: int | None
    sort_order: int

    model_config = {"from_attributes": True}


class ContentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    caption: str = Field(default="", max_length=100_000)
    tags: list[str] = Field(default_factory=list, max_length=20)


class ContentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    caption: str | None = Field(default=None, max_length=100_000)
    tags: list[str] | None = Field(default=None, max_length=20)
    status: ContentStatus | None = None


class ScheduledPostOut(BaseModel):
    id: UUID
    content_id: UUID
    social_account_id: UUID
    provider: SocialProvider
    account_name: str
    scheduled_at: datetime
    status: ScheduledPostStatus
    published_at: datetime | None
    platform_post_url: str | None
    error: str | None


class ContentOut(BaseModel):
    id: UUID
    title: str
    caption: str
    status: ContentStatus
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    media: list[MediaOut]
    scheduled_posts: list[ScheduledPostOut]


class ContentSummary(BaseModel):
    id: UUID
    title: str
    status: ContentStatus
    updated_at: datetime
    media: list[MediaOut]
    platforms: list[SocialProvider]
    next_scheduled_at: datetime | None


class ScheduleRequest(BaseModel):
    social_account_ids: list[UUID] = Field(min_length=1, max_length=20)
    scheduled_at: datetime

    @field_validator("scheduled_at")
    @classmethod
    def _must_be_future(cls, v: datetime) -> datetime:
        from datetime import UTC
        now = datetime.now(UTC)
        vv = v if v.tzinfo else v.replace(tzinfo=UTC)
        if vv < now:
            raise ValueError("scheduled_at must be in the future")
        return vv


class PublishNowRequest(BaseModel):
    social_account_ids: list[UUID] = Field(min_length=1, max_length=20)


class RescheduleRequest(BaseModel):
    scheduled_at: datetime


class CalendarEvent(BaseModel):
    id: UUID
    content_id: UUID
    title: str
    caption_preview: str
    provider: SocialProvider
    account_name: str
    scheduled_at: datetime
    status: ScheduledPostStatus
    platform_post_url: str | None
    thumbnail_mime: str | None
    thumbnail_path: str | None


class PublishingAttemptOut(BaseModel):
    id: UUID
    attempt_number: int
    status: str
    error: str | None
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class PublishingJobOut(BaseModel):
    id: UUID
    scheduled_post_id: UUID
    idempotency_key: str
    status: JobStatus
    run_at: datetime
    retry_count: int
    max_retries: int
    last_error: str | None
    completed_at: datetime | None
    attempts: list[PublishingAttemptOut]

    model_config = {"from_attributes": True}
