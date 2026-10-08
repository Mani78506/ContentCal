# Deploying to Railway

Four services total: **web**, **api**, **worker**, plus PostgreSQL and Redis
plugins. API and worker build from deterministic Dockerfiles (no Railpack
guessing games in a mixed-language monorepo).

> Demo caveat: uploaded media lives on service-local disk and is wiped on
> redeploys. Acceptable for a demo; move to S3/R2 before anything real.

## 1. Create project + plugins

1. Railway → **New Project → Deploy from GitHub repo** → `ContentCal`
2. **+ New → Database → Add PostgreSQL**
3. **+ New → Database → Add Redis**

## 2. API service

Use the repo service Railway created (or **+ New → GitHub Repo**). In
**Settings**:

| Setting | Value |
|---|---|
| Root Directory | `/` *(repo root — must see packages/core)* |
| Builder | **Dockerfile** |
| Dockerfile Path | `infra/docker/api.Dockerfile` |

**Variables**:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
COOKIE_SECURE=true
ENVIRONMENT=production
MEDIA_STORAGE_DIR=/tmp/media
```

Generate two secrets locally and add them:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"   # JWT_SECRET_KEY
python -c "import secrets; print(secrets.token_hex(32))"       # TOKEN_ENCRYPTION_KEY
```

**Networking tab → Generate Domain** — remember this API URL.

## 3. Worker service

**+ New → GitHub Repo → ContentCal** (second service from the same repo):

| Setting | Value |
|---|---|
| Root Directory | `/` |
| Builder | **Dockerfile** |
| Dockerfile Path | `infra/docker/worker.Dockerfile` |

Variables: same as API (`DATABASE_URL`, `REDIS_URL`, `MEDIA_STORAGE_DIR`,
both secrets). **No domain needed.**

## 4. Web service

**+ New → GitHub Repo → ContentCal** (third service):

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |

`apps/web/railway.toml` provides build (`npm ci && npm run build`) and start
(`npm start`) automatically. **Variables**:

```
API_INTERNAL_URL=${{api.RAILWAY_PRIVATE_DOMAIN}}
```
(Type `${{` in the value field — Railway offers each service's references.
If that's fiddly, use the API's public `https://<api>.up.railway.app` instead.)

**Networking → Generate Domain** — this is your public app URL.

## 5. Migrations (once)

After Postgres is created, from your PC:

```powershell
# Railway → Postgres plugin → Connect tab → copy the public URL
$env:DATABASE_URL="postgresql+asyncpg://postgres:<pw>@<host>:<port>/railway"
.venv\Scripts\alembic upgrade head
```

## 6. Verify

1. Web URL → **Register** → dashboard loads.
2. **Accounts → Connect dev account**.
3. Create a post, schedule it **2 minutes out** → it flips to **Published**
   by itself (proves worker + Redis).
4. **Settings → Publishing pipeline** shows the job + attempt.

## Trouble signs

| Symptom | Fix |
|---|---|
| Build fails instantly with "no start command" | You're on Railpack at repo root — switch Builder to **Dockerfile** (step 2/3) |
| API 500 on register | Migrations not run (step 5), or `DATABASE_URL` reference unset |
| Web loads, login spins | `API_INTERNAL_URL` unresolved — use the public API URL |
| Worker restarts | `REDIS_URL`/`DATABASE_URL` references missing |

## Why cookies just work

The browser only talks to the web service; Next.js rewrites proxy `/api/*`
server-side over Railway's private network → first-party cookies, no CORS.
