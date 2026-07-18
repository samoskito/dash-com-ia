# Umbler replay canary implementation

Status: implemented and locally verified; deployment gate must remain disabled
until Meta routing is completed.

## Wave 1 - Contracts and persistence

- [x] Add fixed replay selection modes.
- [x] Persist requested scope, effective limit and recovery counters.
- [x] Persist item attempt counters.
- [x] Add a forward-only Prisma migration.
- [x] Enforce one active batch per workspace connection in PostgreSQL.

## Wave 2 - API behavior

- [x] Apply the requested limit after all existing eligibility checks.
- [x] Return the next payload expiry and ten recent batches.
- [x] Recalculate recoverable failures from retained payloads.
- [x] Add platform-owner-only transient retry.
- [x] Revalidate the exact connection, payload and Meta route on every attempt.
- [x] Keep audit summaries redacted.

## Wave 3 - Backoffice

- [x] Default the authorization control to one event.
- [x] Show fixed canary choices with the effective count.
- [x] Warn when retained payloads approach expiry.
- [x] Show recent batches and retryable failure counts.
- [x] Require exact connection-name confirmation for recovery.

## Wave 4 - Verification

- [x] Migration and shared-schema tests.
- [x] Selection-order and limit tests.
- [x] Retry allowlist, idempotency, concurrency and expiry tests.
- [x] Backoffice action and render tests.
- [x] Shared/API/web typechecks and production builds.
- [x] Security scan for payload and identity exposure.

## Production checkpoint

- Keep `INBOUND_WEBHOOK_REPLAY_ENABLED=false`.
- Configure and validate Umbler channel routes to Meta destinations.
- Confirm the preview reports eligible events before enabling the gate.
- Execute one event, inspect lead and Meta event audit, then continue with five,
  ten and the remaining eligible records.
