"""Brand kits: colors, fonts, logos and brand images per workspace."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.errors import NotFoundError
from contentcal.models import AssetKind, BrandKit, MediaAsset

MAX_COLORS = 20
MAX_FONTS = 10


def _validate_colors(colors: list[dict]) -> list[dict]:
    out = []
    for c in colors[:MAX_COLORS]:
        hexv = str(c.get("hex", "")).strip()
        if not hexv.startswith("#") or len(hexv) not in (4, 7, 9):
            continue
        out.append({"name": str(c.get("name", hexv))[:60], "hex": hexv})
    return out


def _validate_fonts(fonts: list[dict]) -> list[dict]:
    return [
        {"name": str(f.get("name", f.get("family", "Font")))[:60], "family": str(f.get("family", "Arial"))[:120]}
        for f in fonts[:MAX_FONTS]
    ]


async def list_kits(session: AsyncSession, workspace_id: uuid.UUID) -> list[tuple[BrandKit, list[MediaAsset]]]:
    kits = (await session.execute(
        select(BrandKit).where(BrandKit.workspace_id == workspace_id).order_by(BrandKit.created_at.asc())
    )).scalars().all()
    if not kits:
        return []
    assets = (await session.execute(
        select(MediaAsset).where(
            MediaAsset.workspace_id == workspace_id,
            MediaAsset.brand_kit_id.in_([k.id for k in kits]),
            MediaAsset.kind.in_([AssetKind.BRAND_LOGO, AssetKind.BRAND_IMAGE]),
        )
    )).scalars().all()
    by_kit: dict[uuid.UUID, list[MediaAsset]] = {}
    for a in assets:
        by_kit.setdefault(a.brand_kit_id, []).append(a)
    return [(k, by_kit.get(k.id, [])) for k in kits]


async def get_kit(session: AsyncSession, workspace_id: uuid.UUID, kit_id: uuid.UUID) -> BrandKit:
    k = await session.get(BrandKit, kit_id)
    if k is None or k.workspace_id != workspace_id:
        raise NotFoundError("Brand kit not found")
    return k


async def create_kit(session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID, data) -> BrandKit:
    kit = BrandKit(
        workspace_id=workspace_id, created_by=user_id, name=data.name,
        colors=_validate_colors(data.colors), fonts=_validate_fonts(data.fonts),
        is_default=data.is_default,
    )
    session.add(kit)
    if kit.is_default:
        await session.execute(
            update(BrandKit).where(BrandKit.workspace_id == workspace_id).values(is_default=False)
        )
    await session.flush()
    return kit


async def update_kit(session: AsyncSession, workspace_id: uuid.UUID, kit_id: uuid.UUID, data) -> BrandKit:
    kit = await get_kit(session, workspace_id, kit_id)
    if data.name is not None:
        kit.name = data.name
    if data.colors is not None:
        kit.colors = _validate_colors(data.colors)
    if data.fonts is not None:
        kit.fonts = _validate_fonts(data.fonts)
    if data.is_default:
        await session.execute(
            update(BrandKit).where(BrandKit.workspace_id == workspace_id).values(is_default=False)
        )
        kit.is_default = True
    elif data.is_default is False:
        kit.is_default = False
    await session.flush()
    return kit


async def delete_kit(session: AsyncSession, workspace_id: uuid.UUID, kit_id: uuid.UUID) -> BrandKit:
    kit = await get_kit(session, workspace_id, kit_id)
    await session.delete(kit)  # brand assets cascade via FK
    await session.commit()
    return kit
