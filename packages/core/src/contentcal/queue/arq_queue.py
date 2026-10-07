import logging
from uuid import UUID

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from contentcal.config import get_settings
from contentcal.queue.base import JobQueue

log = logging.getLogger(__name__)


def redis_settings_from_url(url: str) -> RedisSettings:
    return RedisSettings.from_dsn(url)


class ArqJobQueue(JobQueue):
    def __init__(self) -> None:
        self._pool: ArqRedis | None = None

    async def _get_pool(self) -> ArqRedis:
        if self._pool is None:
            self._pool = await create_pool(redis_settings_from_url(get_settings().redis_url))
        return self._pool

    async def enqueue_publish(self, job_id: UUID) -> None:
        pool = await self._get_pool()
        await pool.enqueue_job("publish_job", str(job_id))

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None


async def try_enqueue(queue: JobQueue | None, job_id: UUID) -> bool:
    """Best-effort enqueue. Failure is logged, not raised — durability lives
    in the database and the scheduler tick will recover it."""
    if queue is None:
        return False
    try:
        await queue.enqueue_publish(job_id)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("Broker enqueue failed for job %s (scheduler will recover): %s", job_id, exc)
        return False
