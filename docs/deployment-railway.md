# Deploying to Railway

Railway runs the full stack: web, api, worker, PostgreSQL, Redis.
Total: 3 services + 2 plugins from this one repo.

> Demo caveat: uploaded media lives on service-local disk and is wiped on
> redeploys. Acceptable for a demo; move to S3/R2 before anything real.

## 0. One-time

1. Push this repo to GitHub (done).
2. In Railway: **New Project → Deploy from GitHub repo** → pick `ContentCal`.

## 1. Plugins

- **Add → Database → PostgreSQL** → after creation, copy its `DATABASE_URL`
  reference as `${{Postgres.DATABASE_URL}}`.
- **Add → Database → Redis** (`glitch-visualizer/redis` plugin or managed
  Key Value) → reference `${{Redis.REDIS_URL}}`.

## 2. API service

| Setting | Value |
|---|---|
| Root Directory | *(repo root — leave empty)* |
| Build Command | `pip install -e "packages/core"` |
| Start Command | `python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port $PORT` |

Variables:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET_KEY=<generate: python -c "import secrets;print(secrets.token_urlsafe(64))">
TOKEN_ENCRYPTION_KEY=<generate 64 hex chars>
COOKIE_SECURE=true
ENVIRONMENT=production
MEDIA_STORAGE_DIR=/tmp/media
```

**Then run migrations once** (Railway → API service → three-dot menu →
"Run a command"… or from your machine against the plugin URL):

```bash
DATABASE_URL=<railway postgres url> alembic upgrade head
```

## 3. Worker service

| Setting | Value |
|---|---|
| Root Directory | *(repo root)* |
| Build Command | `pip install -e "packages/core"` |
| Start Command | `cd apps/worker && arq worker.main.WorkerSettings` |

Variables: same as the API (`DATABASE_URL`, `REDIS_URL`, `MEDIA_STORAGE_DIR=/tmp/media`, token key, etc.). No public domain needed.

## 4. Web service

Root Directory `apps/web` — `apps/web/railway.toml` carries the rest.

Variables:

```
API_INTERNAL_URL=${{api.RAILWAY_PRIVATE_DOMAIN}}   # private networking to the API service
# or the API's public https://<api>.up.railway.app — private domain is faster/free
NODE_ENV=production
```

## 5. After deploy

1. Open the web service domain → register → connect a dev account.
2. Schedule a post 2 minutes out → watch it flip to **published** on the
   calendar (the worker + Redis do this for real on Railway).
3. **Settings → Publishing pipeline** shows the job and its attempt.

## Why cookies "just work" here

The browser only talks to the web service. Next.js rewrites proxy `/api/*`
server-side to the API over Railway's private network, so auth cookies are
first-party on your web domain — no CORS or `COOKIE_DOMAIN` gymnastics.
`COOKIE_SECURE=true` is correct because Railway serves HTTPS.
