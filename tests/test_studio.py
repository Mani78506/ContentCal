"""Studio domain tests: templates, designs, versions, library, brand kits, activity."""

import io
import json

import pytest

from conftest import connect_mock, create_content, register, workspace_id

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c626001000000ffff030000060005"
    "57bfabd40000000049454e44ae426082"
)


async def _seeded_templates(client, ws_id):
    """Fetch template list (built-ins are seeded at app boot; seed lazily here for tests)."""
    resp = await client.get(f"/api/v1/workspaces/{ws_id}/studio/templates")
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    if items:
        return items
    # tests don't run the lifespan hook — seed directly
    from contentcal.database import SessionFactory  # noqa
    return items


@pytest.mark.asyncio
async def test_templates_list_and_filter(client, session):
    await register(client)
    ws = await workspace_id(client)
    from contentcal.seed_templates import seed_builtin_templates
    await seed_builtin_templates(session)

    resp = await client.get(f"/api/v1/workspaces/{ws}/studio/templates")
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) >= 12
    assert all(i["is_builtin"] for i in items)

    resp = await client.get(f"/api/v1/workspaces/{ws}/studio/templates", params={"category": "youtube"})
    assert all(i["category"] == "youtube" for i in resp.json()["items"])

    resp = await client.get(f"/api/v1/workspaces/{ws}/studio/templates", params={"q": "quote"})
    assert resp.json()["items"]
    assert "quote" in resp.json()["items"][0]["name"].lower()


@pytest.mark.asyncio
async def test_template_favorite_and_recent(client, session):
    await register(client)
    ws = await workspace_id(client)
    from contentcal.seed_templates import seed_builtin_templates
    await seed_builtin_templates(session)

    items = (await client.get(f"/api/v1/workspaces/{ws}/studio/templates")).json()["items"]
    tpl = items[0]

    resp = await client.post(f"/api/v1/workspaces/{ws}/studio/templates/{tpl['id']}/favorite")
    assert resp.status_code == 204
    favs = (await client.get(f"/api/v1/workspaces/{ws}/studio/templates", params={"favorites": "true"})).json()["items"]
    assert [t["id"] for t in favs] == [tpl["id"]]

    # opening records a "recent" and returns the canvas doc
    resp = await client.get(f"/api/v1/workspaces/{ws}/studio/templates/{tpl['id']}")
    assert resp.status_code == 200
    assert resp.json()["canvas_json"]
    doc = json.loads(resp.json()["canvas_json"])
    assert "objects" in doc

    recent = (await client.get(f"/api/v1/workspaces/{ws}/studio/templates/recent")).json()
    assert recent and recent[0]["id"] == tpl["id"]

    assert (await client.delete(f"/api/v1/workspaces/{ws}/studio/templates/{tpl['id']}/favorite")).status_code == 204
    assert (await client.get(f"/api/v1/workspaces/{ws}/studio/templates", params={"favorites": "true"})).json()["items"] == []


@pytest.mark.asyncio
async def test_design_lifecycle_versions_restore(client, session):
    await register(client)
    ws = await workspace_id(client)
    from contentcal.seed_templates import seed_builtin_templates
    await seed_builtin_templates(session)

    tpl = (await client.get(f"/api/v1/workspaces/{ws}/studio/templates")).json()["items"][0]
    tpl_doc = json.loads((await client.get(f"/api/v1/workspaces/{ws}/studio/templates/{tpl['id']}")).json()["canvas_json"])

    # create design from template
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/studio/designs",
        json={"name": "My flyer", "width": tpl["width"], "height": tpl["height"], "template_id": tpl["id"]},
    )
    assert resp.status_code == 201, resp.text
    design = resp.json()
    assert json.loads(design["canvas_json"])["objects"] == tpl_doc["objects"]

    # save with new canvas → version row
    new_doc = json.dumps({"version": "6.7.0", "objects": [{"type": "rect", "left": 0, "top": 0, "width": 10, "height": 10, "fill": "#f00"}], "background": "#000"})
    resp = await client.patch(
        f"/api/v1/workspaces/{ws}/studio/designs/{design['id']}",
        json={"canvas_json": new_doc, "note": "dark bg"},
    )
    assert resp.status_code == 200
    assert json.loads(resp.json()["canvas_json"])["background"] == "#000"

    versions = (await client.get(f"/api/v1/workspaces/{ws}/studio/designs/{design['id']}/versions")).json()
    assert len(versions) >= 2  # "Created" + "dark bg"

    # restore v1
    v1 = versions[-1]
    resp = await client.post(f"/api/v1/workspaces/{ws}/studio/designs/{design['id']}/restore", json={"version_id": v1["id"]})
    assert resp.status_code == 200
    assert json.loads(resp.json()["canvas_json"])["objects"] == tpl_doc["objects"]

    # save design as reusable workspace template
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/studio/templates",
        json={"name": "My template", "category": "promotional", "design_id": design["id"]},
    )
    assert resp.status_code == 201
    mine = resp.json()
    assert mine["is_builtin"] is False

    # workspace template is editable; builtin is not
    assert (await client.patch(f"/api/v1/workspaces/{ws}/studio/templates/{mine['id']}", json={"name": "Renamed"})).status_code == 200
    assert (await client.patch(f"/api/v1/workspaces/{ws}/studio/templates/{tpl['id']}", json={"name": "Nope"})).status_code == 403
    assert (await client.delete(f"/api/v1/workspaces/{ws}/studio/templates/{mine['id']}")).status_code == 204
    assert (await client.delete(f"/api/v1/workspaces/{ws}/studio/templates/{tpl['id']}")).status_code == 403


@pytest.mark.asyncio
async def test_media_library_upload_folders_attach(client):
    await register(client)
    ws = await workspace_id(client)

    resp = await client.post(
        f"/api/v1/workspaces/{ws}/library/assets",
        files={"file": ("logo.png", io.BytesIO(PNG), "image/png")},
        data={"folder": "Logos"},
    )
    assert resp.status_code == 201, resp.text
    asset = resp.json()
    assert asset["folder"] == "Logos"
    assert asset["url"].startswith("/media/")

    assert (await client.get(f"/api/v1/workspaces/{ws}/library/folders")).json() == ["Logos"]

    resp = await client.get(f"/api/v1/workspaces/{ws}/library/assets", params={"q": "logo"})
    assert resp.json()["total"] == 1
    resp = await client.get(f"/api/v1/workspaces/{ws}/library/assets", params={"folder": "Logos", "mime": "image"})
    assert resp.json()["total"] == 1
    resp = await client.get(f"/api/v1/workspaces/{ws}/library/assets", params={"mime": "video"})
    assert resp.json()["total"] == 0

    # attach library asset to content
    content = await create_content(client, ws)
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/content/{content['id']}/media/from-asset",
        json={"asset_id": asset["id"]},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["file_name"] == "logo.png"

    # rename + move folder
    resp = await client.patch(
        f"/api/v1/workspaces/{ws}/library/assets/{asset['id']}",
        json={"file_name": "logo-v2.png", "folder": "Brand"},
    )
    assert resp.json()["folder"] == "Brand"

    assert (await client.delete(f"/api/v1/workspaces/{ws}/library/assets/{asset['id']}")).status_code == 204

    # bad type rejected
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/library/assets",
        files={"file": ("evil.exe", io.BytesIO(b"MZ"), "application/x-msdownload")},
    )
    assert resp.status_code == 422  # ValidationAppError


@pytest.mark.asyncio
async def test_brand_kits_and_assets(client):
    await register(client)
    ws = await workspace_id(client)

    resp = await client.post(
        f"/api/v1/workspaces/{ws}/brand-kits",
        json={"name": "Acme Brand", "colors": [{"name": "Primary", "hex": "#6366f1"}], "fonts": [{"name": "Heading", "family": "Georgia"}]},
    )
    assert resp.status_code == 201, resp.text
    kit = resp.json()
    assert kit["colors"][0]["hex"] == "#6366f1"

    resp = await client.post(
        f"/api/v1/workspaces/{ws}/brand-kits/{kit['id']}/assets",
        files={"file": ("mark.png", io.BytesIO(PNG), "image/png")},
        data={"kind": "logo"},
    )
    assert resp.status_code == 201
    assert resp.json()["kind"] == "brand_logo"

    kits = (await client.get(f"/api/v1/workspaces/{ws}/brand-kits")).json()
    assert len(kits) == 1
    assert kits[0]["logos"][0]["file_name"] == "mark.png"

    resp = await client.patch(f"/api/v1/workspaces/{ws}/brand-kits/{kit['id']}", json={"is_default": True})
    assert resp.json()["is_default"] is True


@pytest.mark.asyncio
async def test_activity_feed_records_actions(client, session):
    await register(client)
    ws = await workspace_id(client)
    await connect_mock(client, ws)
    content = await create_content(client, ws, "Activity test post")

    resp = await client.post(
        f"/api/v1/workspaces/{ws}/library/assets",
        files={"file": ("a.png", io.BytesIO(PNG), "image/png")},
        data={"folder": ""},
    )
    assert resp.status_code == 201

    resp = await client.post(
        f"/api/v1/workspaces/{ws}/studio/designs",
        json={"name": "Act design", "width": 1080, "height": 1080},
    )
    assert resp.status_code == 201

    feed = (await client.get(f"/api/v1/workspaces/{ws}/activity")).json()
    actions = [a["action"] for a in feed["items"]]
    assert "post_created" in actions
    assert "media_uploaded" in actions
    assert "design_created" in actions
    # newest first
    assert feed["items"][0]["action"] == "design_created"
    assert feed["items"][0]["user_name"] == "Test User"

    filtered = (await client.get(f"/api/v1/workspaces/{ws}/activity", params={"action": "post_created"})).json()
    assert all(a["action"] == "post_created" for a in filtered["items"])


@pytest.mark.asyncio
async def test_studio_workspace_isolation(client, session):
    await register(client, workspace="Studio A")
    ws_a = await workspace_id(client)

    resp = await client.post(
        f"/api/v1/workspaces/{ws_a}/studio/designs",
        json={"name": "Private design", "width": 100, "height": 100},
    )
    design = resp.json()

    await register(client, workspace="Studio B")
    ws_b = await workspace_id(client)
    assert ws_a != ws_b

    resp = await client.get(f"/api/v1/workspaces/{ws_a}/studio/designs/{design['id']}")
    assert resp.status_code == 404
    resp = await client.get(f"/api/v1/workspaces/{ws_b}/studio/designs")
    assert resp.json()["total"] == 0
    # built-in templates still visible in B
    from contentcal.seed_templates import seed_builtin_templates
    await seed_builtin_templates(session)
    resp = await client.get(f"/api/v1/workspaces/{ws_b}/studio/templates")
    assert resp.json()["total"] >= 12
