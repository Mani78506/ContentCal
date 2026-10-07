# API Reference

Base URL: `/api/v1` · Auth: httpOnly cookies (`cc_access`, `cc_refresh`) ·
Errors: `{ "detail": { "code": "…", "message": "…" } }`

All `/workspaces/{id}/…` routes require membership; non-members get **404**.

## Auth — `/auth`

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/register` | `{email, password≥10, full_name, workspace_name}` | 201 User + sets cookies, creates workspace |
| POST | `/login` | `{email, password}` | User + cookie pair |
| POST | `/refresh` | — | New rotated cookie pair |
| POST | `/logout` | — | 204, clears cookies |
| GET | `/me` | — | Current user |

Access token TTL 30 min (config), refresh 14 days, rotated on every refresh.

## Workspaces — `/workspaces`

| Method | Path | Notes |
|---|---|---|
| GET | `` | caller's workspaces (with role) |
| POST | `` | create (`{name}`) → caller becomes owner |
| GET | `/{id}` | detail |
| GET | `/{id}/members` | member list |
| POST | `/{id}/members` | `{email, role}` — owner/admin only; user must already exist |
| PATCH | `/{id}/members/{mid}` | change role; owner can't be demoted |
| DELETE | `/{id}/members/{mid}` | remove; owner can't be removed |

## Content — `/workspaces/{wid}/content`

| Method | Path | Notes |
|---|---|---|
| GET | `?status=&limit=&offset=` | `{items, total}` of summaries |
| POST | `` | `{title, caption, tags[]}` → 201 full object |
| GET/PATCH/DELETE | `/{cid}` | status transitions to scheduled/published are rejected here — use scheduling routes |
| POST | `/{cid}/media` | multipart `file`; JPEG/PNG/WebP/GIF/MP4/MOV/WebM, ≤50MB, ≤10 items |
| DELETE | `/{cid}/media/{mid}` | removes row + file |

## Scheduling — `/workspaces/{wid}`

| Method | Path | Notes |
|---|---|---|
| POST | `/content/{cid}/schedule` | `{social_account_ids[], scheduled_at(future)}` → creates ScheduledPosts + pending jobs; same account twice = idempotent 422 |
| POST | `/content/{cid}/publish-now` | same body; best-effort immediate enqueue, scheduler is the fallback |
| GET | `/calendar?start&end` | events for views (max 95-day range) |
| PATCH | `/scheduled-posts/{id}` | `{scheduled_at}` — reschedule; job's `run_at` follows |
| POST | `/scheduled-posts/{id}/cancel` | cancels post + job |
| GET | `/scheduled-posts/{id}` | detail |

## Accounts — `/workspaces/{wid}/accounts`

| Method | Path | Notes |
|---|---|---|
| GET | `` | connected accounts (secrets never serialized) |
| GET | `/providers` | provider catalog with `implemented` flags |
| POST | `/connect` | **dev-only**: `{provider:"mock", display_name}` — real OAuth will land here |
| POST | `/{aid}/validate` | calls provider `validate()`; on failure marks `expired` |
| DELETE | `/{aid}` | refuses while the account has scheduled/publishing posts (409) |

## Jobs — `/workspaces/{wid}/jobs`

| Method | Path | Notes |
|---|---|---|
| GET | `?status=&limit=&offset=` | jobs with full attempt history |

## Dashboard — `/workspaces/{wid}/dashboard`

GET → metric counts + next-14-days upcoming events + 6 most recent content items.

## Meta

GET `/health` → `{status: "ok", …}` (unauthenticated).
Static: `/media/<path>` serves uploaded files (dev only).
