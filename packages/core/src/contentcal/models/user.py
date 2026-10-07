import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from contentcal.models.base import Base, TimestampMixin, UUIDMixin


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(sa.String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(sa.String(1000))
    last_login_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))

    memberships = relationship(
        "WorkspaceMember", back_populates="user", cascade="all, delete-orphan", foreign_keys="WorkspaceMember.user_id"
    )
    created_content = relationship("Content", back_populates="created_by_user")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.email}>"
