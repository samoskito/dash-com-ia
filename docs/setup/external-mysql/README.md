# External MySQL / Kinbox Setup

This foundation imports WhatsApp data from the standardized customer MySQL without exposing database credentials in the browser and without using MySQL during page rendering.

## Source responsibilities

- Meta OAuth and Graph API remain the recurring source for campaigns, ad accounts and media metrics.
- `vw_wpptrack_leads` supplies historical and current paid WhatsApp leads with CTWA.
- `vw_wpptrack_events` supplies paid conversations and conversion events with CTWA.
- The legacy `facebook_ads_*` and `contas_anuncio_*` tables are not queried by WppTrack after the Meta connection is active.

## Install order

1. Back up the customer database.
2. Replace `{{CLIENT_SUFFIX}}` in `kinbox-standard-schema.sql` with the existing suffix, for example `barbieri`.
3. Run the SQL once with a privileged MySQL operator account.
4. Create a dedicated read-only MySQL user and grant `SELECT` only on both WppTrack views.
5. Store that read-only account in the WppTrack backoffice connector. The API encrypts it with `EXTERNAL_CONNECTOR_ENCRYPTION_KEY`.
6. Test the connection, activate the connector and run the first sync in shadow mode.
7. Compare counts before enabling CAPI delivery from WppTrack.

The schema derives a stable cursor inside the read-only views. On a new install it does not alter, lock, delete or overwrite the existing lead table.

## Paid-traffic-only policy

The reviewed Kinbox contract is intentionally traffic-only. A message without `ctwa_clid` remains recoverable in the raw `wpptrack_webhook_inbox`, but it must not enter `wpptrack_tracking_events`, the legacy lead table, the WppTrack lead projection or the UI.

For an installation that previously accepted organic messages, replace `{{CLIENT_SUFFIX}}` and run `migrations/20260713_paid_traffic_only.sql` once after activating the corrected n8n workflow. The migration deletes only rows without CTWA from the two external business tables and recreates both views with the same filter. The PostgreSQL deploy migration `20260714040000_external_paid_traffic_only` removes the corresponding unsent organic projections from WppTrack.

## Historical projection refresh

`Reimportar leads` rereads `vw_wpptrack_leads` without moving the incremental lead cursor or incrementing lead duplicate counters. It refreshes the full phone display, timestamps, attribution and status in the WppTrack projection.

`first_message_at` values that contain only a calendar date (or midnight without an explicit offset) are interpreted in the connector timezone, normally `America/Sao_Paulo`. Operational timestamps such as `updated_at` and event `occurred_at` remain UTC. This distinction prevents a local midnight from being displayed and grouped on the previous day.

During this explicit refresh, `qualified_at` and `purchased_at` create missing `QualifiedLead` and `Purchase` records with delivery status `imported`. These historical records are countable in the dashboard but are never queued for Meta CAPI. Rows without CTWA are filtered before projection and cannot be reconstructed as `LeadSubmitted` by a reimport.

## Creative preview

The official Meta workflow already stores the referral `thumbnail` and `source_url` in the Kinbox lead row. To expose the thumbnail to WppTrack, run `migrations/20260713_add_lead_creative_thumbnail.sql` after replacing `{{CLIENT_SUFFIX}}`, then use `Reimportar leads` once. The API remains compatible with the previous view while this SQL is pending; lead sync continues and the detail page shows an unavailable-thumbnail state instead of failing.

Only public `http` or `https` URLs are returned to the web app. The detail page presents the image as the attributed creative and keeps the destination behind the `Ver no Instagram` action instead of displaying the raw URL.

## n8n dual-write contract

During shadow mode, keep the current workflows and add a MySQL insert into `wpptrack_tracking_events` before any Meta HTTP request. Never derive the canonical type from Kinbox `event_name`; each workflow owns a fixed type.

### Qualified lead workflow

Use `event_type='qualified_lead'`. Because Kinbox has no event ID, its approved fallback is one qualified event per connector and normalized phone.

The reviewed and sanitized import artifact is `n8n/kinbox-qualified-lead-dual-write.json`. Its deployment and rollback sequence is documented in `n8n/README.md`.

```sql
INSERT INTO wpptrack_tracking_events (
  dedupe_key, provider, event_type, source_event_name,
  external_lead_id, phone, occurred_at, event_local_date
) VALUES (
  CONCAT('kinbox:qualified:', :normalized_phone),
  'kinbox_mysql',
  'qualified_lead',
  :source_event_name,
  :external_lead_id,
  :normalized_phone,
  :occurred_at_utc,
  :event_local_date
)
ON DUPLICATE KEY UPDATE
  duplicate_count = duplicate_count + 1,
  updated_at = CURRENT_TIMESTAMP(3);
```

### Purchase workflow

Use `event_type='purchase'`. The daily key is a Kinbox-only fallback for this contract. It must not be copied into adapters that provide `transaction_id` or `external_event_id`.

The reviewed and sanitized import artifact is `n8n/kinbox-purchase-dual-write.json`. It intentionally leaves the ledger value null; the temporary legacy Meta node continues using the configured client average only until WppTrack CAPI cutover.

```sql
INSERT INTO wpptrack_tracking_events (
  dedupe_key, provider, event_type, source_event_name,
  external_lead_id, phone, occurred_at, event_local_date,
  value_cents, currency, value_source
) VALUES (
  CONCAT('kinbox:purchase:', :normalized_phone, ':', :event_local_date),
  'kinbox_mysql',
  'purchase',
  :source_event_name,
  :external_lead_id,
  :normalized_phone,
  :occurred_at_utc,
  :event_local_date,
  NULL,
  'BRL',
  NULL
)
ON DUPLICATE KEY UPDATE
  duplicate_count = duplicate_count + 1,
  updated_at = CURRENT_TIMESTAMP(3);
```

WppTrack snapshots the configured average purchase value during ingestion and labels it `configured_average`. The n8n workflow must not hardcode `4000` as if it were a real transaction value.

### Official Meta conversation workflow

Use `event_type='conversation_started'`, `provider='meta_whatsapp_official'` and the WhatsApp message ID (`wamid`) as both `external_event_id` and part of `dedupe_key`. Preserve `ctwa_clid`, `source_id` as `ad_id`, `source_url`, phone and event timestamp.

The reviewed Barbieri replacement is `n8n/meta-conversation-started-dual-write.json`. By explicit operator decision it does not validate POST signatures: it accepts the normal webhook JSON body, stores every delivery in `wpptrack_webhook_inbox` before returning `200`, handles all messages in a batched payload, stops messages without CTWA before any business read/write and records paid events in the ledger before legacy effects. The old n8n `LeadSubmitted` HTTP node remains disconnected because WppTrack already owns `conversation_started` delivery. A no-side-effect test workflow that accepts a real Meta payload is available at `n8n/meta-conversation-replay-safe-test.json`. Import and test instructions are in `n8n/README.md`.

## Security corrections before cutover

- Remove public pin data containing real customer information from exported workflows.
- Move every API token to an n8n credential; do not keep tokens in node headers or URLs.
- Add webhook authentication for Kinbox or restrict source IPs until native signed intake exists.
- For official Meta webhooks, validate `X-Hub-Signature-256` over the raw request body.
- Rotate the Uazapi token found inline in the reviewed Purchase export.
- Keep the WppTrack MySQL user read-only and separate from the n8n write user.

## Event-by-event CAPI ownership cutover

Shadow mode writes WppTrack leads/events but never sends them to Meta. Events collected before a cutover are reconciliation evidence, not a delivery backlog. When WppTrack assumes an event type, any older `ready_to_send` rows for that type are archived as `shadow_observed`; they must not be replayed.

Cut over one event type at a time from the platform backoffice:

1. Deploy the API, web app and the `20260714020000_external_capi_event_cutover` PostgreSQL migration.
2. Sync the connector and confirm that the selected event type is ready in its CAPI gate.
3. In `Backoffice > Clientes > Conectores MySQL`, choose `Assumir envio` for only that event and type `ASSUMIR ENVIO`.
4. After the activation succeeds, immediately disable only the corresponding legacy Meta HTTP-send node in n8n. Keep the webhook, MySQL ledger insert and legacy lead/table updates active.
5. Produce one new real event after the activation time and confirm it appears as `Enviado` in WppTrack and in Meta Events Manager.
6. Repeat for the next type only after the first one is confirmed.

WppTrack uses the same Meta `event_id` contract as the reviewed n8n workflows (`lead_<wamid>`, `qualified_<ctwa_clid>` and `purchase_<phone_sha256>_<local_date>`). A short overlap during the operator action is therefore deduplicated by Meta.

For rollback, re-enable the n8n Meta-send node first. Then use `Reverter CAPI` in the backoffice and type `REVERTER CAPI`. The rollback archives unsent WppTrack rows for that event type so a stale queue job cannot send after ownership returns to n8n.
