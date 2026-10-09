from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from contentcal.models.studio import AssetKind, TemplateCategory


# ---------- Templates ----------


class TemplateOut(BaseModel):
    id: UUID
    workspace_id: UUID | None
    name: str
    category: TemplateCategory
    platform: str
    width: int
    height: int
    thumbnail_path: str | None
    is_builtin: bool
    is_favorite: bool = False
    last_used_at: datetime | None = None
    created_at: datetime
    canvas_json: str | None = None  # only populated on detail fetch

    model_config = {"from_attributes": True}


class TemplateCreate(BaseModel):
    """Save a design as a reusable workspace template."""

    name: str = Field(min_length=1, max_length=300)
    category: TemplateCategory = TemplateCategory.PROMOTIONAL
    platform: str = Field(default="", max_length=40)
    design_id: UUID | None = None  # source design to snapshot canvas from
    canvas_json: str | None = None
    width: int | None = Field(default=None, ge=16, le=10000)
    height: int | None = Field(default=None, ge=16, le=10000)


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=300)
    category: TemplateCategory | None = None
    canvas_json: str | None = None
    thumbnail_path: str | None = None


# ---------- Designs ----------


class DesignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    width: int = Field(ge=16, le=10000)
    height: int = Field(ge=16, le=10000)
    canvas_json: str = Field(default="")
    template_id: UUID | None = None


class DesignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=300)
    canvas_json: str | None = None
    width: int | None = Field(default=None, ge=16, le=10000)
    height: int | None = Field(default=None, ge=16, le=10000)
    note: str = Field(default="", max_length=300)  # version note


class DesignOut(BaseModel):
    id: UUID
    name: str
    width: int
    height: int
    canvas_json: str
    thumbnail_path: str | None
    export_path: str | None
    template_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DesignSummary(BaseModel):
    id: UUID
    name: str
    width: int
    height: int
    thumbnail_path: str | None
    export_path: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class DesignVersionOut(BaseModel):
    id: UUID
    note: str
    width: int
    height: int
    created_by: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VersionRestore(BaseModel):
    version_id: UUID


# ---------- Brand kits ----------


class BrandKitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    colors: list[dict] = Field(default_factory=list)   # [{"name":"Primary","hex":"#6366f1"}]
    fonts: list[dict] = Field(default_factory=list)    # [{"name":"Heading","family":"Georgia"}]
    is_default: bool = False


class BrandKitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    colors: list[dict] | None = None
    fonts: list[dict] | None = None
    is_default: bool | None = None


class BrandKitOut(BaseModel):
    id: UUID
    name: str
    colors: list[dict]
    fonts: list[dict]
    is_default: bool
    logos: list["AssetOut"] = []
    images: list["AssetOut"] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Media library assets ----------


class AssetOut(BaseModel):
    id: UUID
    kind: AssetKind
    folder: str
    file_name: str
    url: str  # /media/<path>
    mime_type: str
    size_bytes: int
    uploaded_by: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetUpdate(BaseModel):
    folder: str | None = Field(default=None, max_length=300)
    file_name: str | None = Field(default=None, min_length=1, max_length=500)


class AttachAssetRequest(BaseModel):
    asset_id: UUID


# ---------- Activity ----------


class ActivityOut(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: str
    entity_name: str
    details: dict
    user_id: UUID | None
    user_name: str | None
    created_at: datetime
