import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from contentcal.errors import ConflictError, ForbiddenError, NotFoundError
from contentcal.models import User, Workspace, WorkspaceMember, WorkspaceRole
from contentcal.services.auth import _unique_slug, generate_slug


async def list_user_workspaces(session: AsyncSession, user_id: uuid.UUID) -> list[tuple[Workspace, WorkspaceRole]]:
    rows = await session.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user_id)
        .order_by(Workspace.created_at)
    )
    return [(ws, role) for ws, role in rows.all()]


async def create_workspace(session: AsyncSession, *, user_id: uuid.UUID, name: str) -> Workspace:
    ws = Workspace(name=name.strip(), slug=await _unique_slug(session, generate_slug(name)), owner_id=user_id)
    session.add(ws)
    await session.flush()
    session.add(WorkspaceMember(workspace_id=ws.id, user_id=user_id, role=WorkspaceRole.OWNER))
    await session.commit()
    return ws


async def get_membership(session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID) -> WorkspaceMember:
    member = await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id
        )
    )
    if member is None:
        raise ForbiddenError("You do not have access to this workspace")
    return member


async def get_workspace(session: AsyncSession, workspace_id: uuid.UUID) -> Workspace:
    ws = await session.get(Workspace, workspace_id)
    if ws is None:
        raise NotFoundError("Workspace not found")
    return ws


async def list_members(session: AsyncSession, workspace_id: uuid.UUID) -> list[WorkspaceMember]:
    rows = await session.execute(
        select(WorkspaceMember)
        .options(joinedload(WorkspaceMember.user))
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at)
    )
    return list(rows.scalars().all())


async def invite_member(session: AsyncSession, *, workspace_id: uuid.UUID, email: str, role: WorkspaceRole, invited_by: uuid.UUID) -> WorkspaceMember:
    user = await session.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None:
        raise NotFoundError("No user with that email. They must register first (invitation emails are not built yet).")
    existing = await session.scalar(
        select(func.count(WorkspaceMember.id)).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id
        )
    )
    if existing:
        raise ConflictError("User is already a member of this workspace")
    member = WorkspaceMember(workspace_id=workspace_id, user_id=user.id, role=role, invited_by=invited_by)
    session.add(member)
    await session.commit()
    return member


async def remove_member(session: AsyncSession, *, workspace_id: uuid.UUID, member_id: uuid.UUID, acting: WorkspaceMember) -> None:
    member = await session.get(WorkspaceMember, member_id)
    if member is None or member.workspace_id != workspace_id:
        raise NotFoundError("Member not found")
    if member.role == WorkspaceRole.OWNER:
        raise ForbiddenError("The workspace owner cannot be removed")
    if acting.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN) and acting.id != member.id:
        raise ForbiddenError("Insufficient permissions")
    await session.delete(member)
    await session.commit()
