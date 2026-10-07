"""Job state machine: claim idempotency, success path, retry/dead path."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from contentcal.models import (
    Content,
    JobStatus,
    PublishingJob,
    ScheduledPostStatus,
    SocialProvider,
)
from contentcal.models.social import AccountStatus, SocialAccount
from contentcal.models.user import User
from contentcal.models.workspace import Workspace
from contentcal.providers.base import PublishResult, SocialProviderBase
from contentcal.services.jobs import claim_job, execute_job
from contentcal.services.scheduling import schedule_content


async def _make_job(session) -> PublishingJob:
    user = User(email=f"w{uuid.uuid4().hex[:8]}@t.dev", password_hash="x", full_name="Worker Test")
    session.add(user)
    await session.flush()
    ws = Workspace(name="WS", slug=f"ws-{uuid.uuid4().hex[:8]}", owner_id=user.id)
    session.add(ws)
    await session.flush()
    account = SocialAccount(
        workspace_id=ws.id,
        provider=SocialProvider.MOCK,
        provider_account_id="ext123",
        display_name="Mock",
        status=AccountStatus.ACTIVE,
    )
    session.add(account)
    content = Content(workspace_id=ws.id, created_by=user.id, title="T", caption="c")
    session.add(content)
    await session.flush()
    posts = await schedule_content(session, content=content, account_ids=[account.id], scheduled_at=datetime.now(UTC))
    return await session.scalar(select(PublishingJob).where(PublishingJob.scheduled_post_id == posts[0].id))


async def test_successful_publish_flow(session):
    job = await _make_job(session)
    claimed = await claim_job(session, job.id, worker_id="test-worker")
    assert claimed is not None
    assert claimed.status == JobStatus.PROCESSING

    # second claim is idempotent — this is the duplicate-publish defense
    assert await claim_job(session, job.id, worker_id="another-worker") is None

    result = await execute_job(session, claimed)
    assert result == JobStatus.SUCCESS
    assert len(claimed.attempts) == 1
    assert claimed.attempts[0].status == "success"
    assert claimed.attempts[0].provider_response["provider"] == "mock"
    assert claimed.scheduled_post.status == ScheduledPostStatus.PUBLISHED
    assert claimed.scheduled_post.platform_post_id.startswith("mock_")
    assert claimed.scheduled_post.platform_post_url


async def test_failure_retries_then_dead(session, monkeypatch):
    from contentcal.services import jobs as jobs_module

    class FlakyProvider(SocialProviderBase):
        provider = SocialProvider.MOCK

        async def validate(self, account):
            return True

        async def publish(self, account, request) -> PublishResult:
            return PublishResult(success=False, error="upstream 500", retryable=True)

    monkeypatch.setattr(jobs_module, "get_provider", lambda provider: FlakyProvider())
    monkeypatch.setattr(jobs_module, "_backoff", lambda n: timedelta(seconds=0))

    job = await _make_job(session)
    for expected in (JobStatus.PENDING, JobStatus.PENDING):
        claimed = await claim_job(session, job.id, worker_id="t")
        assert await execute_job(session, claimed) == expected
        assert claimed.status == JobStatus.PENDING

    claimed = await claim_job(session, job.id, worker_id="t")
    assert await execute_job(session, claimed) == JobStatus.DEAD
    assert claimed.retry_count == 3
    assert claimed.scheduled_post.status == ScheduledPostStatus.FAILED
    assert "upstream 500" in claimed.last_error
    assert len(claimed.attempts) == 3  # every attempt journaled


async def test_non_retryable_error_dies_immediately(session, monkeypatch):
    from contentcal.services import jobs as jobs_module

    class BadProvider(SocialProviderBase):
        provider = SocialProvider.MOCK

        async def validate(self, account):
            return True

        async def publish(self, account, request) -> PublishResult:
            return PublishResult(success=False, error="invalid credential", retryable=False)

    monkeypatch.setattr(jobs_module, "get_provider", lambda provider: BadProvider())
    job = await _make_job(session)
    claimed = await claim_job(session, job.id, worker_id="t")
    assert await execute_job(session, claimed) == JobStatus.DEAD
    assert claimed.retry_count == 1
    assert claimed.scheduled_post.status == ScheduledPostStatus.FAILED
