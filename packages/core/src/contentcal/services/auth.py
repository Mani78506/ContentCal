import re
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.errors import ConflictError, UnauthorizedError
from contentcal.models import User, Workspace, WorkspaceMember, WorkspaceRole
from contentcal.security import hash_password, verify_password


def generate_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "workspace"
    return slug[:80]


async def _unique_slug(session: AsyncSession, base: str) -> str:
    slug, i = base, 2
    while True:
        exists = await session.scalar(select(Workspace.id).where(Workspace.slug == slug))
        if not exists:
            return slug
        slug = f"{base}-{i}"
        i += 1


async def register_user(session: AsyncSession, *, email: str, password: str, full_name: str, workspace_name: str) -> tuple[User, Workspace]:
    email = email.lower().strip()
    exists = await session.scalar(select(User.id).where(User.email == email))
    if exists:
        raise ConflictError("An account with this email already exists")

    user = User(email=email, password_hash=hash_password(password), full_name=full_name.strip())
    session.add(user)
    await session.flush()

    workspace = Workspace(name=workspace_name.strip(), slug=await _unique_slug(session, generate_slug(workspace_name)), owner_id=user.id)
    session.add(workspace)
    await session.flush()

    session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER))
    await session.commit()
    return user, workspace


async def authenticate(session: AsyncSession, *, email: str, password: str) -> User:
    user = await session.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Invalid email or password")
    user.last_login_at = datetime.now(UTC)
    await session.commit()
    return user
