from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from contentcal.models.workspace import WorkspaceRole
from contentcal.schemas.auth import UserOut


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class WorkspaceOut(BaseModel):
    id: UUID
    name: str
    slug: str
    brand_color: str | None
    plan: str
    role: WorkspaceRole | None = None  # caller's role in this workspace

    model_config = {"from_attributes": True}


class MemberOut(BaseModel):
    id: UUID
    role: WorkspaceRole
    joined_at: datetime
    user: UserOut

    model_config = {"from_attributes": True}


class InviteMemberRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: WorkspaceRole = WorkspaceRole.MEMBER


class UpdateMemberRoleRequest(BaseModel):
    role: WorkspaceRole
