# ContentCal

A production-grade SaaS foundation for planning, creating, scheduling, and
automatically publishing social-media content from one unified workspace.

**Core loop:** Create → Plan → Schedule → Automatically Publish → Track

> **Honesty-first publishing:** no real social-platform integration is enabled
> yet. All publishing flows through an explicit provider interface; the only
> registered provider today is a clearly-labelled **mock/dev provider** that
> simulates the complete publish lifecycle (jobs, retries, statuses) without
> contacting any real platform. Nothing ever pretends a post went to
> Instagram/YouTube/etc.

## Stack

| Layer    | Technology |
|----------|------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, Framer Motion, SWR, dnd-kit |
| API      | Python 3.12, FastAPI, Pydantic, SQLAlchemy 2 (async) |
| Database | PostgreSQL 17, Alembic migrations |
| Queue    | Redis (Memurai on Windows) + arq |
| Worker   | arq worker sharing the same core package |

## Repository layout

```
apps/
  web/        Next.js application (all UI)
  api/        FastAPI transport layer (thin routers only)
  worker/     arq worker + scheduler loop
packages/
  core/       contentcal — models, schemas, services, providers, queue
alembic/      database migrations
tests/        backend test suite (pytest)
infra/docker/ docker-compose for a full local stack (Postgres + Redis)
docs/         architecture, database, API, providers, development guides
```

## Quick start

Prerequisites: Python 3.12+, Node 20+, PostgreSQL, Redis/Memurai.

```bash
# 1. Environment
cp .env.example .env          # then fill in real values (never commit .env)

# 2. Backend
python -m venv .venv
.venv/Scripts/pip install -e "packages/core[dev]"   # Windows
# .venv/bin/pip install -e "packages/core[dev]"     # macOS/Linux

# 3. Database
# create the database once:  createdb content_cal  (or via psql)
.venv/Scripts/alembic upgrade head

# 4. Run (three terminals)
.venv/Scripts/uvicorn app.main:app --reload --app-dir apps/api --port 8010  # API → :8010
cd apps/worker && ../../.venv/Scripts/arq worker.main.WorkerSettings        # Worker
cd apps/web && npm install && npm run dev                                   # Web → :3000
# (port 8000 is avoided by default — if 8010 conflicts on your machine,
#  change the uvicorn port and API_INTERNAL_URL in apps/web/next.config.ts together)
```

Open http://localhost:3000 — register, and you're in a live workspace.
Connect a **dev account** on the Accounts page, create content, schedule it,
and watch the worker publish it (mock) on the calendar.

## Tests

```bash
.venv/Scripts/python -m pytest        # 20 tests: auth, isolation, scheduling, jobs
cd apps/web && npx tsc --noEmit       # frontend typecheck
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — system design & data flow
- [docs/database.md](docs/database.md) — schema, relationships, migrations
- [docs/api.md](docs/api.md) — REST endpoint reference
- [docs/social-providers.md](docs/social-providers.md) — provider interface & roadmap
- [docs/development.md](docs/development.md) — full dev setup on Windows/macOS/Linux

## Security posture

- httpOnly, SameSite=Lax session cookies — **no tokens in browser storage**
- Argon2id password hashing; refresh-token rotation
- Workspace-scoped authorization on every route; foreign resources masked (404)
- Server-side validation on all inputs; upload allowlist (MIME + size cap)
- Future OAuth secrets encrypted at rest (Fernet, `TOKEN_ENCRYPTION_KEY`)
- No secrets in the repo — everything via environment (`.env` is gitignored)
