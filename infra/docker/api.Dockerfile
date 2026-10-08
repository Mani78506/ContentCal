# ContentCal API — FastAPI + uvicorn.
# Build context = repo root (Railway: Builder=Dockerfile, path infra/docker/api.Dockerfile)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Core package first for better layer caching
COPY packages/core ./packages/core
RUN pip install --no-cache-dir "packages/core"

COPY apps/api ./apps/api
COPY alembic ./alembic
COPY alembic.ini ./

EXPOSE 8000

CMD ["sh", "-c", "python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port ${PORT:-8000}"]
