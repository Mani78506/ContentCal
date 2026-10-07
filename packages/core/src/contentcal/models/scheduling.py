import enum
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from contentcal.models.base import Base, TimestampMixin, UUIDMixin


class ScheduledPostStatus(str, enum.Enum):
    SCHEDULED = "scheduled"      # waiting for its time; a job will fire it
    PUBLISHING = "publishing"    # a worker has claimed it
    PUBLISHED = "published"
    FAILED = "failed"            # retries exhausted
    CANCELLED = "cancelled"


class ScheduledPost(Base, UUIDMixin, TimestampMixin):
    """One platform-targeted instance of a Content item.

    Content 1 ── n ScheduledPost (Instagram, LinkedIn, YouTube, ...)."""

    __tablename__ = "scheduled_posts"
    __table_args__ = (sa.Index("ix_scheduled_posts_due", "status", "scheduled_at"),)

    content_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("contents.id", ondelete="CASCADE"), nullable=False)
    social_account_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("social_accounts.id", ondelete="CASCADE"), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[ScheduledPostStatus] = mapped_column(
        sa.Enum(ScheduledPostStatus, native_enum=False, length=20),
        default=ScheduledPostStatus.SCHEDULED,
        nullable=False,
        index=True,
    )
    # Platform-specific payload overrides (caption variant, hashtags, etc.)
    platform_payload: Mapped[dict] = mapped_column(sa.JSON, default=dict)
    published_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    platform_post_id: Mapped[str | None] = mapped_column(sa.String(500))
    platform_post_url: Mapped[str | None] = mapped_column(sa.String(1000))
    error: Mapped[str | None] = mapped_column(sa.Text)

    content = relationship("Content", back_populates="scheduled_posts")
    social_account = relationship("SocialAccount", back_populates="scheduled_posts")
    publishing_jobs = relationship("PublishingJob", back_populates="scheduled_post", cascade="all, delete-orphan")
