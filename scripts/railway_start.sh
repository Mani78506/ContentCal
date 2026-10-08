#!/bin/sh
# Railway start dispatch: one repo root serves both Python services.
# Worker service sets ROLE=worker; API service needs nothing (default).
set -e

# Railpack installs into /app/.venv; local dev uses the interpreter directly.
PY="/app/.venv/bin/python"
[ -x "$PY" ] || PY="python"
ARQ="/app/.venv/bin/arq"
[ -x "$ARQ" ] || ARQ="arq"

if [ "$ROLE" = "worker" ]; then
  cd apps/worker
  exec "$ARQ" worker.main.WorkerSettings
fi

exec "$PY" -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port "${PORT:-8000}"
