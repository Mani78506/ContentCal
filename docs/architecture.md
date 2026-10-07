# Architecture

## Overview

```
┌─────────────┐      same-origin       ┌──────────────┐
│  Next.js    │  /api, /media rewrites │   FastAPI    │
│  (apps/web) │ ─────────────────────► │  (apps/api)  │
└─────────────┘                        └──────┬───────┘
                                              │ SQLAlchemy (async)
                              ┌───────────────▼───────────────┐
                              │  contentcal core (packages/   │
                              │  core): models, services,     │
                              │  providers, queue abstraction │
                              └───────┬───────────────┬───────┘
                                      │               │ enqueue (best-effort)
                              ┌───────▼───────┐   ┌───▼────────┐
                              │  PostgreSQL   │   │   Redis    │
                              └───────▲───────┘   └───┬────────┘
                                      │               │ consume
                              ┌───────┴───────────────▼───────┐
                              │  arq worker (apps/worker)     │
                              │  • publish_job handler        │
                              │  • scheduler_tick cron        │
                              └───────────────┬───────────────┘
                                              │
                                   SocialProvider (interface)
                                   └─ MockProvider today
                                     Instagram/YouTube/… later
```

## Design decisions

### 1. Thin apps, fat core
`apps/api` and `apps/worker` contain only transport code. All domain logic —
auth, workspaces, content, scheduling, job execution, provider dispatch —
lives in `packages/core` so the API and worker always share one source of
truth. Route handlers validate and serialize; they never contain business
logic (enforced by convention, visible in review).

### 2. The database is the source of truth for scheduling
Publishing intent is durable: `ScheduledPost` + `PublishingJob` rows. The
browser never publishes; Redis is a fast path, never a requirement:

1. `POST …/schedule` writes `ScheduledPost(scheduled)` + `PublishingJob(pending, run_at)`.
2. The worker's `scheduler_tick` cron (every `SCHEDULER_TICK_SECONDS`) enqueues
   due pending jobs to Redis/arq.
3. `publish_job` claims the job with an atomic-ish status flip
   (`PENDING|FAILED → PROCESSING` guarded `UPDATE … WHERE status IN (…)`), so
   two workers (or a broker redelivery) can't double-publish.
4. Execution resolves the account's provider from the registry and calls
   `publish(account, PublishRequest(idempotency_key=…))`.
5. Results journal into `publishing_attempts`; failures back off
   exponentially (2ⁿ minutes, capped at 1h) up to `max_retries`, then `dead`.

**Idempotency:** one unique `idempotency_key = "publish:<scheduled_post_id>"`
per scheduled post (unique constraint). A retried job is the *same row*; a
duplicate enqueue re-reads status and skips.

### 3. Rollup status
`Content.status` is a denormalized summary of its scheduled posts
(draft → scheduled → published/failed), recomputed by the service layer on
every transition. Per-platform truth always lives on `ScheduledPost`.

### 4. Provider interface
`SocialProviderBase` (`validate`, `publish`, `get_status`) is the only
coupling point between scheduling and platforms. The calendar, API, and
worker know nothing about any platform. New integrations = new class + one
registry entry. `ProviderNotImplementedError` is raised loudly for
unregistered providers and mapped to a 422 — never faked as success.

### 5. Workspace isolation
Every tenant-scoped route resolves a `WorkspaceContext` via a dependency that
loads the caller's membership first. Non-members get **404** (existence
masking), members get role-based write checks (`viewer` is read-only).
Cross-workspace IDs are never honoured silently.

### 6. Same-origin frontend
Next.js rewrites proxy `/api/*`, `/media/*`, `/health` to FastAPI, so the
browser sees a single origin: cookies are first-party and CORS friction
disappears in dev. In production serve the SPA behind the same domain or
configure `CORS_ORIGINS` + `COOKIE_DOMAIN` explicitly.

### 7. Media
Uploads are validated (MIME allowlist, size cap, count cap), filenames
sanitized, stored under `MEDIA_STORAGE_DIR/<content_id>/<uuid>_<name>`.
Dev serving is a static mount; production swaps in object storage without
touching callers.

## Failure modes

| Failure | Behaviour |
|---|---|
| Redis down at schedule time | API still writes durable rows; `scheduler_tick` recovers when Redis returns |
| Worker crash mid-publish | Job stays `PROCESSING`; next deploy/ops can reset — provider idempotency prevents dupes downstream |
| Provider 5xx | Attempt journaled, exponential backoff, then `dead` + post marked `failed` |
| Provider non-retryable error (bad credential) | Dies immediately after one attempt, post `failed` |
| Double enqueue / redelivery | `claim_job` guard + unique idempotency key → single publish |

## What is intentionally NOT here yet

- Real OAuth flows and platform API clients (interface + mock only)
- Email invitations, password reset, analytics ingestion
- Notifications service, webhooks, rate limiting per provider
