"""ContentCal worker.

Responsibilities:
1. `publish_job` — execute one durable publishing job (claim → provider →
   result + attempt journal).
2. `scheduler_tick` (cron) — scan `publishing_jobs` for PENDING jobs whose
   run_at is due and enqueue them. This is the durable fallback that makes
   broker outages and API crashes harmless.

Run:  arq worker.main.WorkerSettings   (cwd: apps/worker)
"""

import logging
import socket
from datetime import UTC, datetime

from arq import cron
from arq.connections import RedisSettings

from contentcal.config import get_settings
from contentcal.database import SessionFactory
from contentcal.services.jobs import claim_job, execute_job
from contentcal.services.scheduling import due_jobs

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("contentcal.worker")

settings = get_settings()
WORKER_ID = f"{socket.gethostname()}"


async def publish_job(ctx: dict, job_id: str) -> str:
    import uuid as _uuid

    async with SessionFactory() as session:
        job = await claim_job(session, _uuid.UUID(job_id), worker_id=WORKER_ID)
        if job is None:
            log.info("job %s already claimed or terminal; skipping", job_id)
            return "skipped"
        result = await execute_job(session, job)
        log.info("job %s -> %s", job_id, result.value)
        return result.value


async def scheduler_tick(ctx: dict) -> int:
    """Enqueue due pending jobs. Idempotent — claim_job re-checks status, so
    double-enqueue from overlapping ticks is harmless."""
    redis = ctx["redis"]
    async with SessionFactory() as session:
        jobs = await due_jobs(session, datetime.now(UTC))
        for job in jobs:
            await redis.enqueue_job("publish_job", str(job.id))
        if jobs:
            log.info("enqueued %d due job(s)", len(jobs))
        return len(jobs)


async def on_startup(ctx: dict) -> None:
    log.info("worker online (id=%s, tick=%ss)", WORKER_ID, settings.scheduler_tick_seconds)


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [publish_job]
    cron_jobs = [cron(scheduler_tick, second=set(range(0, 60, max(settings.scheduler_tick_seconds, 5))), run_at_startup=True)]
    on_startup = on_startup
    max_jobs = 10
    job_timeout = 120
    max_tries = 1  # retries are managed by our own durable state machine
