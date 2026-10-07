# Development Guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.12+ | |
| Node.js | 20+ | |
| PostgreSQL | 15+ | 17 recommended |
| Redis | 6+ | On Windows: **Memurai** (Developer edition) |

## Setup

### 1. Clone & env

```bash
cp .env.example .env
```

Fill in, at minimum:

```bash
DATABASE_URL=postgresql+asyncpg://postgres:<password>@localhost:5432/content_cal
REDIS_URL=redis://localhost:6379/0
# generate every CHANGE_ME:
python -c "import secrets; print(secrets.token_urlsafe(64))"  # JWT_SECRET_KEY
python -c "import secrets; print(secrets.token_hex(32))"      # TOKEN_ENCRYPTION_KEY
```

### 2. Python environment

```bash
python -m venv .venv
.venv/Scripts/pip install -e "packages/core[dev]"   # Windows (Git Bash)
.venv/bin/pip install -e "packages/core[dev]"       # macOS/Linux
```

The editable install makes `contentcal` importable for the API, worker,
migrations, and tests from one place.

### 3. Database

```bash
# one time:
psql -U postgres -c "CREATE DATABASE content_cal;"

# every schema change:
alembic upgrade head
```

### 4. Run the three processes

```bash
# terminal 1 — API → http://localhost:8010 (docs at /docs)
.venv/Scripts/uvicorn app.main:app --reload --app-dir apps/api --port 8010

# terminal 2 — worker (scheduler + publisher)
cd apps/worker && ../../.venv/Scripts/arq worker.main.WorkerSettings

# terminal 3 — web → http://localhost:3000
cd apps/web && npm install && npm run dev
```

If Redis isn't running, the API starts fine (enqueue is best-effort, jobs sit
pending); the worker exits with a connection error until Redis/Memurai is up.

## Daily workflows

| Task | Command |
|---|---|
| Backend tests | `.venv/Scripts/python -m pytest` |
| Frontend typecheck | `cd apps/web && npx tsc --noEmit` |
| Frontend build | `cd apps/web && npm run build` |
| New migration | `alembic revision --autogenerate -m "…"` |
| Reset DB | `alembic downgrade base && alembic upgrade head` |

## First-run walkthrough (smoke test)

1. Register at `/register` → lands on the dashboard (all zeroes, honest empty states).
2. **Accounts → Connect dev account** → mock account appears.
3. **Create → New content**: title, caption, upload an image.
4. Select the mock account, pick tomorrow 09:00 → **Schedule post**.
5. **Calendar**: the chip appears; drag it to another day → rescheduled
   (job `run_at` updates too).
6. Click the chip → details modal shows status, media, accounts.
7. Back in the editor → **Publish now** → within ~30s (scheduler tick) the
   status flips scheduled → publishing → published (refresh or wait for SWR).
8. **Settings → Publishing pipeline** shows the job: `success`, 1 attempt.

## Conventions

- Services return domain objects; routers only serialize (see
  `apps/api/app/serializers.py`).
- Domain errors use `contentcal.errors.AppError` — never `HTTPException`
  below the transport layer.
- Money/time: everything stored UTC, rendered local.
- Any new provider: start from `docs/social-providers.md`.
