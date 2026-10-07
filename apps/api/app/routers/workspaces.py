import uuid

from fastapi import APIRouter, status

from app.deps import CurrentUser, SessionDep, WorkspaceCtx
from contentcal.errors import ForbiddenError, NotFoundError
from contentcal.models import WorkspaceRole
from contentcal.schemas.workspace import (
    InviteMemberRequest,
    MemberOut,
    UpdateMemberRoleRequest,
    WorkspaceCreate,
    WorkspaceOut,
)
from contentcal.services import workspaces as svc

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _ws_out(ws, role=None) -> WorkspaceOut:
    return WorkspaceOut(id=ws.id, name=ws.name, slug=ws.slug, brand_color=ws.brand_color, plan=ws.plan, role=role)


@router.get("", response_model=list[WorkspaceOut])
async def my_workspaces(user: CurrentUser, session: SessionDep):
    pairs = await svc.list_user_workspaces(session, user.id)
    return [_ws_out(ws, role) for ws, role in pairs]


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create(data: WorkspaceCreate, user: CurrentUser, session: SessionDep):
    ws = await svc.create_workspace(session, user_id=user.id, name=data.name)
    return _ws_out(ws, WorkspaceRole.OWNER)


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_one(ctx: WorkspaceCtx):
    return _ws_out(ctx.workspace, ctx.membership.role)


@router.get("/{workspace_id}/members", response_model=list[MemberOut])
async def members(ctx: WorkspaceCtx, session: SessionDep):
    return await svc.list_members(session, ctx.workspace.id)


@router.post("/{workspace_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def invite(data: InviteMemberRequest, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    ctx.require(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
    await svc.invite_member(session, workspace_id=ctx.workspace.id, email=data.email, role=data.role, invited_by=user.id)
    members = await svc.list_members(session, ctx.workspace.id)
    return next(m for m in members if m.user.email == data.email.lower().strip())


@router.patch("/{workspace_id}/members/{member_id}", response_model=MemberOut)
async def update_role(member_id: uuid.UUID, data: UpdateMemberRoleRequest, ctx: WorkspaceCtx, session: SessionDep):
    ctx.require(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
    members = await svc.list_members(session, ctx.workspace.id)
    target = next((m for m in members if m.id == member_id), None)
    if target is None:
        raise NotFoundError("Member not found")
    if target.role == WorkspaceRole.OWNER and data.role != WorkspaceRole.OWNER:
        raise ForbiddenError("Cannot demote the workspace owner")
    target.role = data.role
    await session.commit()
    return target


@router.delete("/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(member_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    await svc.remove_member(session, workspace_id=ctx.workspace.id, member_id=member_id, acting=ctx.membership)
