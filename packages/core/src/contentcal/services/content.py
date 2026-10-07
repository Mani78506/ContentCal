import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from contentcal.errors import ForbiddenError, NotFoundError
from contentcal.models import Content, ContentMedia, ContentStatus, ScheduledPost, ScheduledPostStatus, SocialAccount
from contentcal.models.base import utcnow
from contentcal.schemas.content import ContentCreate, ContentUpdate


def _content_query():
    return select(Content).options(
        selectinload(Content.media),
        selectinload(Content.scheduled_posts).selectinload(ScheduledPost.social_account),
    )


async def list_content(
    session: AsyncSession, workspace_id: uuid.UUID, *, status: ContentStatus | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[Content], int]:
    base = select(Content).where(Content.workspace_id == workspace_id)
    if status:
        base = base.where(Content.status == status)
    total = await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await session.execute(
        _content_query()
        .where(Content.workspace_id == workspace_id, *( [Content.status == status] if status else [] ))
        .order_by(Content.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows.scalars().all()), total


async def create_content(session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID, data: ContentCreate) -> Content:
    content = Content(workspace_id=workspace_id, created_by=user_id, title=data.title.strip(), caption=data.caption, tags=data.tags)
    session.add(content)
    await session.commit()
    return await get_content(session, workspace_id, content.id)


async def get_content(session: AsyncSession, workspace_id: uuid.UUID, content_id: uuid.UUID) -> Content:
    content = await session.scalar(_content_query().where(Content.id == content_id, Content.workspace_id == workspace_id))
    if content is None:
        raise NotFoundError("Content not found")
    return content


async def update_content(session: AsyncSession, *, workspace_id: uuid.UUID, content_id: uuid.UUID, data: ContentUpdate) -> Content:
    content = await get_content(session, workspace_id, content_id)
    if data.status == ContentStatus.SCHEDULED or data.status == ContentStatus.PUBLISHED:
        raise ForbiddenError("Use the scheduling endpoints to change publication status")
    patch = data.model_dump(exclude_unset=True, exclude={"status"})
    for key, value in patch.items():
        setattr(content, key, value)
    if data.status in (ContentStatus.DRAFT, ContentStatus.ARCHIVED, ContentStatus.FAILED):
        if data.status == ContentStatus.DRAFT and content.status == ContentStatus.ARCHIVED:
            content.status = ContentStatus.DRAFT
        elif data.status == ContentStatus.ARCHIVED:
            content.status = ContentStatus.ARCHIVED
    await session.commit()
    return await get_content(session, workspace_id, content_id)


async def delete_content(session: AsyncSession, *, workspace_id: uuid.UUID, content_id: uuid.UUID) -> None:
    content = await get_content(session, workspace_id, content_id)
    for sp in content.scheduled_posts:
        if sp.status == ScheduledPostStatus.PUBLISHING:
            raise ForbiddenError("A post for this content is currently publishing; try again shortly")
        if sp.status == ScheduledPostStatus.SCHEDULED:
            sp.status = ScheduledPostStatus.CANCELLED
    await session.delete(content)
    await session.commit()


async def add_media(
    session: AsyncSession, *, content: Content, file_name: str, file_path: str, mime_type: str, size_bytes: int
) -> ContentMedia:
    media = ContentMedia(
        content_id=content.id,
        file_name=file_name,
        file_path=file_path,
        mime_type=mime_type,
        size_bytes=size_bytes,
        sort_order=len(content.media),
    )
    session.add(media)
    content.updated_at = utcnow()
    await session.commit()
    return media


async def delete_media(session: AsyncSession, *, workspace_id: uuid.UUID, content_id: uuid.UUID, media_id: uuid.UUID) -> ContentMedia:
    content = await get_content(session, workspace_id, content_id)
    media = next((m for m in content.media if m.id == media_id), None)
    if media is None:
        raise NotFoundError("Media not found")
    await session.delete(media)
    await session.commit()
    return media


async def recent_content(session: AsyncSession, workspace_id: uuid.UUID, limit: int = 6) -> list[Content]:
    rows = await session.execute(
        _content_query().where(Content.workspace_id == workspace_id).order_by(Content.updated_at.desc()).limit(limit)
    )
    return list(rows.scalars().all())
