# WppTrack Umbler Live Production Design

Date: 2026-07-21
Status: Approved for implementation

## Objective

Promote the validated Umbler integration from observation-only intake to
automatic processing of new paid WhatsApp conversations, while keeping the
MD1 channel isolated until its Meta Page/Pixel association is corrected.

Historical events remain controlled by the existing replay flow. Switching a
connection or channel to production must never release an accumulated backlog.

## Approved Activation Model

Production uses three independent gates:

1. `INBOUND_WEBHOOK_PRODUCTION_ENABLED=true` enables the runtime capability.
2. The webhook connection must use a certified parser and be explicitly set to
   `production`.
3. Each channel must be explicitly `active` and have at least one valid Meta
   route.

If any gate is closed, WppTrack still preserves and classifies the payload but
does not create a lead or conversion event. Newly discovered channels start
inactive. The MD1 channel therefore remains observed and replayable while the
validated channels can operate automatically.

## Time Boundary

Connections and channels record their production activation timestamps. A
delivery is eligible for live processing only when it was received after both
timestamps. Events accumulated during observation or while a channel was
paused continue to require manual replay.

This boundary prevents an activation click from unexpectedly sending hundreds
of historical conversions.

## Durable Processing

Each live event receives a unique production item. The item is persisted before
queue publication and tracks queued, processing, materialized, duplicate and
failed states. A dedicated BullMQ queue processes the item and the existing
conversion queue remains responsible for Meta delivery.

Materialization follows the already validated replay contract:

- reparse the encrypted payload with the certified parser;
- confirm the canonical event and exact workspace route;
- upsert the WhatsApp lead;
- record deterministic `LeadSubmitted` conversion data;
- enqueue CAPI only when the conversion log is `ready_to_send`.

The deterministic inbound dedupe key is shared with replay. A provider retry,
worker retry or later manual replay cannot create a second conversion.

## Activation Safety

Promoting a connection to production requires:

- the production environment flag;
- a certified parser;
- at least one active channel;
- every active channel to have a valid route;
- no active controlled-replay batch for the connection.

Returning to observation stops new automatic materialization without rejecting
webhook intake. Pausing the connection stops intake. Pausing one channel keeps
the other channels unchanged.

## User Interface

The integration card clearly distinguishes `Observando`, `Envio automatico`
and `Pausada`. In observation mode, managers can arm validated channels and
then explicitly activate automatic sending with a confirmation dialog. In
production, the primary safety action returns the connection to observation.

Channel actions use `Ativar envio` and `Pausar envio`. The MD1 channel remains
paused until its Page/Pixel pair is accepted by Meta.

## Rollout

1. Deploy schema, API and web with production disabled.
2. Confirm migrations and API health.
3. Set `INBOUND_WEBHOOK_PRODUCTION_ENABLED=true` and redeploy the API.
4. Activate only validated Umbler channels; leave MD1 paused.
5. Promote the Umbler connection to production.
6. Observe one new real CTWA event, then verify lead creation, conversion log,
   queue state and Meta acceptance.
