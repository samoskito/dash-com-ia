# Gupshup Webhook Observation

Use this procedure only to capture and inspect the first real Gupshup payload.
The connection does not create leads or send conversions yet.

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

The expected bootstrap result is:

- provider `gupshup`;
- classification `unsupported_event`;
- payload available;
- no lead, channel, conversation, replay or CAPI side effect.

Do not certify or replay this provider until its real payload has been mapped
and covered by provider-specific tests.
