# Umbler controlled replay

## Goal

Promote observed Umbler CTWA events into the existing WppTrack lead and Meta
CAPI pipelines without turning webhook reception into an automatic production
side effect.

The first rollout is deliberately restricted to the platform owner. Workspace
owners and team members can continue configuring channel routes, but they
cannot certify a parser or execute historical replay.

## Safety boundary

- `InboundWebhooksModule` remains observation-only.
- A separate replay module owns certification, preview, materialization and
  replay jobs.
- Receiving an Umbler webhook never creates a lead and never queues CAPI.
- Replay is disabled unless `INBOUND_WEBHOOK_REPLAY_ENABLED=true`.
- Parser certification is required before a replay can be authorized.
- The operator must type the exact connection name before creating a batch.
- Only events with CTWA and an exact active Meta route are eligible.
- The encrypted raw payload must still exist and be inside its seven-day
  retention window.
- One normalized inbound event can belong to at most one replay item.
- Existing lead, conversion-log and BullMQ idempotency remain authoritative.
- Existing OAuth and external-MySQL flows, including Barbieri, are not changed.

## Operator flow

1. Open a webhook connection in the platform-owner backoffice.
2. Review the replay preview:
   - total CTWA observed;
   - route resolved or unresolved;
   - payload available or expired;
   - already materialized;
   - currently eligible.
3. Certify the exact parser release after validating a live provider payload.
4. Enable the deployment gate for the controlled rollout.
5. Type the exact connection name and authorize the batch.
6. Monitor batch materialization and the existing Meta event audit separately.

## Persistence

### Replay batch

Stores the platform-owner authorization and aggregate progress:

- workspace and connection scope;
- requesting platform owner;
- status (`queued`, `processing`, `completed`,
  `completed_with_failures`, `failed`);
- total, materialized, duplicate, skipped and failed counters;
- start and completion timestamps.

### Replay item

Owns one inbound normalized event:

- unique inbound event ID;
- batch and workspace scope;
- status (`queued`, `processing`, `materialized`, `duplicate`, `skipped`,
  `failed`);
- resulting lead and conversion event IDs;
- bounded technical error code;
- processing timestamp.

The unique event relation prevents a second batch from owning the same event.
Retries reuse the same item and the existing deterministic conversion dedupe
key.

## Materialization

For each eligible item, the worker:

1. Reloads the event, delivery, connection, parser release and resolved route
   under the same workspace.
2. Confirms the parser is certified and the replay gate is enabled.
3. Decrypts the retained payload and parses it with the exact registered
   provider/version parser.
4. Matches the parsed event by its canonical dedupe key.
5. Resolves campaign and ad-set hierarchy from the workspace Meta ad snapshot.
6. Upserts the lead using the existing phone identity policy.
7. Records `LeadSubmitted` through `ConversionEventsService` with:
   - deterministic inbound dedupe key;
   - original provider occurrence time;
   - exact business connection, reporting account and destination route;
   - redacted source summary only.
8. Queues the existing CAPI delivery job only when the conversion log is ready.

The replay batch tracks materialization, not Meta acceptance. Meta delivery
status stays in `ConversionEventLog`, where retries and audit already live.

## Privacy

- Replay preview never returns raw payload, phone, contact name, message body or
  CTWA value.
- Raw payload remains encrypted and expires under the existing retention job.
- Replay audit summaries contain counts and identifiers only.
- The lead record receives the minimum operational identity required by the
  product.
- Conversion source payload is a redacted provider summary.

## Rollout

1. Deploy schema, API and web with replay disabled.
2. Validate migration and backoffice preview.
3. Configure all required Umbler channel routes.
4. Certify Umbler parser `v1`.
5. Set `INBOUND_WEBHOOK_REPLAY_ENABLED=true` and redeploy the API.
6. Re-open the preview, confirm the eligible count and authorize one batch.
7. Monitor replay items, conversion logs and Meta delivery.
8. Keep automatic production processing out of scope for this rollout.
