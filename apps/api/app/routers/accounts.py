import uuid

from fastapi import APIRouter, status

from app.deps import CurrentUser, SessionDep, WorkspaceCtx
from contentcal.errors import ForbiddenError, ValidationAppError
from contentcal.providers import ProviderNotImplementedError
from contentcal.providers.registry import list_providers
from contentcal.schemas.accounts import MockConnectRequest, ProviderInfo, SocialAccountOut
from contentcal.services import accounts as svc

router = APIRouter(prefix="/workspaces/{workspace_id}/accounts", tags=["accounts"])


def _require_write(ctx) -> None:
    if not ctx.can_write:
        raise ForbiddenError("Your workspace role is read-only")


@router.get("", response_model=list[SocialAccountOut])
async def list_accounts(ctx: WorkspaceCtx, session: SessionDep):
    accounts = await svc.list_accounts(session, ctx.workspace.id)
    return [SocialAccountOut.model_validate(a) for a in accounts]


@router.get("/providers", response_model=list[ProviderInfo])
async def providers(ctx: WorkspaceCtx):
    return [ProviderInfo(**p) for p in list_providers()]


@router.post("/connect", response_model=SocialAccountOut, status_code=status.HTTP_201_CREATED)
async def connect(data: MockConnectRequest, ctx: WorkspaceCtx, user: CurrentUser, session: SessionDep):
    """Dev-only connect. Real providers will initiate OAuth here instead."""
    _require_write(ctx)
    try:
        account = await svc.connect_mock_account(
            session, workspace_id=ctx.workspace.id, user_id=user.id, display_name=data.display_name
        )
    except ProviderNotImplementedError as exc:
        raise ValidationAppError(str(exc)) from exc
    return SocialAccountOut.model_validate(account)


@router.post("/{account_id}/validate", response_model=dict)
async def validate(account_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    ok = await svc.validate_account(session, workspace_id=ctx.workspace.id, account_id=account_id)
    return {"valid": ok}


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(account_id: uuid.UUID, ctx: WorkspaceCtx, session: SessionDep):
    _require_write(ctx)
    await svc.disconnect_account(session, workspace_id=ctx.workspace.id, account_id=account_id)
