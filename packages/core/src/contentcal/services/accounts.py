import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.errors import ConflictError, NotFoundError, ValidationAppError
from contentcal.models import AccountStatus, ScheduledPost, ScheduledPostStatus, SocialAccount, SocialProvider
from contentcal.models.base import utcnow
from contentcal.providers import get_provider
from contentcal.providers.base import SocialProviderBase
from contentcal.security import encrypt_secret


async def list_accounts(session: AsyncSession, workspace_id: uuid.UUID) -> list[SocialAccount]:
    rows = await session.execute(
        select(SocialAccount).where(SocialAccount.workspace_id == workspace_id).order_by(SocialAccount.created_at)
    )
    return list(rows.scalars().all())


async def connect_mock_account(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID, display_name: str
) -> SocialAccount:
    """Dev-only connect flow. Real providers will land here after OAuth."""
    display_name = display_name.strip() or "Mock Account"
    ext_id = f"mock_{uuid.uuid4().hex[:10]}"
    account = SocialAccount(
        workspace_id=workspace_id,
        provider=SocialProvider.MOCK,
        provider_account_id=ext_id,
        display_name=display_name,
        status=AccountStatus.ACTIVE,
        access_token_encrypted=encrypt_secret(f"mock-token-{ext_id}"),
        scopes=["mock:read", "mock:publish"],
        connected_by=user_id,
        last_validated_at=utcnow(),
    )
    session.add(account)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise ConflictError("This account is already connected") from None
    return account


async def disconnect_account(session: AsyncSession, *, workspace_id: uuid.UUID, account_id: uuid.UUID) -> None:
    account = await get_account(session, workspace_id, account_id)
    pending = await session.scalar(
        select(func.count(ScheduledPost.id)).where(
            ScheduledPost.social_account_id == account.id,
            ScheduledPost.status.in_([ScheduledPostStatus.SCHEDULED, ScheduledPostStatus.PUBLISHING]),
        )
    )
    if pending:
        raise ConflictError(f"Account has {pending} scheduled post(s). Cancel them before disconnecting.")
    await session.delete(account)
    await session.commit()


async def get_account(session: AsyncSession, workspace_id: uuid.UUID, account_id: uuid.UUID) -> SocialAccount:
    account = await session.get(SocialAccount, account_id)
    if account is None or account.workspace_id != workspace_id:
        raise NotFoundError("Social account not found")
    return account


async def validate_account(session: AsyncSession, *, workspace_id: uuid.UUID, account_id: uuid.UUID) -> bool:
    account = await get_account(session, workspace_id, account_id)
    provider: SocialProviderBase = get_provider(account.provider)
    ok = await provider.validate(account)
    account.last_validated_at = utcnow()
    if not ok:
        account.status = AccountStatus.EXPIRED
    await session.commit()
    return ok
