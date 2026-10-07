import enum
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from contentcal.models.base import Base, TimestampMixin, UUIDMixin, utcnow


class WorkspaceRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class Workspace(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    slug: Mapped[str] = mapped_column(sa.String(100), unique=True, index=True, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    brand_color: Mapped[str | None] = mapped_column(sa.String(20))
    plan: Mapped[str] = mapped_column(sa.String(50), default="free", nullable=False)

    owner = relationship("User")
    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    social_accounts = relationship("SocialAccount", back_populates="workspace", cascade="all, delete-orphan")
    contents = relationship("Content", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workspace_members"
    __table_args__ = (sa.UniqueConstraint("workspace_id", "user_id", name="uq_member_workspace_user"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[WorkspaceRole] = mapped_column(
        sa.Enum(WorkspaceRole, native_enum=False, length=20), default=WorkspaceRole.MEMBER, nullable=False
    )
    invited_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id"))
    joined_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)

    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User", back_populates="memberships", foreign_keys=[user_id])
