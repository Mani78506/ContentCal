# Social Providers

## The contract

```python
class SocialProviderBase(ABC):
    provider: SocialProvider

    async def validate(self, account) -> bool: ...
    async def publish(self, account, request: PublishRequest) -> PublishResult: ...
    async def get_status(self, account, platform_post_id) -> dict: ...
```

`PublishRequest` carries `title`, `caption`, `media[]`, `platform_payload`,
and — critically — `idempotency_key`. **A provider MUST treat the key as a
dedupe token**: publishing twice with the same key must never create two
posts on the platform.

`PublishResult` carries `success`, `platform_post_id/url`, `error`, and
`retryable` (false → immediate DEAD, no backoff loop).

## Registry

`contentcal/providers/registry.py` maps `SocialProvider` enum → class.
Callers (scheduler, worker) always resolve through `get_provider()`, never
import a concrete provider. Unknown/missing registrations raise
`ProviderNotImplementedError` → surfaced as a 422. **Nothing is faked.**

## Today: MockProvider

- Registered as `provider = mock`, clearly badged "dev mock" in the UI.
- Simulates latency and returns a synthetic `mock_<hex>` post ID and
  `https://mock.local/p/…` URL.
- Exercises the ENTIRE real pipeline: jobs, claims, attempts, retries,
  statuses, calendar — so when a real provider lands, zero upstream code
  changes.

## Adding a real provider (checklist)

1. Create `packages/core/src/contentcal/providers/<name>.py` implementing the
   ABC against the platform's **official** API.
2. Add OAuth flow endpoints under `/accounts/connect/<name>` that store
   tokens via `encrypt_secret()` (never plaintext, never in responses).
3. Register the class in `_REGISTRY` (one line) — calendar/API/worker need
   no changes.
4. Honour the idempotency key (platform-side dedupe where supported, or a
   provider-side ledger keyed by our key).
5. Map platform error types to `retryable` correctly (rate limits → true,
   auth failure → false + mark account `expired`).
6. Add tests mirroring `tests/test_jobs.py` provider fakes.

## Roadmap notes

| Platform | API | Publishing capability |
|---|---|---|
| Instagram | Graph API | Reels/photos via Content Publishing API (business accounts) |
| YouTube | Data API v3 | Video upload (resumable) |
| LinkedIn | Posts API | Text/image/video share posts |
| Facebook | Graph API | Page posts |
| X | API v2 | Create post |

Each requires app review/scopes on the platform side — none of that is
pretended to exist yet.
