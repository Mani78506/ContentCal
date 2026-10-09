"""Workspace activity feed — single writer used by every domain service/router.

Actions are plain strings so new event types don't need a migration:
template_created/edited, design_created/saved, media_uploaded, post_created/
edited/scheduled, publish_started/succeeded/failed, asset_deleted, ..."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.models import ActivityLog, User

MAX_DETAILS_LEN = 2000


async def log_activity(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    entity_type: str = "",
    entity_id: uuid.UUID | str | None = None,
    entity_name: str = "",
    details: dict | None = None,
    commit: bool = False,
) -> ActivityLog:
    row = ActivityLog(
        workspace_id=workspace_id,
        user_id=user_id,
        action=action[:80],
        entity_type=entity_type[:60],
        entity_id=str(entity_id)[:64] if entity_id else "",
        entity_name=(entity_name or "")[:500],
        details=details or {},
    )
    session.add(row)
    if commit:
        await session.commit()
    else:
        await session.flush()
    return row


async def list_activity(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    action: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[tuple[ActivityLog, str | None]], int]:
    base = select(ActivityLog, User.full_name).outerjoin(User, User.id == ActivityLog.user_id)
    base = base.where(ActivityLog.workspace_id == workspace_id)
    if action:
        base = base.where(ActivityLog.action == action)
    total = await session.scalar(
        select(func.count()).select_from(ActivityLog).where(ActivityLog.workspace_id == workspace_id)
        .where(*([ActivityLog.action == action] if action else []))
    )
    rows = (await session.execute(base.order_by(ActivityLog.id.desc()).limit(limit).offset(offset))).all()
    return [(log, name) for log, name in rows], total or 0
