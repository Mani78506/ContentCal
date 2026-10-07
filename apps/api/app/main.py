"""ContentCal API entrypoint.

Run:  uvicorn app.main:app --reload --app-dir apps/api
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from contentcal.config import get_settings
from contentcal.errors import AppError
from contentcal.queue import ArqJobQueue
from contentcal.services.media import storage_root

from app.routers import accounts, auth, content, dashboard, jobs, scheduling, workspaces

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("contentcal.api")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    queue = ArqJobQueue()
    app.state.queue = queue
    log.info("ContentCal API starting (environment=%s)", settings.environment)
    yield
    await queue.close()


app = FastAPI(title="ContentCal API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": {"code": exc.code, "message": exc.message}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # pydantic error ctx holds raw Exception objects — not JSON serializable
    errors = [{k: v for k, v in e.items() if k != "ctx"} for e in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={"detail": {"code": "validation_error", "message": "Invalid request", "errors": errors}},
    )


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "service": "contentcal-api", "version": "0.1.0"}


# Dev media serving. Production should serve from object storage + CDN.
app.mount("/media", StaticFiles(directory=storage_root(), check_dir=False), name="media")

PREFIX = "/api/v1"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(workspaces.router, prefix=PREFIX)
app.include_router(content.router, prefix=PREFIX)
app.include_router(scheduling.router, prefix=PREFIX)
app.include_router(accounts.router, prefix=PREFIX)
app.include_router(jobs.router, prefix=PREFIX)
app.include_router(dashboard.router, prefix=PREFIX)
