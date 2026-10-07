"""Shared FastAPI dependencies: auth from httpOnly cookies + workspace scoping.

Route handlers receive fully-authorized domain objects; no route performs
its own access checks."""

import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.database import get_session
from contentcal.models import User, Workspace, WorkspaceMember, WorkspaceRole
from contentcal.security import decode_token
from contentcal.services.workspaces import get_membership, get_workspace
from contentcal.errors import AppError, ForbiddenError, NotFoundError

ACCESS_COOKIE = "cc_access"
REFRESH_COOKIE = "cc_refresh"

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(request: Request, session: SessionDep) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "not_authenticated", "message": "Not authenticated"})
    try:
        user_id = decode_token(token, expected_type="access")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "invalid_token", "message": "Session expired. Please sign in again."}) from None
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "invalid_token", "message": "User no longer exists"})
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


class WorkspaceContext:
    def __init__(self, workspace: Workspace, membership: WorkspaceMember):
        self.workspace = workspace
        self.membership = membership

    def require(self, *roles: WorkspaceRole) -> None:
        if self.membership.role not in roles:
            raise ForbiddenError("Insufficient role for this action")

    @property
    def can_write(self) -> bool:
        return self.membership.role in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)


async def get_workspace_context(
    workspace_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> WorkspaceContext:
    try:
        workspace = await get_workspace(session, workspace_id)
        membership = await get_membership(session, workspace_id=workspace_id, user_id=user.id)
    except NotFoundError:
        raise
    except ForbiddenError:
        # Mask existence: 404, not 403, for non-members
        raise NotFoundError("Workspace not found") from None
    return WorkspaceContext(workspace, membership)


WorkspaceCtx = Annotated[WorkspaceContext, Depends(get_workspace_context)]
