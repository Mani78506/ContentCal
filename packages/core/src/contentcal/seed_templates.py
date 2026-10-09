"""Built-in template library — Fabric.js canvas documents seeded once.

Each template is a plain Fabric JSON doc ({version, objects, background}) so
the frontend can loadFromJSON() it directly. Built-ins are shared across all
workspaces (workspace_id NULL, is_builtin True)."""

import json
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from contentcal.models import DesignTemplate, TemplateCategory

FABRIC_VERSION = "6.7.0"

# ---- small object factories keep the catalogue readable ----


def _tx(text: str, *, left: int, top: int, width: int, size: int, color: str = "#ffffff",
        weight: str = "bold", family: str = "Arial", align: str = "center") -> dict[str, Any]:
    return {
        "type": "textbox", "version": FABRIC_VERSION, "left": left, "top": top,
        "width": width, "fontSize": size, "fontFamily": family, "fontWeight": weight,
        "fill": color, "text": text, "textAlign": align, "lineHeight": 1.16,
        "scaleX": 1, "scaleY": 1, "angle": 0, "opacity": 1, "originX": "left", "originY": "top",
    }


def _rect(*, left: int, top: int, width: int, height: int, fill: str, rx: int = 0,
          opacity: float = 1.0) -> dict[str, Any]:
    return {
        "type": "rect", "version": FABRIC_VERSION, "left": left, "top": top,
        "width": width, "height": height, "fill": fill, "rx": rx, "ry": rx,
        "scaleX": 1, "scaleY": 1, "angle": 0, "opacity": opacity, "originX": "left", "originY": "top",
    }


def _circle(*, left: int, top: int, radius: int, fill: str, opacity: float = 1.0) -> dict[str, Any]:
    return {
        "type": "circle", "version": FABRIC_VERSION, "left": left, "top": top,
        "radius": radius, "fill": fill, "scaleX": 1, "scaleY": 1, "angle": 0,
        "opacity": opacity, "originX": "left", "originY": "top",
    }


def _grad(c1: str, c2: str, w: int, h: int, vertical: bool = True) -> dict[str, Any]:
    return {
        "type": "linear",
        "coords": {"x1": 0, "y1": 0, "x2": 0 if vertical else w, "y2": h if vertical else 0},
        "colorStops": [{"offset": 0, "color": c1}, {"offset": 1, "color": c2}],
        "gradientUnits": "pixels",
    }


def _doc(objects: list[dict[str, Any]], background) -> str:
    return json.dumps({"version": FABRIC_VERSION, "objects": objects, "background": background})


def _t(name: str, cat: TemplateCategory, platform: str, w: int, h: int, canvas: str) -> dict:
    return {"name": name, "category": cat, "platform": platform, "width": w, "height": h, "canvas_json": canvas}


BUILTIN_TEMPLATES: list[dict] = [
    _t(
        "Instagram Quote — Indigo", TemplateCategory.INSTAGRAM, "instagram", 1080, 1080,
        _doc([
            _rect(left=80, top=860, width=220, height=8, fill="#a5b4fc", rx=4),
            _tx("\u201cYour brand story, beautifully told.\u201d", left=140, top=380, width=800, size=64, weight="bold", family="Georgia"),
            _tx("@yourhandle", left=390, top=940, width=300, size=34, color="#c7d2fe", weight="normal"),
        ], _grad("#4f46e5", "#7c3aed", 1080, 1080)),
    ),
    _t(
        "Instagram Product Card", TemplateCategory.INSTAGRAM, "instagram", 1080, 1080,
        _doc([
            _rect(left=90, top=90, width=900, height=620, fill="#ffffff", rx=32),
            _tx("NEW", left=430, top=140, width=220, size=36, color="#4f46e5"),
            _tx("Drop your product here", left=190, top=330, width=700, size=48, color="#111827", family="Georgia"),
            _tx("Shop the collection", left=140, top=900, width=800, size=44, color="#ffffff"),
            _rect(left=140, top=880, width=800, height=110, fill="#4f46e5", rx=55, opacity=1),
        ], "#eef2ff"),
    ),
    _t(
        "Instagram Story Promo", TemplateCategory.INSTAGRAM, "instagram", 1080, 1920,
        _doc([
            _circle(left=340, top=260, radius=200, fill="#ffffff", opacity=0.15),
            _tx("FLASH SALE", left=140, top=700, width=800, size=96),
            _tx("Up to 50% off everything", left=190, top=860, width=700, size=44, color="#fde68a", weight="normal"),
            _tx("Swipe up \u2192", left=390, top=1600, width=300, size=40),
        ], _grad("#f59e0b", "#ef4444", 1080, 1920)),
    ),
    _t(
        "Reels Cover — Bold", TemplateCategory.INSTAGRAM, "instagram", 1080, 1920,
        _doc([
            _rect(left=0, top=760, width=1080, height=420, fill="#0f172a", opacity=0.72),
            _tx("How we built it", left=110, top=820, width=860, size=88, align="left"),
            _tx("Episode 12 · 60 sec", left=110, top=1060, width=860, size=40, color="#94a3b8", weight="normal", align="left"),
        ], "#1e293b"),
    ),
    _t(
        "Facebook Post — Clean", TemplateCategory.FACEBOOK, "facebook", 1200, 630,
        _doc([
            _rect(left=60, top=60, width=14, height=510, fill="#2563eb", rx=7),
            _tx("Weekend offer inside", left=130, top=180, width=980, size=72, color="#0f172a", align="left"),
            _tx("Tap to learn more \u2192", left=130, top=330, width=980, size=40, color="#2563eb", weight="normal", align="left"),
        ], "#f8fafc"),
    ),
    _t(
        "Facebook Page Banner", TemplateCategory.FACEBOOK, "facebook", 1640, 664,
        _doc([
            _tx("Your Company Name", left=170, top=230, width=1300, size=96),
            _tx("Tagline goes here — what you do in one line", left=170, top=380, width=1300, size=44, color="#dbeafe", weight="normal"),
        ], _grad("#1d4ed8", "#0ea5e9", 1640, 664, vertical=False)),
    ),
    _t(
        "LinkedIn Insight Post", TemplateCategory.LINKEDIN, "linkedin", 1200, 627,
        _doc([
            _rect(left=0, top=0, width=1200, height=14, fill="#0a66c2"),
            _tx("3 lessons from launching in public", left=110, top=170, width=980, size=66, color="#0f172a", align="left"),
            _tx("a thread \ud83e\uddf5", left=110, top=430, width=400, size=38, color="#0a66c2", weight="normal", align="left"),
            _circle(left=980, top=420, radius=90, fill="#dbeafe"),
            _tx("in", left=1010, top=445, width=130, size=64, color="#0a66c2"),
        ], "#ffffff"),
    ),
    _t(
        "YouTube Thumbnail", TemplateCategory.YOUTUBE, "youtube", 1280, 720,
        _doc([
            _rect(left=0, top=480, width=1280, height=240, fill="#000000", opacity=0.55),
            _tx("I tried it so you don't have to", left=80, top=510, width=1120, size=76, align="left"),
            _circle(left=1050, top=80, radius=110, fill="#dc2626"),
            _tx("\u25b6", left=1080, top=110, width=140, size=96),
        ], "#111827"),
    ),
    _t(
        "X Post — Minimal", TemplateCategory.X, "x", 1600, 900,
        _doc([
            _tx("Shipping is a mindset.", left=200, top=340, width=1200, size=92, color="#e2e8f0"),
            _rect(left=660, top=560, width=280, height=10, fill="#38bdf8", rx=5),
        ], "#0f172a"),
    ),
    _t(
        "Pinterest Pin — Recipe", TemplateCategory.PINTEREST, "pinterest", 1000, 1500,
        _doc([
            _rect(left=90, top=90, width=820, height=760, fill="#fef3c7", rx=40),
            _tx("15-Minute Meals", left=130, top=960, width=740, size=84, color="#78350f", family="Georgia"),
            _tx("Save this pin \ud83d\udccc", left=300, top=1230, width=400, size=38, color="#b45309", weight="normal"),
        ], "#fffbeb"),
    ),
    _t(
        "Holiday Greeting", TemplateCategory.FESTIVAL, "", 1080, 1080,
        _doc([
            _circle(left=140, top=140, radius=70, fill="#fbbf24", opacity=0.9),
            _circle(left=870, top=800, radius=90, fill="#fbbf24", opacity=0.7),
            _tx("Season's Greetings", left=140, top=420, width=800, size=90, family="Georgia"),
            _tx("from all of us at your company", left=240, top=590, width=600, size=38, color="#fef3c7", weight="normal"),
        ], _grad("#991b1b", "#450a0a", 1080, 1080)),
    ),
    _t(
        "Product Launch", TemplateCategory.PRODUCT_LAUNCH, "", 1080, 1080,
        _doc([
            _tx("INTRODUCING", left=340, top=240, width=400, size=40, color="#a78bfa", weight="normal"),
            _tx("Product Name", left=140, top=330, width=800, size=96),
            _tx("Available October 2026", left=290, top=540, width=500, size=38, color="#94a3b8", weight="normal"),
            _rect(left=390, top=700, width=300, height=90, fill="#7c3aed", rx=45),
            _tx("Pre-order", left=390, top=722, width=300, size=40),
        ], "#0c0a1d"),
    ),
    _t(
        "Big Announcement", TemplateCategory.ANNOUNCEMENT, "", 1200, 675,
        _doc([
            _tx("\ud83d\udce3 We have news", left=150, top=180, width=900, size=88, color="#065f46", align="left"),
            _tx("Something big is coming. Stay tuned.", left=150, top=330, width=900, size=42, color="#047857", weight="normal", align="left"),
        ], "#ecfdf5"),
    ),
    _t(
        "Promo Discount", TemplateCategory.PROMOTIONAL, "", 1080, 1080,
        _doc([
            _circle(left=540, top=340, radius=310, fill="#ffffff"),
            _tx("-30%", left=390, top=480, width=300, size=110, color="#dc2626"),
            _tx("This weekend only", left=290, top=830, width=500, size=44),
            _tx("CODE: SAVE30", left=340, top=920, width=400, size=36, color="#fecaca", weight="normal"),
        ], "#dc2626"),
    ),
]


async def seed_builtin_templates(session: AsyncSession) -> int:
    """Idempotent: inserts built-ins only if none exist. Called on API boot."""
    existing = await session.scalar(
        select(func.count()).select_from(DesignTemplate).where(DesignTemplate.is_builtin.is_(True))
    )
    if existing:
        return 0
    for t in BUILTIN_TEMPLATES:
        session.add(DesignTemplate(id=uuid.uuid4(), is_builtin=True, workspace_id=None, **t))
    await session.commit()
    return len(BUILTIN_TEMPLATES)
