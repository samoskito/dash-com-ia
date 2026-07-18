# Umbler replay canary implementation

Status: implemented and locally verified; deployment gate must remain disabled
until Meta routing is completed.

## Operational checkpoint - 2026-07-18

- Umbler observation is active and receiving real deliveries.
- Snapshot at validation: 86 CTWA events pending Meta routing, 0 routed and
  0 materialized. Counts remain live while observation continues.
- Raw payload retention is active; the nearest observed expiry at this
  checkpoint is 2026-07-25.
- Parser v1 is certified.
- Channel readiness is deployed and correctly reports blocked channels with
  no configured Meta route.
- Keep the current webhook URL active. Do not rotate or remove the connection.
- Keep `INBOUND_WEBHOOK_REPLAY_ENABLED=false` until the customer's Meta
  structure is connected.

Next production session:

1. Connect the customer's Meta structure.
2. Configure and validate the exact route for every Umbler channel.
3. Confirm the replay preview reports retained eligible events.
4. Enable the replay gate and redeploy the API.
5. Execute one event, audit the lead and Meta response, then advance through
   five, ten and the remaining eligible events.

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
