"""Studio domain: templates, editable designs, versions, brand kits,
media-library assets, and the workspace activity feed."""

import enum
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from contentcal.models.base import Base, TimestampMixin, UUIDMixin, utcnow


class TemplateCategory(str, enum.Enum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    LINKEDIN = "linkedin"
    YOUTUBE = "youtube"
    X = "x"
    PINTEREST = "pinterest"
    PROMOTIONAL = "promotional"
    FESTIVAL = "festival"
    ANNOUNCEMENT = "announcement"
    PRODUCT_LAUNCH = "product_launch"


class DesignTemplate(Base, UUIDMixin, TimestampMixin):
    """A reusable canvas template. workspace_id NULL = built-in library;
    otherwise a workspace's saved/duplicated template."""

    __tablename__ = "design_templates"

    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(sa.String(300), nullable=False)
    category: Mapped[TemplateCategory] = mapped_column(
        sa.Enum(TemplateCategory, native_enum=False, length=40), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(sa.String(40), default="", nullable=False)  # free label e.g. "instagram"
    width: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    height: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    canvas_json: Mapped[str] = mapped_column(sa.Text, nullable=False)  # Fabric.js serialized canvas
    thumbnail_path: Mapped[str | None] = mapped_column(sa.String(1000))
    is_builtin: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False)


class TemplateFavorite(Base):
    __tablename__ = "template_favorites"
    __table_args__ = (sa.UniqueConstraint("user_id", "template_id", name="uq_template_favorite"),)

    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    template_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("design_templates.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)


class Design(Base, UUIDMixin, TimestampMixin):
    """An editable saved design — the Fabric document plus rendered output."""

    __tablename__ = "designs"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    template_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("design_templates.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(sa.String(300), nullable=False)
    width: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    height: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    canvas_json: Mapped[str] = mapped_column(sa.Text, nullable=False)
    thumbnail_path: Mapped[str | None] = mapped_column(sa.String(1000))
    export_path: Mapped[str | None] = mapped_column(sa.String(1000))  # last rendered PNG/JPG

    versions = relationship("DesignVersion", back_populates="design", cascade="all, delete-orphan")


class DesignVersion(Base, UUIDMixin):
    """Snapshot of a design on each save — users can restore any version."""

    __tablename__ = "design_versions"

    design_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("designs.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    canvas_json: Mapped[str] = mapped_column(sa.Text, nullable=False)
    width: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    height: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    note: Mapped[str] = mapped_column(sa.String(300), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)

    design = relationship("Design", back_populates="versions")


class BrandKit(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "brand_kits"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    colors: Mapped[list] = mapped_column(sa.JSON, default=list)   # [{name, hex}]
    fonts: Mapped[list] = mapped_column(sa.JSON, default=list)    # [{name, family}]
    is_default: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False)


class AssetKind(str, enum.Enum):
    LIBRARY = "library"
    BRAND_LOGO = "brand_logo"
    BRAND_IMAGE = "brand_image"


class MediaAsset(Base, UUIDMixin, TimestampMixin):
    """Workspace media library — reusable uploads independent of content items,
    plus brand-kit assets (logos/images) keyed by kind + brand_kit_id."""

    __tablename__ = "media_assets"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    brand_kit_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("brand_kits.id", ondelete="CASCADE"))
    kind: Mapped[AssetKind] = mapped_column(
        sa.Enum(AssetKind, native_enum=False, length=30), default=AssetKind.LIBRARY, nullable=False, index=True
    )
    folder: Mapped[str] = mapped_column(sa.String(300), default="", nullable=False, index=True)  # "" = root
    file_name: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(sa.String(1000), nullable=False)
    mime_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(sa.BigInteger, nullable=False)


class ActivityLog(Base):
    """Append-only audit trail per workspace. Keeps it simple: one row per
    event, details as free JSON, queries are workspace-scoped + time-ordered."""

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(
        sa.BigInteger().with_variant(sa.Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(sa.String(80), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(sa.String(60), default="", nullable=False)
    entity_id: Mapped[str] = mapped_column(sa.String(64), default="", nullable=False)
    entity_name: Mapped[str] = mapped_column(sa.String(500), default="", nullable=False)
    details: Mapped[dict] = mapped_column(sa.JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, index=True)
