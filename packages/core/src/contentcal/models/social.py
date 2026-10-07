import enum
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from contentcal.models.base import Base, TimestampMixin, UUIDMixin


class SocialProvider(str, enum.Enum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    YOUTUBE = "youtube"
    LINKEDIN = "linkedin"
    X = "x"
    MOCK = "mock"  # development/test provider — never real publishing


class AccountStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


class SocialAccount(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "social_accounts"
    __table_args__ = (
        sa.UniqueConstraint("workspace_id", "provider", "provider_account_id", name="uq_account_workspace_provider_ext"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[SocialProvider] = mapped_column(sa.Enum(SocialProvider, native_enum=False, length=20), nullable=False)
    provider_account_id: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    display_name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(sa.String(1000))
    status: Mapped[AccountStatus] = mapped_column(
        sa.Enum(AccountStatus, native_enum=False, length=20), default=AccountStatus.ACTIVE, nullable=False
    )
    # Encrypted at rest via Fernet (TOKEN_ENCRYPTION_KEY). Never exposed via API.
    access_token_encrypted: Mapped[str | None] = mapped_column(sa.Text)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(sa.Text)
    token_expires_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    scopes: Mapped[list] = mapped_column(sa.JSON, default=list)
    connected_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    last_validated_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))

    workspace = relationship("Workspace", back_populates="social_accounts")
    scheduled_posts = relationship("ScheduledPost", back_populates="social_account")

    @property
    def is_mock(self) -> bool:
        return self.provider == SocialProvider.MOCK
