"""Content → schedule → calendar → reschedule → cancel lifecycle."""

from datetime import UTC, datetime, timedelta

from conftest import connect_mock, create_content, register, workspace_id


def _future(hours: int = 2) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


async def _setup(client):
    await register(client, email=None, workspace="Scheduler Inc")
    ws = await workspace_id(client)
    account = await connect_mock(client, ws)
    content = await create_content(client, ws, title="Product teaser")
    return ws, account, content


async def test_schedule_creates_post_and_pending_job(client):
    ws, account, content = await _setup(client)

    resp = await client.post(
        f"/api/v1/workspaces/{ws}/content/{content['id']}/schedule",
        json={"social_account_ids": [account["id"]], "scheduled_at": _future()},
    )
    assert resp.status_code == 201, resp.text
    posts = resp.json()
    assert len(posts) == 1
    assert posts[0]["status"] == "scheduled"
    assert posts[0]["provider"] == "mock"

    jobs = await client.get(f"/api/v1/workspaces/{ws}/jobs")
    assert jobs.status_code == 200
    items = jobs.json()["items"]
    assert len(items) == 1
    assert items[0]["status"] == "pending"
    assert items[0]["scheduled_post_id"] == posts[0]["id"]
    assert items[0]["idempotency_key"].startswith("publish:")

    detail = await client.get(f"/api/v1/workspaces/{ws}/content/{content['id']}")
    assert detail.json()["status"] == "scheduled"


async def test_reschedule_and_cancel(client):
    ws, account, content = await _setup(client)
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/content/{content['id']}/schedule",
        json={"social_account_ids": [account["id"]], "scheduled_at": _future(2)},
    )
    post_id = resp.json()[0]["id"]

    new_time = _future(5)
    moved = await client.patch(
        f"/api/v1/workspaces/{ws}/scheduled-posts/{post_id}", json={"scheduled_at": new_time}
    )
    assert moved.status_code == 200
    assert moved.json()["scheduled_at"].startswith(new_time[:16].replace(" ", "T"))

    job = (await client.get(f"/api/v1/workspaces/{ws}/jobs")).json()["items"][0]
    assert job["run_at"].startswith(new_time[:16].replace(" ", "T"))

    cancelled = await client.post(f"/api/v1/workspaces/{ws}/scheduled-posts/{post_id}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    detail = await client.get(f"/api/v1/workspaces/{ws}/content/{content['id']}")
    assert detail.json()["status"] == "draft"  # rolled back with nothing left scheduled


async def test_calendar_returns_events_in_range(client):
    ws, account, content = await _setup(client)
    await client.post(
        f"/api/v1/workspaces/{ws}/content/{content['id']}/schedule",
        json={"social_account_ids": [account["id"]], "scheduled_at": _future(24)},
    )
    start = datetime.now(UTC).isoformat()
    end = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    resp = await client.get(f"/api/v1/workspaces/{ws}/calendar", params={"start": start, "end": end})
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) == 1
    assert events[0]["title"] == "Product teaser"

    # out-of-range
    far_start = (datetime.now(UTC) + timedelta(days=10)).isoformat()
    far_end = (datetime.now(UTC) + timedelta(days=20)).isoformat()
    resp = await client.get(f"/api/v1/workspaces/{ws}/calendar", params={"start": far_start, "end": far_end})
    assert resp.json() == []


async def test_schedule_with_foreign_account_is_forbidden(client):
    ws, account, content = await _setup(client)

    # second user / second workspace
    await client.post("/api/v1/auth/logout")
    await register(client, email=None, workspace="Intruder LLC")
    ws2 = await workspace_id(client)
    content2 = await create_content(client, ws2, title="Hijack attempt")

    resp = await client.post(
        f"/api/v1/workspaces/{ws2}/content/{content2['id']}/schedule",
        json={"social_account_ids": [account["id"]], "scheduled_at": _future()},
    )
    assert resp.status_code == 404  # account not found in caller's workspace


async def test_double_schedule_same_account_is_idempotent(client):
    ws, account, content = await _setup(client)
    payload = {"social_account_ids": [account["id"]], "scheduled_at": _future()}
    first = await client.post(f"/api/v1/workspaces/{ws}/content/{content['id']}/schedule", json=payload)
    assert first.status_code == 201
    second = await client.post(
        f"/api/v1/workspaces/{ws}/content/{content['id']}/schedule", json={"social_account_ids": [account["id"]], "scheduled_at": _future(3)}
    )
    assert second.status_code == 422  # already scheduled on that account, no dup
    jobs = (await client.get(f"/api/v1/workspaces/{ws}/jobs")).json()
    assert jobs["total"] == 1


async def test_past_schedule_rejected(client):
    ws, account, content = await _setup(client)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    resp = await client.post(
        f"/api/v1/workspaces/{ws}/content/{content['id']}/schedule",
        json={"social_account_ids": [account["id"]], "scheduled_at": past},
    )
    assert resp.status_code == 422
