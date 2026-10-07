"""Live E2E smoke against the running API + real PostgreSQL.

Covers the Definition-of-Done loop:
register → workspace → connect mock account → create content → upload media
→ schedule (future) → calendar → reschedule → cancel → re-schedule →
publish-now (durable job) → worker-side claim+execute (bypasses Redis by
calling the same job functions the worker uses) → published status.

Run: .venv/Scripts/python scripts/smoke_e2e.py  (API must be on :8010)
"""

import asyncio
import io
import uuid
from datetime import UTC, datetime, timedelta

import httpx

BASE = "http://localhost:8010/api/v1"
EMAIL = f"smoke_{uuid.uuid4().hex[:8]}@example.com"


def ok(resp: httpx.Response, expect: int, label: str):
    assert resp.status_code == expect, f"{label}: {resp.status_code} {resp.text[:400]}"
    print(f"  [ok] {label}")


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        print("== auth ==")
        r = await c.post("/auth/register", json={
            "email": EMAIL, "password": "smoke test pass!", "full_name": "Smoke Runner", "workspace_name": "Smoke Studio"})
        ok(r, 201, "register")
        r = await c.get("/auth/me")
        ok(r, 200, "me (cookie session)")

        r = await c.get("/workspaces")
        ok(r, 200, "list workspaces")
        ws = r.json()[0]["id"]

        print("== accounts ==")
        r = await c.post(f"/workspaces/{ws}/accounts/connect", json={"provider": "mock", "display_name": "Smoke Channel"})
        ok(r, 201, "connect mock account")
        account = r.json()
        assert account["is_mock"] is True

        print("== content ==")
        r = await c.post(f"/workspaces/{ws}/content", json={
            "title": "E2E launch post", "caption": "Shipping the first milestone today.", "tags": ["e2e"]})
        ok(r, 201, "create content (draft)")
        content = r.json()
        assert content["status"] == "draft"

        png = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\0" * 128)
        r = await c.post(f"/workspaces/{ws}/content/{content['id']}/media",
                         files={"file": ("shot.png", png, "image/png")})
        ok(r, 201, "upload media")

        print("== scheduling ==")
        future = (datetime.now(UTC) + timedelta(hours=3)).isoformat()
        r = await c.post(f"/workspaces/{ws}/content/{content['id']}/schedule",
                         json={"social_account_ids": [account["id"]], "scheduled_at": future})
        ok(r, 201, "schedule post")
        post = r.json()[0]
        assert post["status"] == "scheduled"

        r = await c.get(f"/workspaces/{ws}/jobs")
        ok(r, 200, "job rows exist")
        assert r.json()["items"][0]["status"] == "pending"

        start = datetime.now(UTC).isoformat()
        end = (datetime.now(UTC) + timedelta(days=2)).isoformat()
        r = await c.get(f"/workspaces/{ws}/calendar", params={"start": start, "end": end})
        ok(r, 200, "calendar returns event")
        assert r.json()[0]["title"] == "E2E launch post"

        later = (datetime.now(UTC) + timedelta(hours=5)).isoformat()
        r = await c.patch(f"/workspaces/{ws}/scheduled-posts/{post['id']}", json={"scheduled_at": later})
        ok(r, 200, "reschedule")

        r = await c.post(f"/workspaces/{ws}/scheduled-posts/{post['id']}/cancel")
        ok(r, 200, "cancel post")
        assert r.json()["status"] == "cancelled"

        print("== publish now (durable intent, then execute like the worker) ==")
        r = await c.post(f"/workspaces/{ws}/content/{content['id']}/publish-now",
                         json={"social_account_ids": [account["id"]], "scheduled_at": datetime.now(UTC).isoformat()})
        ok(r, 201, "publish-now accepted")
        new_post = [p for p in r.json() if p["status"] == "scheduled"][0]

        # Worker executes via the identical service functions (Redis-free path).
        from sqlalchemy import select
        from contentcal.database import SessionFactory
        from contentcal.models import PublishingJob, ScheduledPost
        from contentcal.services.jobs import claim_job, execute_job

        async with SessionFactory() as session:
            job = await session.scalar(select(PublishingJob).where(PublishingJob.scheduled_post_id == uuid.UUID(new_post["id"])))
            assert job is not None and job.status.value == "pending"
            claimed = await claim_job(session, job.id, worker_id="smoke-worker")
            assert claimed is not None, "job should be claimable exactly once"
            assert await claim_job(session, job.id, worker_id="race-worker") is None, "double-claim must be rejected"
            result = await execute_job(session, claimed)
            assert result.value == "success", f"publish failed: {claimed.last_error}"
            sp = await session.get(ScheduledPost, uuid.UUID(new_post["id"]))
            assert sp.status.value == "published"
            assert sp.platform_post_id and sp.platform_post_id.startswith("mock_")
        print("  [ok] job claimed ONCE, executed, post published (mock)")

        r = await c.get(f"/workspaces/{ws}/jobs")
        job_out = [j for j in r.json()["items"] if j["status"] == "success"]
        assert job_out and len(job_out[0]["attempts"]) == 1
        ok(r, 200, "job = success with 1 journaled attempt")

        r = await c.get(f"/workspaces/{ws}/content/{content['id']}")
        ok(r, 200, f"content rollup status = {r.json()['status']}")

        r = await c.get(f"/workspaces/{ws}/dashboard")
        ok(r, 200, f"dashboard (published={r.json()['published']}, accounts={r.json()['connected_accounts']})")

        print()
        print("E2E SMOKE: PASSED - full Create -> Plan -> Schedule -> Publish -> Track loop verified on PostgreSQL")


if __name__ == "__main__":
    asyncio.run(main())
