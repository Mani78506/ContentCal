"""Media library assets + brand kits + activity feed endpoints."""

import uuid

from fastapi import APIRouter, Form, Query, UploadFile, status

from app import serializers
from app.deps import CurrentUser, SessionDep, WorkspaceCtx
from contentcal.config import get_settings
from contentcal.errors import ForbiddenError, ValidationAppError
from contentcal.models import AssetKind
from contentcal.schemas.studio import AssetOut, AssetUpdate, BrandKitCreate, BrandKitOut, BrandKitUpdate
from contentcal.services import activity as activity_svc
from contentcal.services import assets as asset_svc
from contentcal.services import brandkits as kit_svc
from contentcal.services.media import new_asset_path, storage_root, validate_mime

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["library"])
settings = get_settings()

IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _require_write(ctx) -> None:
    if not ctx.can_write:
        raise ForbiddenError("Your workspace role is read-only")


async def _read_upload(file: UploadFile, *, images_only: bool = False) -> tuple[bytes, str]:
    mime = file.content_type or "application/octet-stream"
    if images_only:
        ok = mime in IMAGE_MIMES
    else:
        ok = validate_mime(mime)
    if not ok:
        allowed = "PNG, JPEG, WebP, GIF" if images_only else "JPEG, PNG, WebP, GIF, MP4, MOV, WebM"
        raise ValidationAppError(f"Unsupported file type '{mime}'. Allowed: {allowed}.")
    data = await file.read()
    if not data:
        raise ValidationAppError("Empty file")
    if len(data) > settings.max_upload_bytes:
        raise ValidationAppError(f"File exceeds the {settings.max_upload_mb}MB limit")
    return data, mime


# ---------- Media library ----------


@router.get("/library/assets", response_model=dict)
async def list_assets(
    ctx: WorkspaceCtx, session: SessionDep,
    folder: str | None = None,
    q: str | None = None,
    mime: str | None = Query(default=None, pattern="^(image|video)$"),
    kind: AssetKind | None = None,
    brand_kit_id: uuid.UUID | None = None,
    limit: int = Query(default=100, le=300),
    offset: int = 0,
):
    items, total = await asset_svc.list_assets(
        session, ctx.workspace.id, folder=folder, query=q, mime_prefix=mime,
        kind=kind, brand_kit_id=brand_kit_id, limit=limit, offset=offset,
    )
    return {"items": [serializers.asset_out(a) for a in items], "total": total}


@router.get("/library/folders", response_model=list[str])
async def list_folders(ctx: WorkspaceCtx, session: SessionDep):
    return await asset_svc.list_folders(session, ctx.workspace.id)


@router.post("/library/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    file: UploadFile,
    ctx: WorkspaceCtx,
    user: CurrentUser,
    session: SessionDep,
    folder: str = Form(default=""),
):
    _require_write(ctx)
    data, mime = await _read_upload(file)
    absolute, rel = new_asset_path(ctx.workspace.id, file.filename or "upload")
    absolute.write_bytes(data)
    asset = await asset_svc.create_asset(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        file_name=file.filename or "upload", file_path=rel, mime_type=mime,
        size_bytes=len(data), folder=folder,
    )
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="media_uploaded", entity_type="asset", entity_id=asset.id,
        entity_name=asset.file_name, details={"folder": asset.folder, "mime": mime},
    )
    await session.commit()
    return serializers.asset_out(asset)


@router.patch("/library/assets/{asset_id}", response_model=AssetOut)
async def update_asset(asset_id: uuid.UUID, data: AssetUpdate, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    asset = await asset_svc.update_asset(session, ctx.workspace.id, asset_id, data)
    await session.commit()
    return serializers.asset_out(asset)


@router.delete("/library/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(asset_id: uuid.UUID, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    asset = await asset_svc.delete_asset(session, ctx.workspace.id, asset_id)
    (storage_root() / asset.file_path).unlink(missing_ok=True)
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="asset_deleted", entity_type="asset", entity_id=asset.id, entity_name=asset.file_name,
        commit=True,
    )


# ---------- Brand kits ----------


@router.get("/brand-kits", response_model=list[BrandKitOut])
async def list_kits(ctx: WorkspaceCtx, session: SessionDep):
    kits = await kit_svc.list_kits(session, ctx.workspace.id)
    return [serializers.kit_out(k, assets) for k, assets in kits]


@router.post("/brand-kits", response_model=BrandKitOut, status_code=status.HTTP_201_CREATED)
async def create_kit(data: BrandKitCreate, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    kit = await kit_svc.create_kit(session, workspace_id=ctx.workspace.id, user_id=user.id, data=data)
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="brand_kit_created", entity_type="brand_kit", entity_id=kit.id, entity_name=kit.name,
    )
    await session.commit()
    return serializers.kit_out(kit, [])


@router.patch("/brand-kits/{kit_id}", response_model=BrandKitOut)
async def update_kit(kit_id: uuid.UUID, data: BrandKitUpdate, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    kit = await kit_svc.update_kit(session, ctx.workspace.id, kit_id, data)
    await session.commit()
    assets = (await asset_svc.list_assets(session, ctx.workspace.id, brand_kit_id=kit.id))[0]
    return serializers.kit_out(kit, assets)


@router.delete("/brand-kits/{kit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kit(kit_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    await kit_svc.delete_kit(session, ctx.workspace.id, kit_id)


@router.post("/brand-kits/{kit_id}/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def upload_kit_asset(
    kit_id: uuid.UUID,
    file: UploadFile,
    ctx: WorkspaceCtx,
    user: CurrentUser,
    session: SessionDep,
    kind: str = Form(default="logo"),  # logo | image
):
    _require_write(ctx)
    kit = await kit_svc.get_kit(session, ctx.workspace.id, kit_id)
    data, mime = await _read_upload(file, images_only=True)
    absolute, rel = new_asset_path(ctx.workspace.id, file.filename or "brand-asset")
    absolute.write_bytes(data)
    asset = await asset_svc.create_asset(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        file_name=file.filename or "brand asset", file_path=rel, mime_type=mime,
        size_bytes=len(data), kind=AssetKind.BRAND_LOGO if kind == "logo" else AssetKind.BRAND_IMAGE,
        brand_kit_id=kit.id,
    )
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="brand_asset_uploaded", entity_type="brand_kit", entity_id=kit.id,
        entity_name=kit.name, details={"file": asset.file_name, "kind": kind},
    )
    await session.commit()
    return serializers.asset_out(asset)


@router.get("/activity", response_model=dict)
async def list_activity(
    ctx: WorkspaceCtx, session: SessionDep,
    action: str | None = None,
    limit: int = Query(default=100, le=300),
    offset: int = 0,
):
    rows, total = await activity_svc.list_activity(
        session, ctx.workspace.id, action=action, limit=limit, offset=offset
    )
    return {"items": [serializers.activity_out(log, name) for log, name in rows], "total": total}
