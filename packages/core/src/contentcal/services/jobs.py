"""Publishing execution and retry-safe state machine.

Guarantees:
- A job is claimed atomically-ish (status flip PENDING→PROCESSING checked by
  re-read) so two workers don't double-publish.
- The provider receives the job's idempotency_key, so even a genuine
  double-invocation cannot create a duplicate post.
- Every attempt is journaled in publishing_attempts.
- Failures retry with exponential backoff up to max_retries, then DEAD."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from contentcal.models import (
    Content,
    JobStatus,
    PublishingAttempt,
    PublishingJob,
    ScheduledPost,
    ScheduledPostStatus,
)
from contentcal.models.base import utcnow
from contentcal.providers import ProviderNotImplementedError, PublishRequest, get_provider
from contentcal.services.scheduling import _rollup

log = logging.getLogger(__name__)


def _backoff(retry_count: int) -> timedelta:
    return timedelta(seconds=min(2 ** retry_count * 60, 3600))  # 2m, 4m, 8m ... cap 1h


async def claim_job(session: AsyncSession, job_id: uuid.UUID, worker_id: str) -> PublishingJob | None:
    result = await session.execute(
        sa.update(PublishingJob)
        .where(
            PublishingJob.id == job_id,
            PublishingJob.status.in_([JobStatus.PENDING, JobStatus.FAILED]),
        )
        .values(status=JobStatus.PROCESSING, locked_at=utcnow(), locked_by=worker_id)
        .returning(PublishingJob.id)
    )
    claimed = result.scalar_one_or_none()
    if claimed is None:
        return None
    await session.commit()
    return await session.scalar(
        select(PublishingJob)
        .options(
            selectinload(PublishingJob.attempts),
            selectinload(PublishingJob.scheduled_post).selectinload(ScheduledPost.content).selectinload(Content.media),
            selectinload(PublishingJob.scheduled_post).selectinload(ScheduledPost.social_account),
        )
        .where(PublishingJob.id == job_id)
    )


async def execute_job(session: AsyncSession, job: PublishingJob) -> JobStatus:
    sp: ScheduledPost = job.scheduled_post
    account = sp.social_account
    sp.status = ScheduledPostStatus.PUBLISHING
    await session.flush()

    attempt = PublishingAttempt(
        job=job,  # sets job_id and registers in job.attempts
        attempt_number=job.retry_count + 1,
        status="failed",
        started_at=utcnow(),
    )
    session.add(attempt)

    try:
        provider = get_provider(account.provider)
        result = await provider.publish(
            account,
            PublishRequest(
                content_title=sp.content.title,
                caption=sp.content.caption,
                media=[{"file_path": m.file_path, "mime_type": m.mime_type} for m in sp.content.media],
                platform_payload=sp.platform_payload,
                idempotency_key=job.idempotency_key,
            ),
        )
    except ProviderNotImplementedError as exc:
        # Non-retryable by definition — never pretend success.
        result_error = str(exc)
        return await _finish(session, job, sp, attempt, success=False, retryable=False, error=result_error)
    except Exception as exc:  # noqa: BLE001 — infrastructure failure, retry
        log.exception("Provider publish raised for job %s", job.id)
        return await _finish(session, job, sp, attempt, success=False, retryable=True, error=str(exc))

    if result.success:
        attempt.status = "success"
        attempt.provider_response = result.raw
        attempt.finished_at = utcnow()
        job.status = JobStatus.SUCCESS
        job.completed_at = utcnow()
        job.last_error = None
        sp.status = ScheduledPostStatus.PUBLISHED
        sp.published_at = utcnow()
        sp.platform_post_id = result.platform_post_id
        sp.platform_post_url = result.platform_post_url
        sp.error = None
        await _rollup(session, sp.content)
        await session.commit()
        return job.status
    return await _finish(session, job, sp, attempt, success=False, retryable=result.retryable, error=result.error)


async def _finish(
    session: AsyncSession,
    job: PublishingJob,
    sp: ScheduledPost,
    attempt: PublishingAttempt,
    *,
    success: bool,
    retryable: bool,
    error: str | None,
) -> JobStatus:
    attempt.finished_at = utcnow()
    attempt.error = error
    job.last_error = error
    job.retry_count += 1
    if retryable and job.retry_count < job.max_retries:
        job.status = JobStatus.PENDING  # re-eligible for the scheduler
        job.run_at = utcnow() + _backoff(job.retry_count)
        sp.status = ScheduledPostStatus.SCHEDULED  # visible again as upcoming (will retry)
        sp.error = f"Retry {job.retry_count}/{job.max_retries} scheduled: {error}"
    else:
        job.status = JobStatus.DEAD
        job.completed_at = utcnow()
        sp.status = ScheduledPostStatus.FAILED
        sp.error = error
    await _rollup(session, sp.content)
    job.locked_at = None
    job.locked_by = None
    await session.commit()
    return job.status
