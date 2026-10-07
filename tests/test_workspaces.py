"""Workspace isolation and membership rules — the core multi-tenant guarantee."""

import io

from conftest import create_content, register, workspace_id


async def _second_client_session(client):
    """Registers a second user on the same client (switches cookies)."""
    await client.post("/api/v1/auth/logout")
    return await register(client, email=None, workspace="Other Org")


async def test_user_sees_only_own_workspaces(client):
    await register(client, email="owner-a@example.com", workspace="Alpha Co")
    await _second_client_session(client)

    resp = await client.get("/api/v1/workspaces")
    names = [w["name"] for w in resp.json()]
    assert names == ["Other Org"]


async def test_cross_workspace_content_access_denied(client):
    await register(client, email="owner-b@example.com", workspace="Victim Co")
    victim_ws = await workspace_id(client)
    content = await create_content(client, victim_ws, title="Secret campaign")

    await _second_client_session(client)
    attacker_ws = await workspace_id(client)

    # Fetching under attacker's workspace id must 404 (existence is masked)
    resp = await client.get(f"/api/v1/workspaces/{attacker_ws}/content/{content['id']}")
    assert resp.status_code == 404
    # And victim workspace itself is invisible
    assert (await client.get(f"/api/v1/workspaces/{victim_ws}")).status_code == 404


async def test_media_upload_type_validation(client):
    await register(client, email="owner-c@example.com")
    ws = await workspace_id(client)
    content = await create_content(client, ws)

    bad = io.BytesIO(b"MZ90....")
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/content/{content['id']}/media",
        files={"file": ("evil.exe", bad, "application/x-msdownload")},
    )
    assert resp.status_code == 422

    good = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64)
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/content/{content['id']}/media",
        files={"file": ("photo.png", good, "image/png")},
    )
    assert resp.status_code == 201
    assert resp.json()["mime_type"] == "image/png"


async def test_invite_unknown_user_404(client):
    await register(client, email="owner-d@example.com")
    ws = await workspace_id(client)
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/members", json={"email": "ghost@nowhere.dev", "role": "member"}
    )
    assert resp.status_code == 404


async def test_invited_member_gains_read_access(client):
    # register the future member first (they need credentials to log in later)
    await register(client, email="member-f@example.com", workspace="Solo Place")

    # owner logs in and invites them into the owner's workspace
    await client.post("/api/v1/auth/logout")
    await register(client, email="owner-e@example.com", workspace="House Of E")
    ws = await workspace_id(client)
    resp = await client.post(f"/api/v1/workspaces/{ws}/members", json={"email": "member-f@example.com", "role": "member"})
    assert resp.status_code == 201, resp.text

    members = (await client.get(f"/api/v1/workspaces/{ws}/members")).json()
    assert {m["user"]["email"] for m in members} == {"owner-e@example.com", "member-f@example.com"}

    # member logs in: sees both workspaces, can read the shared one
    await client.post("/api/v1/auth/logout")
    login = await client.post("/api/v1/auth/login", json={"email": "member-f@example.com", "password": "correct horse battery"})
    assert login.status_code == 200
    names = {w["name"] for w in (await client.get("/api/v1/workspaces")).json()}
    assert names == {"Solo Place", "House Of E"}
    assert (await client.get(f"/api/v1/workspaces/{ws}/members")).status_code == 200
