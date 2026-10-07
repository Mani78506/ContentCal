import uuid

from fastapi import APIRouter, Query, UploadFile, status

from app import serializers
from app.deps import CurrentUser, SessionDep, WorkspaceCtx
from contentcal.config import get_settings
from contentcal.errors import ForbiddenError, ValidationAppError
from contentcal.models import ContentStatus
from contentcal.schemas.content import ContentCreate, ContentOut, ContentUpdate, MediaOut
from contentcal.services import content as svc
from contentcal.services.media import new_storage_path, storage_root, validate_mime

router = APIRouter(prefix="/workspaces/{workspace_id}/content", tags=["content"])
settings = get_settings()


def _require_write(ctx) -> None:
    if not ctx.can_write:
        raise ForbiddenError("Your workspace role is read-only")


@router.get("", response_model=dict)
async def list_content(
    ctx: WorkspaceCtx,
    session: SessionDep,
    status_filter: ContentStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    items, total = await svc.list_content(session, ctx.workspace.id, status=status_filter, limit=limit, offset=offset)
    return {"items": [serializers.content_summary(c) for c in items], "total": total, "limit": limit, "offset": offset}


@router.post("", response_model=ContentOut, status_code=status.HTTP_201_CREATED)
async def create(data: ContentCreate, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    content = await svc.create_content(session, workspace_id=ctx.workspace.id, user_id=user.id, data=data)
    return serializers.content_out(content)


@router.get("/{content_id}", response_model=ContentOut)
async def get_one(content_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    content = await svc.get_content(session, ctx.workspace.id, content_id)
    return serializers.content_out(content)


@router.patch("/{content_id}", response_model=ContentOut)
async def update(content_id: uuid.UUID, data: ContentUpdate, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    content = await svc.update_content(session, workspace_id=ctx.workspace.id, content_id=content_id, data=data)
    return serializers.content_out(content)


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(content_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    await svc.delete_content(session, workspace_id=ctx.workspace.id, content_id=content_id)


@router.post("/{content_id}/media", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
async def upload_media(content_id: uuid.UUID, file: UploadFile, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    content = await svc.get_content(session, ctx.workspace.id, content_id)
    mime = file.content_type or "application/octet-stream"
    if not validate_mime(mime):
        raise ValidationAppError(f"Unsupported file type '{mime}'. Allowed: JPEG, PNG, WebP, GIF, MP4, MOV, WebM.")

    data = await file.read()
    if not data:
        raise ValidationAppError("Empty file")
    if len(data) > settings.max_upload_bytes:
        raise ValidationAppError(f"File exceeds the {settings.max_upload_mb}MB limit")
    if len(content.media) >= 10:
        raise ValidationAppError("A content item can hold at most 10 media files")

    absolute, rel = new_storage_path(content.id, file.filename or "upload")
    absolute.write_bytes(data)
    media = await svc.add_media(
        session, content=content, file_name=file.filename or "upload", file_path=rel, mime_type=mime, size_bytes=len(data)
    )
    return media


@router.delete("/{content_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_media(content_id: uuid.UUID, media_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    media = await svc.delete_media(session, workspace_id=ctx.workspace.id, content_id=content_id, media_id=media_id)
    (storage_root() / media.file_path).unlink(missing_ok=True)
