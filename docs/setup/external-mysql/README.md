# External MySQL / Kinbox Setup

This foundation imports WhatsApp data from the standardized customer MySQL without exposing database credentials in the browser and without using MySQL during page rendering.

## Source responsibilities

- Meta OAuth and Graph API remain the recurring source for campaigns, ad accounts and media metrics.
- `vw_wpptrack_leads` supplies historical and current WhatsApp leads.
- `vw_wpptrack_events` supplies append-only conversations and conversion events.
- The legacy `facebook_ads_*` and `contas_anuncio_*` tables are not queried by WppTrack after the Meta connection is active.

## Install order

1. Back up the customer database.
2. Replace `{{CLIENT_SUFFIX}}` in `kinbox-standard-schema.sql` with the existing suffix, for example `barbieri`.
3. Run the SQL once with a privileged MySQL operator account.
4. Create a dedicated read-only MySQL user and grant `SELECT` only on both WppTrack views.
5. Store that read-only account in the WppTrack backoffice connector. The API encrypts it with `EXTERNAL_CONNECTOR_ENCRYPTION_KEY`.
6. Test the connection, activate the connector and run the first sync in shadow mode.
7. Compare counts before enabling CAPI delivery from WppTrack.

The schema adds a stable numeric cursor to the legacy lead table. It does not alter or delete existing lead fields.

## n8n dual-write contract

During shadow mode, keep the current workflows and add a MySQL insert into `wpptrack_tracking_events` before any Meta HTTP request. Never derive the canonical type from Kinbox `event_name`; each workflow owns a fixed type.

### Qualified lead workflow

Use `event_type='qualified_lead'`. Because Kinbox has no event ID, its approved fallback is one qualified event per connector and normalized phone.

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

## Security corrections before cutover

- Remove public pin data containing real customer information from exported workflows.
- Move every API token to an n8n credential; do not keep tokens in node headers or URLs.
- Add webhook authentication for Kinbox or restrict source IPs until native signed intake exists.
- For official Meta webhooks, validate `X-Hub-Signature-256` over the raw request body.
- Rotate the Uazapi token found inline in the reviewed Purchase export.
- Keep the WppTrack MySQL user read-only and separate from the n8n write user.

## Cutover

Shadow mode writes WppTrack leads/events but never enqueues Meta CAPI. Compare daily totals by event type and normalized phone. Only after parity is approved should `shadowMode` be disabled and `capiSendEnabled` enabled. Then disable the old n8n Meta-send nodes, while retaining the event ledger write until the provider becomes native.
