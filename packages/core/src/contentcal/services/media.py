"""Secure media file handling for uploads.

Dev storage is the local filesystem (MEDIA_STORAGE_DIR); the service boundary
is shaped so object storage (S3/GCS) can replace it without touching callers."""

import re
import uuid
from pathlib import Path

from contentcal.config import get_settings

ALLOWED_MIME_PREFIXES = ("image/", "video/")
ALLOWED_MIME_EXACT = {"image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm"}

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def sanitize_filename(name: str) -> str:
    name = Path(name).name  # strip any path components
    name = _SAFE_FILENAME.sub("_", name)
    return name[:200] or "upload"


def validate_mime(mime_type: str) -> bool:
    return mime_type in ALLOWED_MIME_EXACT


def storage_root() -> Path:
    root = Path(get_settings().media_storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def new_storage_path(content_id: uuid.UUID, filename: str) -> tuple[Path, str]:
    """Returns (absolute_path, relative_path_for_db)."""
    rel = Path(str(content_id)) / f"{uuid.uuid4().hex}_{sanitize_filename(filename)}"
    absolute = storage_root() / rel
    absolute.parent.mkdir(parents=True, exist_ok=True)
    return absolute, str(rel).replace("\\", "/")


def new_asset_path(workspace_id: uuid.UUID, filename: str) -> tuple[Path, str]:
    """Media-library storage: assets/<workspace>/<uuid>_<name>."""
    rel = Path("assets") / str(workspace_id) / f"{uuid.uuid4().hex}_{sanitize_filename(filename)}"
    absolute = storage_root() / rel
    absolute.parent.mkdir(parents=True, exist_ok=True)
    return absolute, str(rel).replace("\\", "/")


def new_design_path(workspace_id: uuid.UUID, design_id: uuid.UUID, ext: str) -> tuple[Path, str]:
    """Rendered design export/thumbnail storage."""
    ext = ext.lower().lstrip(".")
    if ext not in ("png", "jpg", "jpeg", "webp"):
        ext = "png"
    rel = Path("designs") / str(workspace_id) / f"{design_id}_{uuid.uuid4().hex[:8]}.{ext}"
    absolute = storage_root() / rel
    absolute.parent.mkdir(parents=True, exist_ok=True)
    return absolute, str(rel).replace("\\", "/")
