"""Queue abstraction.

The API only records durable intent in `publishing_jobs`. Enqueueing into the
broker is a best-effort fast path; the worker's scheduler tick re-scans the
database, so a broker outage delays (never loses) a publish."""

from abc import ABC, abstractmethod
from uuid import UUID


class JobQueue(ABC):
    @abstractmethod
    async def enqueue_publish(self, job_id: UUID) -> None: ...

    async def close(self) -> None:  # pragma: no cover
        ...
