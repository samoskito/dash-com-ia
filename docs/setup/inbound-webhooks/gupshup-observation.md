# Gupshup Webhook Observation

Use this procedure to capture, inspect and safely reclassify retained Gupshup
payloads. The `v1` parser recognizes real WhatsApp Cloud message envelopes and
keeps releases in observation until they are explicitly certified.

## Create the WppTrack URL

1. Open the client workspace in WppTrack.
2. Go to `Integracoes`.
3. In `Webhooks de plataformas WhatsApp`, click `Adicionar conexao`.
4. Select `Gupshup`.
5. Give the connection a recognizable name.
6. Click `Gerar webhook`.
7. Copy the URL immediately. It is shown only once.

Generating a new URL later invalidates the previous URL.

## Register It in Gupshup

1. Open the correct Gupshup WhatsApp app.
2. Open its webhook or callback configuration.
3. Paste the complete WppTrack URL, including its `token` query parameter.
4. Enable inbound message notifications.
5. Keep the message status notifications needed for payload discovery.
6. Save the callback.

Gupshup must send JSON with `Content-Type: application/json`.

## Validate the First Delivery

1. Start a real click-to-WhatsApp campaign conversation.
2. Open `Backoffice > Webhooks WhatsApp`.
3. Open `Filtros avancados`.
4. Select `Gupshup`.
5. Open the newest delivery with `Ver payload`.

Before the provider-specific parser is available, the expected bootstrap result
is:

- provider `gupshup`;
- classification `unsupported_event`;
- payload available;
- no lead, channel, conversation, replay or CAPI side effect.

Do not certify this provider until its real payload has been mapped and covered
by provider-specific tests.

## Reprocess One Retained Payload

Use parser recovery only after the matching parser version is deployed.

1. Open `Backoffice > Webhooks WhatsApp`.
2. Select the client, Gupshup connection and channel.
3. Open the `Aguardando parser` result.
4. Find one retained delivery with `Evento nao suportado`.
5. Inspect it with `Ver payload`.
6. Click `Reprocessar parser` only on that delivery.
7. Refresh the scope and verify that the delivery moved to `CTWA pendente`,
   `CTWA roteado` or `Sem CTWA`.

`Reprocessar parser` is different from `Reprocessar conversao`: it returns one
terminal delivery to the original parser queue, clears its old normalized
classification and preserves the same delivery identity for deduplication.

The action is available only while the encrypted payload is retained, no
canonical event exists and the exact parser release is still registered. A
repeated request is idempotent.

For the first canary, keep the parser release in `observation_only`. Reclassify
one payload, confirm the normalized event and only then continue in small
batches. Do not certify or activate Meta delivery as part of this canary.
