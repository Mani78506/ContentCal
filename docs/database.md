# Database

PostgreSQL 17 in production; the identical schema runs on SQLite in tests
(models use portable generic types: `sa.Uuid`, `sa.JSON`, string enums).

## Entity relationship

```
users ──< workspace_members >── workspaces ──< social_accounts
                                     │
                                     └─< contents ──< content_media
                                            │
                                            └─< scheduled_posts >── social_accounts
                                                    │
                                                    └─< publishing_jobs ──< publishing_attempts
```

One `Content` can fan out to **N platforms** — each target is its own
`ScheduledPost`, each with its own `PublishingJob` and attempt history.

## Tables

### users
| column | notes |
|---|---|
| id | uuid PK |
| email | unique, indexed, citext-normalized (lowercased in app) |
| password_hash | Argon2id |
| full_name, avatar_url, last_login_at | |

### workspaces / workspace_members
- `workspaces.slug` unique.
- members enforce `UNIQUE(workspace_id, user_id)`; `role ∈ owner|admin|member|viewer`.
- Every tenant query goes through membership resolution — no exceptions.

### social_accounts
- `UNIQUE(workspace_id, provider, provider_account_id)` prevents double-connect.
- `access_token_encrypted` / `refresh_token_encrypted` — Fernet ciphertext,
  never returned by any serializer.
- `provider ∈ instagram|facebook|youtube|linkedin|x|mock`. `mock` rows are
  development-only and badged as such in the UI.
- `status ∈ active|expired|revoked`.

### contents / content_media
- `Content.status ∈ draft|scheduled|published|failed|archived` is a
  **denormalized rollup** — the source of truth is the set of ScheduledPosts.
- media: validated type/size, `sort_order` for galleries, cascade on delete.

### scheduled_posts — the heart of the calendar
| column | notes |
|---|---|
| content_id, social_account_id | FK cascade delete |
| scheduled_at | timestamptz, indexed with status (`ix_scheduled_posts_due`) |
| status | scheduled → publishing → published \| failed \| cancelled |
| platform_payload | per-platform overrides (future: per-network caption) |
| published_at, platform_post_id, platform_post_url, error | filled by worker |

### publishing_jobs
| column | notes |
|---|---|
| scheduled_post_id | FK; the job's subject |
| idempotency_key | **UNIQUE** — `publish:<scheduled_post_id>`; one job per post, ever |
| status | pending → processing → success \| dead \| cancelled; failed→pending for retries |
| run_at | due-time the scheduler scans (`ix_publishing_jobs_poll`) |
| locked_at / locked_by | claim stamp from the executing worker |
| retry_count / max_retries | exponential backoff 2ⁿ min, cap 1h |
| last_error, completed_at | |

### publishing_attempts
One row per provider invocation: `UNIQUE(job_id, attempt_number)`, status,
error, `provider_response` JSON, timestamps. Full forensic trail.

## Migrations

Alembic, async engine, URL from `DATABASE_URL` (never hardcoded).

```bash
alembic upgrade head                    # apply
alembic revision --autogenerate -m "…"  # after model changes
alembic downgrade -1                    # roll back one
```

`0001_initial_schema` materializes `Base.metadata` so the baseline always
matches the ORM exactly. All later changes use autogenerate diffs.
