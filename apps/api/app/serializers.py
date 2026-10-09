"""Model → response-schema mapping lives here, not in routers."""

from contentcal.models import (
    ActivityLog,
    AssetKind,
    BrandKit,
    Content,
    Design,
    DesignTemplate,
    DesignVersion,
    MediaAsset,
    ScheduledPost,
)
from contentcal.schemas.content import CalendarEvent, ContentOut, ContentSummary, MediaOut, ScheduledPostOut
from contentcal.schemas.studio import (
    ActivityOut,
    AssetOut,
    BrandKitOut,
    DesignOut,
    DesignSummary,
    DesignVersionOut,
    TemplateOut,
)


def media_url(file_path: str) -> str:
    return f"/media/{file_path}"


def scheduled_post_out(sp: ScheduledPost) -> ScheduledPostOut:
    return ScheduledPostOut(
        id=sp.id,
        content_id=sp.content_id,
        social_account_id=sp.social_account_id,
        provider=sp.social_account.provider,
        account_name=sp.social_account.display_name,
        scheduled_at=sp.scheduled_at,
        status=sp.status,
        published_at=sp.published_at,
        platform_post_url=sp.platform_post_url,
        error=sp.error,
    )


def content_out(content: Content) -> ContentOut:
    return ContentOut(
        id=content.id,
        title=content.title,
        caption=content.caption,
        status=content.status,
        tags=content.tags or [],
        created_at=content.created_at,
        updated_at=content.updated_at,
        media=[MediaOut.model_validate(m) for m in content.media],
        scheduled_posts=[scheduled_post_out(sp) for sp in content.scheduled_posts],
    )


def content_summary(content: Content) -> ContentSummary:
    active = [sp for sp in content.scheduled_posts if sp.status.value in ("scheduled", "publishing")]
    next_at = min((sp.scheduled_at for sp in active), default=None)
    return ContentSummary(
        id=content.id,
        title=content.title,
        status=content.status,
        updated_at=content.updated_at,
        media=[MediaOut.model_validate(m) for m in content.media[:4]],
        platforms=sorted({sp.social_account.provider for sp in content.scheduled_posts}, key=str),
        next_scheduled_at=next_at,
    )


def calendar_event(sp: ScheduledPost) -> CalendarEvent:
    first_media = sp.content.media[0] if sp.content.media else None
    return CalendarEvent(
        id=sp.id,
        content_id=sp.content_id,
        title=sp.content.title,
        caption_preview=sp.content.caption[:140],
        provider=sp.social_account.provider,
        account_name=sp.social_account.display_name,
        scheduled_at=sp.scheduled_at,
        status=sp.status,
        platform_post_url=sp.platform_post_url,
        thumbnail_mime=first_media.mime_type if first_media else None,
        thumbnail_path=media_url(first_media.file_path) if first_media else None,
    )


# ---------- Studio ----------


def template_out(tpl: DesignTemplate, *, is_favorite: bool = False, last_used_at=None) -> TemplateOut:
    return TemplateOut(
        id=tpl.id,
        workspace_id=tpl.workspace_id,
        name=tpl.name,
        category=tpl.category,
        platform=tpl.platform,
        width=tpl.width,
        height=tpl.height,
        thumbnail_path=media_url(tpl.thumbnail_path) if tpl.thumbnail_path else None,
        is_builtin=tpl.is_builtin,
        is_favorite=is_favorite,
        last_used_at=last_used_at,
        created_at=tpl.created_at,
    )


def design_out(d: Design) -> DesignOut:
    return DesignOut(
        id=d.id, name=d.name, width=d.width, height=d.height, canvas_json=d.canvas_json,
        thumbnail_path=media_url(d.thumbnail_path) if d.thumbnail_path else None,
        export_path=media_url(d.export_path) if d.export_path else None,
        template_id=d.template_id, created_at=d.created_at, updated_at=d.updated_at,
    )


def design_summary(d: Design) -> DesignSummary:
    return DesignSummary(
        id=d.id, name=d.name, width=d.width, height=d.height,
        thumbnail_path=media_url(d.thumbnail_path) if d.thumbnail_path else None,
        export_path=media_url(d.export_path) if d.export_path else None,
        updated_at=d.updated_at,
    )


def version_out(v: DesignVersion) -> DesignVersionOut:
    return DesignVersionOut(
        id=v.id, note=v.note, width=v.width, height=v.height,
        created_by=v.created_by, created_at=v.created_at,
    )


def asset_out(a: MediaAsset) -> AssetOut:
    return AssetOut(
        id=a.id, kind=a.kind, folder=a.folder, file_name=a.file_name,
        url=media_url(a.file_path), mime_type=a.mime_type, size_bytes=a.size_bytes,
        uploaded_by=a.uploaded_by, created_at=a.created_at,
    )


def kit_out(kit: BrandKit, assets: list[MediaAsset]) -> BrandKitOut:
    logos = [asset_out(a) for a in assets if a.kind == AssetKind.BRAND_LOGO]
    images = [asset_out(a) for a in assets if a.kind == AssetKind.BRAND_IMAGE]
    return BrandKitOut(
        id=kit.id, name=kit.name, colors=kit.colors or [], fonts=kit.fonts or [],
        is_default=kit.is_default, logos=logos, images=images, created_at=kit.created_at,
    )


def activity_out(log: ActivityLog, user_name: str | None) -> ActivityOut:
    return ActivityOut(
        id=log.id, action=log.action, entity_type=log.entity_type, entity_id=log.entity_id,
        entity_name=log.entity_name, details=log.details or {},
        user_id=log.user_id, user_name=user_name, created_at=log.created_at,
    )
