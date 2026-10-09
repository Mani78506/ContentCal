"""Workspace media library — reusable assets (independent of content items),
organized by folder, plus brand-kit assets."""

import re
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.errors import NotFoundError, ValidationAppError
from contentcal.models import AssetKind, MediaAsset

_FOLDER_SAFE = re.compile(r"[^A-Za-z0-9 _/-]+")


def sanitize_folder(folder: str) -> str:
    folder = _FOLDER_SAFE.sub("", folder).strip(" /")[:200]
    return folder


async def list_assets(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    folder: str | None = None,
    kind: AssetKind | None = None,
    brand_kit_id: uuid.UUID | None = None,
    query: str | None = None,
    mime_prefix: str | None = None,  # "image" | "video"
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[MediaAsset], int]:
    stmt = select(MediaAsset).where(MediaAsset.workspace_id == workspace_id)
    if folder is not None:
        stmt = stmt.where(MediaAsset.folder == sanitize_folder(folder))
    if kind is not None:
        stmt = stmt.where(MediaAsset.kind == kind)
    if brand_kit_id is not None:
        stmt = stmt.where(MediaAsset.brand_kit_id == brand_kit_id)
    if query:
        stmt = stmt.where(MediaAsset.file_name.ilike(f"%{query}%"))
    if mime_prefix:
        stmt = stmt.where(MediaAsset.mime_type.like(f"{mime_prefix}/%"))

    total = await session.scalar(
        select(func.count()).select_from(stmt.subquery())
    )
    items = (await session.execute(
        stmt.order_by(MediaAsset.created_at.desc()).limit(limit).offset(offset)
    )).scalars().all()
    return items, total or 0


async def list_folders(session: AsyncSession, workspace_id: uuid.UUID) -> list[str]:
    rows = (await session.execute(
        select(MediaAsset.folder)
        .where(MediaAsset.workspace_id == workspace_id, MediaAsset.kind == AssetKind.LIBRARY)
        .distinct()
    )).scalars().all()
    return sorted(r for r in rows if r)


async def create_asset(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    file_name: str,
    file_path: str,
    mime_type: str,
    size_bytes: int,
    folder: str = "",
    kind: AssetKind = AssetKind.LIBRARY,
    brand_kit_id: uuid.UUID | None = None,
) -> MediaAsset:
    asset = MediaAsset(
        workspace_id=workspace_id, uploaded_by=user_id, file_name=file_name,
        file_path=file_path, mime_type=mime_type, size_bytes=size_bytes,
        folder=sanitize_folder(folder), kind=kind, brand_kit_id=brand_kit_id,
    )
    session.add(asset)
    await session.flush()
    return asset


async def get_asset(session: AsyncSession, workspace_id: uuid.UUID, asset_id: uuid.UUID) -> MediaAsset:
    a = await session.get(MediaAsset, asset_id)
    if a is None or a.workspace_id != workspace_id:
        raise NotFoundError("Asset not found")
    return a


async def update_asset(
    session: AsyncSession, workspace_id: uuid.UUID, asset_id: uuid.UUID, data
) -> MediaAsset:
    a = await get_asset(session, workspace_id, asset_id)
    if data.folder is not None:
        a.folder = sanitize_folder(data.folder)
    if data.file_name is not None:
        a.file_name = data.file_name
    await session.flush()
    return a


async def delete_asset(session: AsyncSession, workspace_id: uuid.UUID, asset_id: uuid.UUID) -> MediaAsset:
    a = await get_asset(session, workspace_id, asset_id)
    await session.delete(a)
    await session.commit()
    return a
