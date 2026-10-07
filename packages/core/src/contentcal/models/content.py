import enum
import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from contentcal.models.base import Base, TimestampMixin, UUIDMixin


class ContentStatus(str, enum.Enum):
    """Rollup status of the canonical content item.

    Per-platform state lives on ScheduledPost; this is a denormalized summary
    kept in sync by the scheduling service for fast listing."""

    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    FAILED = "failed"
    ARCHIVED = "archived"


class Content(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "contents"

    workspace_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    caption: Mapped[str] = mapped_column(sa.Text, default="", nullable=False)
    status: Mapped[ContentStatus] = mapped_column(
        sa.Enum(ContentStatus, native_enum=False, length=20), default=ContentStatus.DRAFT, nullable=False, index=True
    )
    tags: Mapped[list] = mapped_column(sa.JSON, default=list)

    workspace = relationship("Workspace", back_populates="contents")
    created_by_user = relationship("User", back_populates="created_content")
    media = relationship("ContentMedia", back_populates="content", cascade="all, delete-orphan", order_by="ContentMedia.sort_order")
    scheduled_posts = relationship("ScheduledPost", back_populates="content", cascade="all, delete-orphan")


class ContentMedia(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_media"

    content_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("contents.id", ondelete="CASCADE"), nullable=False)
    file_path: Mapped[str] = mapped_column(sa.String(1000), nullable=False)
    file_name: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(sa.BigInteger, nullable=False)
    width: Mapped[int | None] = mapped_column(sa.Integer)
    height: Mapped[int | None] = mapped_column(sa.Integer)
    duration_seconds: Mapped[float | None] = mapped_column(sa.Float)
    sort_order: Mapped[int] = mapped_column(sa.Integer, default=0, nullable=False)

    content = relationship("Content", back_populates="media")
