"""Async SQLAlchemy engine and session factory."""

import logging
from collections.abc import AsyncGenerator
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from contentcal.config import get_settings

settings = get_settings()
log = logging.getLogger(__name__)


def _masked_url(url: str) -> str:
    """Show scheme/host/port only — never the password."""
    try:
        parts = urlsplit(url)
        host = parts.hostname or "?"
        return f"{parts.scheme}://***@{host}:{parts.port or ''}"
    except Exception:
        # not even URL-shaped — first 12 chars is enough to debug without leaking secrets
        return f"<unparseable, begins: {url[:12]!r}>"


# WARNING level so it surfaces even before logging.basicConfig runs in the API process.
log.warning("DATABASE_URL → %s", _masked_url(settings.database_url))

engine = create_async_engine(settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=20)

SessionFactory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionFactory() as session:
        yield session
