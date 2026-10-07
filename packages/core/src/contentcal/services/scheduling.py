"""Content → ScheduledPost → PublishingJob lifecycle (the DB side).

The browser never publishes. Scheduling writes durable rows; the worker's
scheduler loop picks due jobs up and hands them to a SocialProvider."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from contentcal.errors import ForbiddenError, NotFoundError, ValidationAppError
from contentcal.models import (
    AccountStatus,
    Content,
    ContentStatus,
    JobStatus,
    PublishingAttempt,
    PublishingJob,
    ScheduledPost,
    ScheduledPostStatus,
    SocialAccount,
)
from contentcal.models.base import utcnow


async def _get_accounts(session: AsyncSession, workspace_id: uuid.UUID, account_ids: list[uuid.UUID]) -> list[SocialAccount]:
    rows = await session.execute(select(SocialAccount).where(SocialAccount.id.in_(account_ids)))
    accounts = {a.id: a for a in rows.scalars().all()}
    if len(accounts) != len(set(account_ids)):
        raise NotFoundError("One or more social accounts were not found")
    for account in accounts.values():
        if account.workspace_id != workspace_id:
            # mask existence of foreign resources
            raise NotFoundError("One or more social accounts were not found")
        if account.status != AccountStatus.ACTIVE:
            raise ValidationAppError(f"Account '{account.display_name}' is not active ({account.status.value})")
    return [accounts[i] for i in account_ids]


async def _rollup(session: AsyncSession, content: Content) -> None:
    """Keep Content.status consistent with its scheduled posts."""
    statuses = set(
        (await session.execute(select(ScheduledPost.status).where(ScheduledPost.content_id == content.id))).scalars().all()
    )
    if statuses & {ScheduledPostStatus.SCHEDULED, ScheduledPostStatus.PUBLISHING}:
        content.status = ContentStatus.SCHEDULED
    elif ScheduledPostStatus.FAILED in statuses:
        content.status = ContentStatus.FAILED
    elif ScheduledPostStatus.PUBLISHED in statuses:
        content.status = ContentStatus.PUBLISHED
    elif content.status != ContentStatus.ARCHIVED:
        content.status = ContentStatus.DRAFT


async def schedule_content(
    session: AsyncSession, *, content: Content, account_ids: list[uuid.UUID], scheduled_at: datetime
) -> list[ScheduledPost]:
    if scheduled_at.tzinfo is None:
        raise ValidationAppError("scheduled_at must include a timezone")
    existing = await session.execute(
        select(ScheduledPost.social_account_id).where(
            ScheduledPost.content_id == content.id, ScheduledPost.status != ScheduledPostStatus.CANCELLED
        )
    )
    existing_targets = set(existing.scalars().all())
    accounts = await _get_accounts(session, content.workspace_id, account_ids)
    scheduled_at = scheduled_at.astimezone(UTC)

    created: list[ScheduledPost] = []
    for account in accounts:
        if account.id in existing_targets:
            continue  # idempotent: re-scheduling the same target is a no-op
        sp = ScheduledPost(
            content_id=content.id,
            social_account_id=account.id,
            social_account=account,  # relationship set in-session → no lazy load downstream
            scheduled_at=scheduled_at,
            status=ScheduledPostStatus.SCHEDULED,
        )
        session.add(sp)
        await session.flush()
        job = PublishingJob(
            scheduled_post_id=sp.id,
            idempotency_key=f"publish:{sp.id}",
            status=JobStatus.PENDING,
            run_at=scheduled_at,
            max_retries=3,
        )
        session.add(job)
        created.append(sp)
    content.status = ContentStatus.SCHEDULED
    await session.commit()
    return created


async def reschedule_post(session: AsyncSession, *, workspace_id: uuid.UUID, post_id: uuid.UUID, scheduled_at: datetime) -> ScheduledPost:
    sp = await get_scheduled_post(session, workspace_id, post_id)
    if sp.status not in (ScheduledPostStatus.SCHEDULED, ScheduledPostStatus.FAILED):
        raise ValidationAppError(f"Cannot reschedule a post that is {sp.status.value}")
    new_at = scheduled_at.astimezone(UTC) if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=UTC)
    if new_at <= datetime.now(UTC):
        raise ValidationAppError("New time must be in the future")
    sp.scheduled_at = new_at
    sp.status = ScheduledPostStatus.SCHEDULED
    sp.error = None
    job = await session.scalar(select(PublishingJob).where(PublishingJob.scheduled_post_id == sp.id))
    if job:
        job.status = JobStatus.PENDING
        job.run_at = new_at
        job.retry_count = 0
        job.last_error = None
        job.locked_at = None
        job.locked_by = None
    await _rollup(session, sp.content)
    await session.commit()
    return sp


async def cancel_post(session: AsyncSession, *, workspace_id: uuid.UUID, post_id: uuid.UUID) -> ScheduledPost:
    sp = await get_scheduled_post(session, workspace_id, post_id)
    if sp.status == ScheduledPostStatus.PUBLISHING:
        raise ValidationAppError("Post is currently publishing and cannot be cancelled")
    if sp.status not in (ScheduledPostStatus.SCHEDULED, ScheduledPostStatus.FAILED):
        raise ValidationAppError(f"Cannot cancel a post that is {sp.status.value}")
    sp.status = ScheduledPostStatus.CANCELLED
    job = await session.scalar(select(PublishingJob).where(PublishingJob.scheduled_post_id == sp.id))
    if job and job.status in (JobStatus.PENDING, JobStatus.FAILED):
        job.status = JobStatus.CANCELLED
    await _rollup(session, sp.content)
    await session.commit()
    return sp


async def get_scheduled_post(session: AsyncSession, workspace_id: uuid.UUID, post_id: uuid.UUID) -> ScheduledPost:
    sp = await session.scalar(
        select(ScheduledPost)
        .options(selectinload(ScheduledPost.content), selectinload(ScheduledPost.social_account))
        .join(Content, ScheduledPost.content_id == Content.id)
        .where(ScheduledPost.id == post_id, Content.workspace_id == workspace_id)
    )
    if sp is None:
        raise NotFoundError("Scheduled post not found")
    return sp


async def calendar_events(session: AsyncSession, workspace_id: uuid.UUID, start: datetime, end: datetime) -> list[ScheduledPost]:
    rows = await session.execute(
        select(ScheduledPost)
        .options(
            selectinload(ScheduledPost.content).selectinload(Content.media),
            selectinload(ScheduledPost.social_account),
        )
        .join(Content, ScheduledPost.content_id == Content.id)
        .where(
            Content.workspace_id == workspace_id,
            ScheduledPost.scheduled_at >= start,
            ScheduledPost.scheduled_at < end,
            ScheduledPost.status != ScheduledPostStatus.CANCELLED,
        )
        .order_by(ScheduledPost.scheduled_at)
    )
    return list(rows.scalars().all())


async def list_jobs(session: AsyncSession, workspace_id: uuid.UUID, *, status: JobStatus | None = None, limit: int = 100, offset: int = 0) -> tuple[list[PublishingJob], int]:
    base = (
        select(PublishingJob)
        .join(ScheduledPost, PublishingJob.scheduled_post_id == ScheduledPost.id)
        .join(Content, ScheduledPost.content_id == Content.id)
        .where(Content.workspace_id == workspace_id)
    )
    if status:
        base = base.where(PublishingJob.status == status)
    total = await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await session.execute(
        base.options(selectinload(PublishingJob.attempts)).order_by(PublishingJob.run_at.desc()).limit(limit).offset(offset)
    )
    return list(rows.scalars().all()), total


async def due_jobs(session: AsyncSession, now: datetime, limit: int = 100) -> list[PublishingJob]:
    rows = await session.execute(
        select(PublishingJob)
        .where(PublishingJob.status == JobStatus.PENDING, PublishingJob.run_at <= now)
        .order_by(PublishingJob.run_at)
        .limit(limit)
    )
    return list(rows.scalars().all())


async def dashboard_summary(session: AsyncSession, workspace_id: uuid.UUID) -> dict:
    one = lambda q: session.scalar(q)  # noqa: E731

    drafts = await one(select(func.count(Content.id)).where(Content.workspace_id == workspace_id, Content.status == ContentStatus.DRAFT)) or 0
    published = await one(select(func.count(Content.id)).where(Content.workspace_id == workspace_id, Content.status == ContentStatus.PUBLISHED)) or 0
    scheduled = await one(
        select(func.count(ScheduledPost.id))
        .join(Content, ScheduledPost.content_id == Content.id)
        .where(Content.workspace_id == workspace_id, ScheduledPost.status == ScheduledPostStatus.SCHEDULED)
    ) or 0
    publishing = await one(
        select(func.count(ScheduledPost.id))
        .join(Content, ScheduledPost.content_id == Content.id)
        .where(Content.workspace_id == workspace_id, ScheduledPost.status == ScheduledPostStatus.PUBLISHING)
    ) or 0
    failed = await one(
        select(func.count(ScheduledPost.id))
        .join(Content, ScheduledPost.content_id == Content.id)
        .where(Content.workspace_id == workspace_id, ScheduledPost.status == ScheduledPostStatus.FAILED)
    ) or 0
    accounts = await one(
        select(func.count(SocialAccount.id)).where(
            SocialAccount.workspace_id == workspace_id, SocialAccount.status == AccountStatus.ACTIVE
        )
    ) or 0
    upcoming = await calendar_events(session, workspace_id, datetime.now(UTC), datetime.now(UTC) + timedelta(days=14))
    return {
        "drafts": drafts,
        "scheduled": scheduled,
        "publishing": publishing,
        "published": published,
        "failed": failed,
        "connected_accounts": accounts,
        "upcoming": upcoming[:8],
    }
