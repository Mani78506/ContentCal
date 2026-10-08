#!/bin/sh
# Railway start dispatch: one repo root serves both Python services.
# Worker service sets ROLE=worker; API service needs nothing (default).
set -e

if [ "$ROLE" = "worker" ]; then
  cd apps/worker
  exec arq worker.main.WorkerSettings
fi

exec python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port "${PORT:-8000}"
