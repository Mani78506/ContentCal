from fastapi import APIRouter

from app import serializers
from app.deps import SessionDep, WorkspaceCtx
from contentcal.services import content as content_svc
from contentcal.services import scheduling as svc

router = APIRouter(prefix="/workspaces/{workspace_id}/dashboard", tags=["dashboard"])


@router.get("", response_model=dict)
async def dashboard(ctx: WorkspaceCtx, session: SessionDep):
    summary = await svc.dashboard_summary(session, ctx.workspace.id)
    recent = await content_svc.recent_content(session, ctx.workspace.id, limit=6)
    return {
        "drafts": summary["drafts"],
        "scheduled": summary["scheduled"],
        "publishing": summary["publishing"],
        "published": summary["published"],
        "failed": summary["failed"],
        "connected_accounts": summary["connected_accounts"],
        "upcoming": [serializers.calendar_event(sp) for sp in summary["upcoming"]],
        "recent_content": [serializers.content_summary(c) for c in recent],
    }
