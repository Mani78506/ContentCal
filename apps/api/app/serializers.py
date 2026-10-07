"""Model → response-schema mapping lives here, not in routers."""

from contentcal.models import Content, ScheduledPost
from contentcal.schemas.content import CalendarEvent, ContentOut, ContentSummary, MediaOut, ScheduledPostOut


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
