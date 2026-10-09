"""Editable designs — saved Fabric documents with version history."""

import json
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.errors import NotFoundError, ValidationAppError
from contentcal.models import Design, DesignVersion, DesignTemplate

MAX_VERSIONS = 50
MAX_CANVAS_BYTES = 3_000_000


def _validate_canvas(canvas_json: str) -> None:
    if not canvas_json:
        raise ValidationAppError("Canvas document is empty")
    if len(canvas_json.encode()) > MAX_CANVAS_BYTES:
        raise ValidationAppError("Design exceeds the 3MB canvas limit")
    try:
        doc = json.loads(canvas_json)
    except json.JSONDecodeError:
        raise ValidationAppError("Canvas document is not valid JSON")
    if not isinstance(doc, dict) or "objects" not in doc:
        raise ValidationAppError("Canvas document is missing its objects")


async def list_designs(
    session: AsyncSession, workspace_id: uuid.UUID, *, limit: int = 50, offset: int = 0
) -> tuple[list[Design], int]:
    items = (await session.execute(
        select(Design)
        .where(Design.workspace_id == workspace_id)
        .order_by(Design.updated_at.desc())
        .limit(limit).offset(offset)
    )).scalars().all()
    total = await session.scalar(select(func.count()).select_from(Design).where(Design.workspace_id == workspace_id))
    return items, total or 0


async def get_design(session: AsyncSession, workspace_id: uuid.UUID, design_id: uuid.UUID) -> Design:
    d = await session.get(Design, design_id)
    if d is None or d.workspace_id != workspace_id:
        raise NotFoundError("Design not found")
    return d


async def create_design(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID, data
) -> Design:
    canvas = data.canvas_json
    if data.template_id:
        tpl = await session.get(DesignTemplate, data.template_id)
        if tpl is None or (not tpl.is_builtin and tpl.workspace_id != workspace_id):
            raise NotFoundError("Template not found")
        canvas = canvas or tpl.canvas_json
        data.width = data.width or tpl.width
        data.height = data.height or tpl.height
    if not canvas:
        canvas = json.dumps({"version": "6.7.0", "objects": [], "background": "#ffffff"})
    _validate_canvas(canvas)
    d = Design(
        workspace_id=workspace_id, created_by=user_id, template_id=data.template_id,
        name=data.name, width=data.width, height=data.height, canvas_json=canvas,
    )
    session.add(d)
    await session.flush()
    await record_version(session, d, user_id, note="Created")
    return d


async def update_design(
    session: AsyncSession, *, workspace_id: uuid.UUID, design_id: uuid.UUID, user_id: uuid.UUID, data
) -> Design:
    d = await get_design(session, workspace_id, design_id)
    if data.name is not None:
        d.name = data.name
    if data.width is not None:
        d.width = data.width
    if data.height is not None:
        d.height = data.height
    if data.canvas_json is not None:
        _validate_canvas(data.canvas_json)
        d.canvas_json = data.canvas_json
        await record_version(session, d, user_id, note=data.note or "Saved")
    await session.flush()
    return d


async def record_version(session: AsyncSession, design: Design, user_id: uuid.UUID, *, note: str) -> DesignVersion:
    v = DesignVersion(
        design_id=design.id, created_by=user_id, canvas_json=design.canvas_json,
        width=design.width, height=design.height, note=note,
    )
    session.add(v)
    await session.flush()
    # keep the last MAX_VERSIONS rows
    stale = (await session.execute(
        select(DesignVersion.id)
        .where(DesignVersion.design_id == design.id)
        .order_by(DesignVersion.created_at.desc())
        .offset(MAX_VERSIONS)
    )).scalars().all()
    if stale:
        await session.execute(delete(DesignVersion).where(DesignVersion.id.in_(stale)))
    return v


async def list_versions(session: AsyncSession, workspace_id: uuid.UUID, design_id: uuid.UUID) -> list[DesignVersion]:
    await get_design(session, workspace_id, design_id)
    return (await session.execute(
        select(DesignVersion).where(DesignVersion.design_id == design_id).order_by(DesignVersion.created_at.desc())
    )).scalars().all()


async def restore_version(
    session: AsyncSession, *, workspace_id: uuid.UUID, design_id: uuid.UUID,
    version_id: uuid.UUID, user_id: uuid.UUID,
) -> Design:
    d = await get_design(session, workspace_id, design_id)
    v = await session.get(DesignVersion, version_id)
    if v is None or v.design_id != design_id:
        raise NotFoundError("Version not found")
    d.canvas_json = v.canvas_json
    d.width = v.width
    d.height = v.height
    await session.flush()
    await record_version(session, d, user_id, note=f"Restored version from {v.created_at:%Y-%m-%d %H:%M}")
    return d


async def delete_design(session: AsyncSession, workspace_id: uuid.UUID, design_id: uuid.UUID) -> Design:
    d = await get_design(session, workspace_id, design_id)
    await session.delete(d)
    await session.commit()
    return d
