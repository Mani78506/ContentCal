"""Studio endpoints: template library and editable designs."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Form, Query, UploadFile, status

from app import serializers
from app.deps import CurrentUser, SessionDep, WorkspaceCtx
from contentcal.errors import ForbiddenError, NotFoundError, ValidationAppError
from contentcal.models import AssetKind, TemplateCategory
from contentcal.schemas.content import ContentCreate
from contentcal.schemas.studio import (
    DesignCreate,
    DesignOut,
    DesignUpdate,
    DesignVersionOut,
    TemplateCreate,
    TemplateOut,
    TemplateUpdate,
    VersionRestore,
)
from contentcal.services import activity as activity_svc
from contentcal.services import content as content_svc
from contentcal.services import designs as design_svc
from contentcal.services import templates as tpl_svc
from contentcal.services.media import new_design_path, new_storage_path, sanitize_filename, storage_root

router = APIRouter(prefix="/workspaces/{workspace_id}/studio", tags=["studio"])


def _require_write(ctx) -> None:
    if not ctx.can_write:
        raise ForbiddenError("Your workspace role is read-only")


# ---------- Templates ----------


@router.get("/templates", response_model=dict)
async def list_templates(
    ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep,
    category: TemplateCategory | None = None,
    query: str | None = Query(default=None, alias="q"),
    favorites: bool = False,
    limit: int = Query(default=60, le=200),
    offset: int = 0,
):
    rows, total = await tpl_svc.list_templates(
        session, ctx.workspace.id, user.id, category=category, query=query,
        favorites_only=favorites, limit=limit, offset=offset,
    )
    return {
        "items": [serializers.template_out(t, is_favorite=f) for t, f in rows],
        "total": total, "limit": limit, "offset": offset,
    }


@router.get("/templates/recent", response_model=list[TemplateOut])
async def recent_templates(ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    tpls = await tpl_svc.recent_templates(session, ctx.workspace.id, user.id)
    return [serializers.template_out(t) for t in tpls]


@router.get("/templates/{template_id}", response_model=TemplateOut)
async def get_template(template_id: uuid.UUID, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    tpl = await tpl_svc.get_template(session, ctx.workspace.id, template_id)
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="template_opened", entity_type="template", entity_id=tpl.id, entity_name=tpl.name,
        commit=True,
    )
    out = serializers.template_out(tpl)
    out.canvas_json = tpl.canvas_json  # include document only on detail fetch
    return out


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(data: TemplateCreate, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    """Save a design (or raw canvas JSON) as a reusable workspace template."""
    _require_write(ctx)
    if data.design_id:
        d = await design_svc.get_design(session, ctx.workspace.id, data.design_id)
        canvas, w, h = d.canvas_json, d.width, d.height
    elif data.canvas_json and data.width and data.height:
        canvas, w, h = data.canvas_json, data.width, data.height
    else:
        raise ValidationAppError("Provide design_id or canvas_json + width + height")
    tpl = await tpl_svc.save_as_template(
        session, workspace_id=ctx.workspace.id, user_id=user.id, name=data.name,
        category=data.category, platform=data.platform or "", canvas_json=canvas, width=w, height=h,
    )
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="template_created", entity_type="template", entity_id=tpl.id, entity_name=tpl.name,
        details={"category": tpl.category.value},
    )
    await session.commit()
    return serializers.template_out(tpl)


@router.patch("/templates/{template_id}", response_model=TemplateOut)
async def update_template(template_id: uuid.UUID, data: TemplateUpdate, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    tpl = await tpl_svc.update_template(session, ctx.workspace.id, template_id, data)
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="template_edited", entity_type="template", entity_id=tpl.id, entity_name=tpl.name,
    )
    await session.commit()
    return serializers.template_out(tpl)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    await tpl_svc.delete_template(session, ctx.workspace.id, template_id)


@router.post("/templates/{template_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
async def favorite(template_id: uuid.UUID, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    await tpl_svc.get_template(session, ctx.workspace.id, template_id)
    await tpl_svc.set_favorite(session, user.id, template_id, True)


@router.delete("/templates/{template_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
async def unfavorite(template_id: uuid.UUID, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    await tpl_svc.set_favorite(session, user.id, template_id, False)


# ---------- Designs ----------


@router.get("/designs", response_model=dict)
async def list_designs(ctx: WorkspaceCtx, session: SessionDep, limit: int = Query(default=50, le=200), offset: int = 0):
    items, total = await design_svc.list_designs(session, ctx.workspace.id, limit=limit, offset=offset)
    return {"items": [serializers.design_summary(d) for d in items], "total": total}


@router.post("/designs", response_model=DesignOut, status_code=status.HTTP_201_CREATED)
async def create_design(data: DesignCreate, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    d = await design_svc.create_design(session, workspace_id=ctx.workspace.id, user_id=user.id, data=data)
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="design_created", entity_type="design", entity_id=d.id, entity_name=d.name,
        details={"from_template": str(data.template_id) if data.template_id else None},
    )
    await session.commit()
    return serializers.design_out(d)


@router.get("/designs/{design_id}", response_model=DesignOut)
async def get_design(design_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    d = await design_svc.get_design(session, ctx.workspace.id, design_id)
    return serializers.design_out(d)


@router.patch("/designs/{design_id}", response_model=DesignOut)
async def update_design(design_id: uuid.UUID, data: DesignUpdate, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    d = await design_svc.update_design(
        session, workspace_id=ctx.workspace.id, design_id=design_id, user_id=user.id, data=data
    )
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="design_saved", entity_type="design", entity_id=d.id, entity_name=d.name,
    )
    await session.commit()
    return serializers.design_out(d)


@router.delete("/designs/{design_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_design(design_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    await design_svc.delete_design(session, ctx.workspace.id, design_id)


@router.get("/designs/{design_id}/versions", response_model=list[DesignVersionOut])
async def list_versions(design_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    versions = await design_svc.list_versions(session, ctx.workspace.id, design_id)
    return [serializers.version_out(v) for v in versions]


@router.get("/designs/{design_id}/versions/{version_id}")
async def get_version(design_id: uuid.UUID, version_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    d = await design_svc.get_design(session, ctx.workspace.id, design_id)
    versions = {str(v.id): v for v in await design_svc.list_versions(session, ctx.workspace.id, design_id)}
    v = versions.get(str(version_id))
    if v is None:
        raise NotFoundError("Version not found")
    return {"id": v.id, "canvas_json": v.canvas_json, "width": v.width, "height": v.height, "note": v.note, "created_at": v.created_at}


@router.post("/designs/{design_id}/restore", response_model=DesignOut)
async def restore_version(design_id: uuid.UUID, data: VersionRestore, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    d = await design_svc.restore_version(
        session, workspace_id=ctx.workspace.id, design_id=design_id, version_id=data.version_id, user_id=user.id
    )
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="design_version_restored", entity_type="design", entity_id=d.id, entity_name=d.name,
        details={"version_id": str(data.version_id)},
    )
    await session.commit()
    return serializers.design_out(d)


@router.post("/designs/{design_id}/export", response_model=dict, status_code=status.HTTP_201_CREATED)
async def export_design(
    design_id: uuid.UUID,
    file: UploadFile,
    ctx: WorkspaceCtx,
    user: CurrentUser,
    session: SessionDep,
    content_id: uuid.UUID | None = Form(default=None),
):
    """Store a rendered PNG/JPG of the design; optionally attach it to a
    content item so it can be scheduled and published."""
    _require_write(ctx)
    d = await design_svc.get_design(session, ctx.workspace.id, design_id)
    mime = file.content_type or "image/png"
    if mime not in ("image/png", "image/jpeg"):
        raise ValidationAppError("Exports must be PNG or JPEG")
    data = await file.read()
    if not data or len(data) > 25 * 1024 * 1024:
        raise ValidationAppError("Export file is empty or too large")

    ext = "jpg" if mime == "image/jpeg" else "png"
    absolute, rel = new_design_path(ctx.workspace.id, d.id, ext)
    absolute.write_bytes(data)
    d.export_path = rel
    d.thumbnail_path = rel

    asset = None
    from contentcal.services import assets as asset_svc
    asset = await asset_svc.create_asset(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        file_name=f"{sanitize_filename(d.name)}.{ext}", file_path=rel, mime_type=mime,
        size_bytes=len(data), folder="Exports", kind=AssetKind.LIBRARY,
    )

    media = None
    if content_id:
        content = await content_svc.get_content(session, ctx.workspace.id, content_id)
        if len(content.media) >= 10:
            raise ValidationAppError("A content item can hold at most 10 media files")
        cabs, crel = new_storage_path(content.id, f"{sanitize_filename(d.name)}.{ext}")
        cabs.write_bytes(data)
        media = await content_svc.add_media(
            session, content=content, file_name=f"{sanitize_filename(d.name)}.{ext}",
            file_path=crel, mime_type=mime, size_bytes=len(data),
        )

    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="design_exported", entity_type="design", entity_id=d.id, entity_name=d.name,
        details={"attached_to": str(content_id) if content_id else None},
    )
    await session.commit()
    return {
        "export_url": f"/media/{rel}",
        "asset": serializers.asset_out(asset),
        "content_media_id": str(media.id) if media else None,
    }
