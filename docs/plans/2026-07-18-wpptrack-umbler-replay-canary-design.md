# Umbler replay canary operations

## Goal

Reduce the blast radius of the first production replay without weakening the
existing parser, route, retention, tenant or platform-owner barriers.

## Batch selection

The operator chooses one of four fixed scopes:

- `canary_1`: the oldest eligible event;
- `canary_5`: the five oldest eligible events;
- `canary_10`: the ten oldest eligible events;
- `remaining`: every remaining eligible event, capped at 500 per batch.

The default is always `canary_1`. The selected scope and effective item count
are persisted in the replay batch and included in the audit summary. Events
remain ordered by occurrence time and canonical ID.

## Retention visibility

The redacted preview exposes the nearest payload expiry among unmaterialized
CTWA events, including queued, processing and failed replay items. The web
calculates the remaining time and warns when the next payload expires within
48 hours. Retryable counts are recalculated from payloads that remain retained
at preview time. No payload, phone, CTWA identifier or lead identity is
returned by this preview.

## History

The preview returns the ten most recent batches instead of only the latest
batch. Each summary includes the selected scope, effective limit, outcome
counts, retry count and retryable failure count.

## Safe recovery

Replay items remain globally unique by normalized inbound event. A retry does
not create another item or another event owner. It resets only failed items
whose redacted error code is explicitly classified as transient:

- replay disabled while a queued batch was starting;
- unexpected internal failure;
- queue unavailable during an authorized recovery.

The same item records increment `attemptCount` and retain the latest safe error
code. Retry requires the replay gate, platform-owner authorization, exact
connection-name confirmation, a terminal batch and retained payload. All route,
parser, credential and attribution checks run again in the worker.

A PostgreSQL partial unique index permits at most one queued or processing
batch per workspace connection. Concurrent authorization attempts fail with a
redacted conflict response.

## Rollout

The feature ships behind the existing
`INBOUND_WEBHOOK_REPLAY_ENABLED` deployment gate. Observation remains active
and isolated while the gate is false. The first production sequence is one
event, five events, ten events and then the remaining eligible events.

The gate remains false until the customer's Meta routes are configured and the
operator explicitly begins the canary sequence.
