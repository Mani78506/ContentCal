import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    """Shared base. Portable types so the same schema runs on Postgres (prod)
    and SQLite (tests). Postgres-native types can be swapped in later."""


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
