"""Read-only visibility into the publishing pipeline (jobs + attempts)."""

from fastapi import APIRouter, Query

from app.deps import SessionDep, WorkspaceCtx
from contentcal.models import JobStatus
from contentcal.schemas.content import PublishingJobOut
from contentcal.services import scheduling as svc

router = APIRouter(prefix="/workspaces/{workspace_id}/jobs", tags=["jobs"])


@router.get("", response_model=dict)
async def list_jobs(
    ctx: WorkspaceCtx,
    session: SessionDep,
    status_filter: JobStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, le=500),
    offset: int = 0,
):
    jobs, total = await svc.list_jobs(session, ctx.workspace.id, status=status_filter, limit=limit, offset=offset)
    return {
        "items": [PublishingJobOut.model_validate(j) for j in jobs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
