"""Test fixtures: in-memory SQLite + FastAPI dependency override.

Production runs PostgreSQL; models use portable types so the identical schema
runs here on SQLite, keeping the suite hermetic and fast."""

import sys
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

from contentcal.database import get_session  # noqa: E402
from contentcal.models import Base  # noqa: E402
from contentcal.services.media import storage_root  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s
        await s.rollback()


@pytest_asyncio.fixture
async def client(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override():
        async with factory() as s:
            yield s

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def register(client: AsyncClient, email: str | None = None, workspace: str = "Acme Studio") -> dict:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.dev"
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct horse battery", "full_name": "Test User", "workspace_name": workspace},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def workspace_id(client: AsyncClient) -> str:
    resp = await client.get("/api/v1/workspaces")
    assert resp.status_code == 200, resp.text
    return resp.json()[0]["id"]


async def connect_mock(client: AsyncClient, ws_id: str, name: str = "Mock IG Dev") -> dict:
    resp = await client.post(
        f"/api/v1/workspaces/{ws_id}/accounts/connect",
        json={"provider": "mock", "display_name": name},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def create_content(client: AsyncClient, ws_id: str, title: str = "Launch teaser") -> dict:
    resp = await client.post(
        f"/api/v1/workspaces/{ws_id}/content",
        json={"title": title, "caption": "Something exciting is coming.", "tags": ["launch"]},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
