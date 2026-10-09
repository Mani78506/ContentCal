"""Scheduling + calendar endpoints. Scheduling writes durable rows only —
the worker performs the actual publish."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Query, Request, status

from app import serializers
from app.deps import CurrentUser, SessionDep, WorkspaceCtx
from contentcal.errors import ForbiddenError, ValidationAppError
from contentcal.schemas.content import CalendarEvent, PublishNowRequest, RescheduleRequest, ScheduleRequest, ScheduledPostOut
from contentcal.services import activity as activity_svc
from contentcal.services import scheduling as svc
from contentcal.services.content import get_content
from contentcal.queue.arq_queue import try_enqueue

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["scheduling"])


def _require_write(ctx) -> None:
    if not ctx.can_write:
        raise ForbiddenError("Your workspace role is read-only")


@router.post("/content/{content_id}/schedule", response_model=list[ScheduledPostOut], status_code=status.HTTP_201_CREATED)
async def schedule(content_id: uuid.UUID, data: ScheduleRequest, request: Request, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    content = await get_content(session, ctx.workspace.id, content_id)
    posts = await svc.schedule_content(
        session, content=content, account_ids=data.social_account_ids, scheduled_at=data.scheduled_at
    )
    if not posts:
        raise ValidationAppError("All selected accounts already have a scheduled post for this content")
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="post_scheduled", entity_type="content", entity_id=content.id, entity_name=content.title,
        details={"platforms": [sp.social_account.provider.value for sp in posts],
                 "scheduled_at": data.scheduled_at.isoformat()},
    )
    await session.commit()
    return [serializers.scheduled_post_out(sp) for sp in posts]


@router.get("/calendar", response_model=list[CalendarEvent])
async def calendar(
    ctx: WorkspaceCtx,
    session: SessionDep,
    start: datetime = Query(...),
    end: datetime = Query(...),
):
    if (end - start).days > 95:
        raise ValidationAppError("Calendar range cannot exceed 95 days")
    posts = await svc.calendar_events(session, ctx.workspace.id, start, end)
    return [serializers.calendar_event(sp) for sp in posts]


@router.get("/scheduled-posts/{post_id}", response_model=ScheduledPostOut)
async def get_post(post_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    sp = await svc.get_scheduled_post(session, ctx.workspace.id, post_id)
    return serializers.scheduled_post_out(sp)


@router.patch("/scheduled-posts/{post_id}", response_model=ScheduledPostOut)
async def reschedule(post_id: uuid.UUID, data: RescheduleRequest, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    sp = await svc.reschedule_post(session, workspace_id=ctx.workspace.id, post_id=post_id, scheduled_at=data.scheduled_at)
    sp = await svc.get_scheduled_post(session, ctx.workspace.id, post_id)
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="post_rescheduled", entity_type="scheduled_post", entity_id=sp.id,
        entity_name=sp.content.title, details={"scheduled_at": data.scheduled_at.isoformat()},
    )
    await session.commit()
    return serializers.scheduled_post_out(sp)


@router.post("/scheduled-posts/{post_id}/cancel", response_model=ScheduledPostOut)
async def cancel(post_id: uuid.UUID, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    _require_write(ctx)
    await svc.cancel_post(session, workspace_id=ctx.workspace.id, post_id=post_id)
    sp = await svc.get_scheduled_post(session, ctx.workspace.id, post_id)
    await activity_svc.log_activity(
        session, workspace_id=ctx.workspace.id, user_id=user.id,
        action="post_cancelled", entity_type="scheduled_post", entity_id=sp.id,
        entity_name=sp.content.title if sp.content else "",
    )
    await session.commit()
    return serializers.scheduled_post_out(sp)


@router.post("/content/{content_id}/publish-now", response_model=list[ScheduledPostOut], status_code=status.HTTP_201_CREATED)
async def publish_now(content_id: uuid.UUID, data: PublishNowRequest, request: Request, ctx: WorkspaceCtx, session: SessionDep):
    """Creates posts scheduled for right now. The broker is notified
    best-effort; the scheduler tick is the durable fallback."""
    _require_write(ctx)
    content = await get_content(session, ctx.workspace.id, content_id)
    now = datetime.now(UTC)
    posts = await svc.schedule_content(session, content=content, account_ids=data.social_account_ids, scheduled_at=now)
    if not posts:
        raise ValidationAppError("All selected accounts already have a post for this content")

    from sqlalchemy import select
    from contentcal.models import PublishingJob
    queue = getattr(request.app.state, "queue", None)
    for sp in posts:
        job = await session.scalar(select(PublishingJob).where(PublishingJob.scheduled_post_id == sp.id))
        if job:
            await try_enqueue(queue, job.id)
    return [serializers.scheduled_post_out(sp) for sp in posts]
