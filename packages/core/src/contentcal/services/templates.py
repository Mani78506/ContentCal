"""Template library: built-ins + workspace templates, favorites, recents,
duplicate/customize workflows."""

import uuid

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.errors import ForbiddenError, NotFoundError, ValidationAppError
from contentcal.models import ActivityLog, Design, DesignTemplate, TemplateCategory, TemplateFavorite


async def list_templates(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    category: TemplateCategory | None = None,
    query: str | None = None,
    favorites_only: bool = False,
    limit: int = 60,
    offset: int = 0,
) -> tuple[list[tuple[DesignTemplate, bool]], int]:
    """Returns (template, is_favorite) rows — built-ins + workspace templates."""
    fav_sub = select(TemplateFavorite.template_id).where(TemplateFavorite.user_id == user_id)

    stmt = select(DesignTemplate, DesignTemplate.id.in_(fav_sub).label("is_fav"))
    stmt = stmt.where(
        or_(DesignTemplate.is_builtin.is_(True), DesignTemplate.workspace_id == workspace_id)
    )
    if category:
        stmt = stmt.where(DesignTemplate.category == category)
    if query:
        stmt = stmt.where(DesignTemplate.name.ilike(f"%{query}%"))
    if favorites_only:
        stmt = stmt.where(DesignTemplate.id.in_(fav_sub))
    stmt = stmt.order_by(DesignTemplate.is_builtin.desc(), DesignTemplate.created_at.desc())
    stmt = stmt.limit(limit).offset(offset)

    count_stmt = select(func.count()).select_from(DesignTemplate).where(
        or_(DesignTemplate.is_builtin.is_(True), DesignTemplate.workspace_id == workspace_id)
    )
    if category:
        count_stmt = count_stmt.where(DesignTemplate.category == category)
    if query:
        count_stmt = count_stmt.where(DesignTemplate.name.ilike(f"%{query}%"))
    if favorites_only:
        count_stmt = count_stmt.where(DesignTemplate.id.in_(fav_sub))
    total = await session.scalar(count_stmt)

    rows = (await session.execute(stmt)).all()
    return [(t, bool(fav)) for t, fav in rows], total or 0


async def get_template(session: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID) -> DesignTemplate:
    tpl = await session.get(DesignTemplate, template_id)
    if tpl is None or (not tpl.is_builtin and tpl.workspace_id != workspace_id):
        raise NotFoundError("Template not found")
    return tpl


async def recent_templates(session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, limit: int = 8) -> list[DesignTemplate]:
    """Templates the user most recently opened (from activity feed)."""
    rows = (await session.execute(
        select(ActivityLog.entity_id, func.max(ActivityLog.id).label("latest"))
        .where(
            ActivityLog.workspace_id == workspace_id,
            ActivityLog.user_id == user_id,
            ActivityLog.action == "template_opened",
        )
        .group_by(ActivityLog.entity_id)
        .order_by(func.max(ActivityLog.id).desc())
        .limit(limit)
    )).all()
    ids = [r[0] for r in rows]
    if not ids:
        return []
    tpls = (await session.execute(select(DesignTemplate).where(DesignTemplate.id.in_([uuid.UUID(i) for i in ids])))).scalars().all()
    by_id = {str(t.id): t for t in tpls}
    return [by_id[i] for i in ids if i in by_id]


async def set_favorite(session: AsyncSession, user_id: uuid.UUID, template_id: uuid.UUID, favorite: bool) -> None:
    if favorite:
        session.add(TemplateFavorite(user_id=user_id, template_id=template_id))
        try:
            await session.commit()
        except Exception:  # already favorited — idempotent
            await session.rollback()
    else:
        await session.execute(
            delete(TemplateFavorite).where(
                TemplateFavorite.user_id == user_id, TemplateFavorite.template_id == template_id
            )
        )
        await session.commit()


async def save_as_template(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
    category: TemplateCategory,
    platform: str,
    canvas_json: str,
    width: int,
    height: int,
) -> DesignTemplate:
    if not canvas_json:
        raise ValidationAppError("Cannot save an empty canvas as a template")
    tpl = DesignTemplate(
        workspace_id=workspace_id, created_by=user_id, name=name, category=category,
        platform=platform, width=width, height=height, canvas_json=canvas_json, is_builtin=False,
    )
    session.add(tpl)
    await session.flush()
    return tpl


async def update_template(
    session: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID, data
) -> DesignTemplate:
    tpl = await get_template(session, workspace_id, template_id)
    if tpl.is_builtin:
        raise ForbiddenError("Built-in templates can't be edited — duplicate or save a copy instead")
    if data.name is not None:
        tpl.name = data.name
    if data.category is not None:
        tpl.category = data.category
    if data.canvas_json is not None:
        tpl.canvas_json = data.canvas_json
    if data.thumbnail_path is not None:
        tpl.thumbnail_path = data.thumbnail_path
    await session.flush()
    return tpl


async def delete_template(session: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID) -> DesignTemplate:
    tpl = await get_template(session, workspace_id, template_id)
    if tpl.is_builtin:
        raise ForbiddenError("Built-in templates can't be deleted")
    await session.delete(tpl)
    await session.commit()
    return tpl
