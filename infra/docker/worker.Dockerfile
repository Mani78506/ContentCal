# ContentCal worker — arq consumer + scheduler cron.
# Build context = repo root (Railway: Builder=Dockerfile, path infra/docker/worker.Dockerfile)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY packages/core ./packages/core
RUN pip install --no-cache-dir "packages/core"

COPY apps/worker ./apps/worker

WORKDIR /app/apps/worker

CMD ["arq", "worker.main.WorkerSettings"]
