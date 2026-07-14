# Kinbox n8n Dual-Write Artifacts

## Qualified lead

`kinbox-qualified-lead-dual-write.json` is the sanitized, inactive replacement for the reviewed workflow `Etapa 3 - [Kinbox] Lead Qualificado`.

The artifact:

- normalizes the Kinbox phone to digits before lookup and deduplication;
- inserts `qualified_lead` into `wpptrack_tracking_events` before lead lookup, Meta CAPI or legacy table updates;
- uses the fixed key `kinbox:qualified:<normalized_phone>`;
- increments `duplicate_count` on retries instead of creating a second business event;
- keeps the existing Meta CAPI send and legacy lead update for shadow reconciliation;
- removes production `pinData`, the disconnected HTTP node with an inline token, workflow/webhook IDs and n8n credential IDs;
- is exported with `active=false` and the original production webhook path.

The insert uses n8n MySQL query parameters. Do not replace `$1` through `$7` with string interpolation.

## Qualified lead deployment

1. Keep the current production workflow active.
2. Import `kinbox-qualified-lead-dual-write.json`; it must remain inactive.
3. Select the existing n8n MySQL write credential in every MySQL node. Never select the WppTrack `wpptrack_reader` credential because it is intentionally read-only.
4. Confirm that `Registrar evento qualificado` is between `Edit Fields` and `Busca Telefone`.
5. Confirm that the Meta conversion and legacy update nodes remain enabled.
6. During a short controlled window, deactivate the old workflow and immediately activate the imported replacement. Two active workflows cannot share the same production webhook path.
7. Wait for the next real qualified lead and verify the ledger before running WppTrack sync.
8. If the new workflow fails, deactivate it and reactivate the old workflow. Do not delete a ledger row that was already inserted successfully.

Verification query:

```sql
SELECT
  id,
  event_type,
  source_event_name,
  phone,
  occurred_at,
  duplicate_count
FROM wpptrack_tracking_events
WHERE event_type = 'qualified_lead'
ORDER BY id DESC
LIMIT 10;
```

Expected result for a new event:

- `event_type = qualified_lead` regardless of the Kinbox event name;
- normalized phone containing digits only;
- one row for the phone;
- a retry increments `duplicate_count` on that row.

Keep the old Meta delivery inside the replacement until WppTrack shadow totals are reconciled and explicitly approved. The inline token found in the source export must be rotated even though its node was disconnected.

## Purchase

`kinbox-purchase-dual-write.json` is the sanitized, inactive replacement for `Etapa 4 - [Kinbox] Purchase`.

The artifact:

- inserts `purchase` before lead lookup, Meta CAPI or legacy updates;
- uses the Kinbox-only key `kinbox:purchase:<normalized_phone>:<local_date>`;
- stores no invented transaction value in the ledger, leaving `value_cents` and `value_source` null so WppTrack can snapshot the configured average;
- keeps the temporary legacy CAPI value of `4000` until WppTrack CAPI is approved;
- changes the legacy Meta `event_id` to the hashed phone plus local date, deduplicating retries while allowing a purchase on another day;
- removes production `pinData`, the disconnected HTTP node with an inline token, workflow/webhook IDs and n8n credential IDs;
- is exported with `active=false` and the original `/purchase` webhook path.

### Purchase deployment

1. Keep the current Purchase workflow active while importing the replacement.
2. Select the existing n8n MySQL write credential in all MySQL nodes.
3. Confirm that `Registrar evento de compra` is between `Edit Fields` and `Busca Telefone`.
4. Deactivate the old Purchase workflow and immediately activate the replacement. Never keep both active on `/purchase`.
5. Keep the old workflow available for rollback and wait for the next real Kinbox Purchase.

Verification query:

```sql
SELECT
  id,
  dedupe_key,
  event_type,
  phone,
  event_local_date,
  value_cents,
  value_source,
  duplicate_count
FROM wpptrack_tracking_events
WHERE event_type = 'purchase'
ORDER BY id DESC
LIMIT 10;
```

For this Kinbox contract, a same-day retry must increment `duplicate_count`; a purchase on another local date must create another row. Before WppTrack ingestion, `value_cents` and `value_source` must remain null.

## Official Meta conversation

`meta-conversation-started-dual-write.json` is the sanitized, inactive replacement for `Etapa 2 - [Meta] Recebimento de Mensagem`.

The artifact:

- accepts the normal parsed JSON body without HMAC validation or a Crypto credential, by explicit operator decision;
- stores every delivery in `wpptrack_webhook_inbox` before returning `200`, so a downstream failure remains recoverable;
- reads every `entry[].changes[].value.messages[]` item instead of assuming the first array item;
- requires a non-empty `ctwa_clid` immediately after splitting the messages, before history lookup, ledger or lead writes;
- inserts paid `conversation_started` with provider `meta_whatsapp_official` before the legacy lead/CAPI flow;
- uses `meta:conversation:<phone_number_id>:<wamid>` as the dedupe key and stores the `wamid` as `external_event_id`;
- preserves the original message timestamp, phone, `ctwa_clid`, `source_id` as `ad_id`, and `source_url`;
- terminates every message without CTWA after the durable inbox, without creating a business lead or event;
- increments `duplicate_count` for a repeated `wamid` without repeating the legacy upsert or CAPI send;
- keeps the legacy `whatsapp_anuncio_barbieri` upsert only for paid CTWA messages, with the CTWA filter before the legacy write;
- keeps the old n8n `LeadSubmitted` HTTP node disconnected because WppTrack already owns `conversation_started` delivery after the approved cutover;
- acknowledges valid status-only payloads without creating an event;
- recognizes `wpptrack_test_mode=true` and routes it to a no-side-effect dry-run result;
- removes production `pinData`, the disconnected subscription node with an inline Meta token, workflow/webhook IDs and n8n credential IDs;
- replaces the GET verification token with `REPLACE_WITH_EXISTING_META_VERIFY_TOKEN` and exports with `active=false`.

### Official Meta deployment

1. Keep the previous official Meta workflow active while preparing the replacement.
2. Apply `../meta-webhook-inbox.sql` only if `wpptrack_webhook_inbox` does not already exist. No hardening migration is required.
3. Import the replacement and keep it inactive. It must not contain `Calcular assinatura Meta`, `Assinatura valida?`, `Responder 401` or a Crypto credential.
4. In the imported workflow's GET `IF` node, replace `REPLACE_WITH_EXISTING_META_VERIFY_TOKEN` with the verification token already present in the old workflow.
5. Select the existing n8n MySQL write credential in `Guardar entrega antes do ACK`, `Buscar historico da conversa`, `Registrar conversation_started`, `Inserir ou atualizar Lead no Banco`, `Buscar tokens` and `atualizacao lead no banco`. Never use `wpptrack_reader`.
6. Confirm that the POST path is `Webhook1 -> Preparar entrega Meta -> Guardar entrega antes do ACK -> Restaurar entrega salva -> Responder 200`.
7. Confirm that `Filtra page_id e pixel_id` goes directly to `atualizar dados` and that `Envia conversao de Lead` has no connection. Reconnecting it while WppTrack owns Conversas would duplicate CAPI delivery.
8. During a controlled window, deactivate the old workflow and immediately activate the replacement. Both cannot own the same GET/POST production path.
9. Replace `{{CLIENT_SUFFIX}}` and run `../migrations/20260713_paid_traffic_only.sql` once. It removes only business rows without CTWA and recreates both read views with the paid-only filter; it preserves `wpptrack_webhook_inbox`.
10. Run the safe test described below and keep the old workflow inactive for immediate rollback until the result is confirmed.

### Official Meta test

Use `meta-conversation-replay-safe-test.json` to test before a real lead:

1. Import it as a separate inactive workflow. It requires no credential.
2. In `Configurar replay`, replace `REPLACE_WITH_ACTIVE_PRODUCTION_WEBHOOK_URL` with the production URL shown by `Webhook1` and paste the captured real Meta payload into `payload_json`.
3. Run `Executar teste seguro`. The tester adds `wpptrack_test_mode=true` and sends the JSON to the real webhook.
4. The main workflow must return `EVENT_RECEIVED`, insert one row with `is_test=1` into `wpptrack_webhook_inbox`, and finish at `Resultado do teste seguro`.
5. Confirm that `production_side_effects_executed=false`. `Registrar conversation_started`, legacy lead writes and Meta CAPI must remain unexecuted.

This dry-run tests the real POST path, durable MySQL write, payload normalization, the early CTWA gate and the paid path without changing the event ledger, a lead or Meta CAPI.

Verification query:

```sql
SELECT
  id,
  dedupe_key,
  provider,
  event_type,
  external_event_id,
  phone,
  occurred_at,
  ctwa_clid,
  ad_id,
  duplicate_count
FROM wpptrack_tracking_events
WHERE event_type = 'conversation_started'
ORDER BY id DESC
LIMIT 10;
```

Expected result:

- `provider = meta_whatsapp_official`;
- `event_type = conversation_started`;
- `external_event_id` contains the official `wamid`;
- a paid first message preserves `ctwa_clid` and `ad_id`;
- a retry keeps one row and increments `duplicate_count`;
- a message without CTWA, including the first contact from a phone, creates no conversation event or lead row.

The Meta access token embedded in the disconnected source node must be rotated even though that node was removed from the artifact.

## Disabling legacy Meta delivery

Do not deactivate an entire workflow during the WppTrack CAPI cutover. The event ledger remains the external source of truth until the provider is native, so each workflow must continue receiving webhooks and writing MySQL rows.

For each event type:

1. Activate ownership in WppTrack first with `Assumir envio`.
2. Immediately disable or disconnect only its legacy Meta HTTP-send node:
   - conversation: the `LeadSubmitted` Graph API request;
   - qualified lead: `Envia conversao de Lead Qualificado`;
   - purchase: the corresponding `Purchase` Graph API request.
3. Keep `Registrar conversation_started`, `Registrar evento qualificado` or the Purchase ledger insert active.
4. Keep the remaining workflow effects active unless they are separately migrated.
5. Validate one event created after the WppTrack activation time before moving to the next type.

If rollback is needed, restore the n8n Meta HTTP node first and only then use `Reverter CAPI` in WppTrack. Never delete paid/CTWA ledger rows manually. The reviewed `20260713_paid_traffic_only.sql` cleanup is the only intentional deletion and targets only out-of-scope rows without CTWA.

## Regeneration

If the production workflow changes before deployment, regenerate the sanitized artifact from a fresh export:

```powershell
node docs/setup/external-mysql/n8n/build-qualified-dual-write.mjs `
  "C:\path\to\Etapa 3 - [Kinbox] Lead Qualificado.json" `
  "docs\setup\external-mysql\n8n\kinbox-qualified-lead-dual-write.json"

node docs/setup/external-mysql/n8n/build-purchase-dual-write.mjs `
  "C:\path\to\Etapa 4 - [Kinbox] Purchase.json" `
  "docs\setup\external-mysql\n8n\kinbox-purchase-dual-write.json"

node docs/setup/external-mysql/n8n/build-meta-conversation-dual-write.mjs `
  "C:\path\to\Etapa 2 - [Meta] Recebimento de Mensagem.json" `
  "docs\setup\external-mysql\n8n\meta-conversation-started-dual-write.json"

node docs/setup/external-mysql/n8n/validate-meta-conversation-artifact.mjs `
  "docs\setup\external-mysql\n8n\meta-conversation-started-dual-write.json"

node docs/setup/external-mysql/n8n/build-meta-conversation-replay-test.mjs `
  "docs\setup\external-mysql\n8n\meta-conversation-replay-safe-test.json"

node docs/setup/external-mysql/n8n/validate-meta-conversation-replay-test.mjs `
  "docs\setup\external-mysql\n8n\meta-conversation-replay-safe-test.json"

```
