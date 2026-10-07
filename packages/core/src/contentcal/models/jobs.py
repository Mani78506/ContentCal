import enum
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from contentcal.models.base import Base, TimestampMixin, UUIDMixin


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESS = "success"
    FAILED = "failed"   # will be retried while retry_count < max_retries
    DEAD = "dead"       # retries exhausted
    CANCELLED = "cancelled"


class PublishingJob(Base, UUIDMixin, TimestampMixin):
    """Durable record of a publish operation. One row per (post, enqueue round).

    `idempotency_key` is unique — a retry of the same logical publish can never
    create a second job, so a provider call is never issued twice for the same
    logical publish window."""

    __tablename__ = "publishing_jobs"
    __table_args__ = (sa.Index("ix_publishing_jobs_poll", "status", "run_at"),)

    scheduled_post_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("scheduled_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idempotency_key: Mapped[str] = mapped_column(sa.String(200), unique=True, nullable=False)
    status: Mapped[JobStatus] = mapped_column(
        sa.Enum(JobStatus, native_enum=False, length=20), default=JobStatus.PENDING, nullable=False, index=True
    )
    run_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    locked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(sa.String(200))
    retry_count: Mapped[int] = mapped_column(sa.Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(sa.Integer, default=3, nullable=False)
    last_error: Mapped[str | None] = mapped_column(sa.Text)
    completed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))

    scheduled_post = relationship("ScheduledPost", back_populates="publishing_jobs")
    attempts = relationship("PublishingAttempt", back_populates="job", cascade="all, delete-orphan", order_by="PublishingAttempt.attempt_number")


class PublishingAttempt(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "publishing_attempts"
    __table_args__ = (sa.UniqueConstraint("job_id", "attempt_number", name="uq_attempt_job_number"),)

    job_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("publishing_jobs.id", ondelete="CASCADE"), nullable=False)
    attempt_number: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False)  # success | failed
    error: Mapped[str | None] = mapped_column(sa.Text)
    provider_response: Mapped[dict | None] = mapped_column(sa.JSON)
    started_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))

    job = relationship("PublishingJob", back_populates="attempts")
