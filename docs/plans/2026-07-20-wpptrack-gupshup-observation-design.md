# WppTrack Gupshup Observation Bootstrap

Date: 2026-07-20
Status: Approved for implementation

## Objective

Add Gupshup to the existing provider-aware inbound webhook foundation so a
workspace can generate a protected callback URL and retain the first real
payload before WppTrack implements any provider-specific business behavior.

This bootstrap is observation-only. It must not create leads, discover
channels, register conversations, resolve Meta routes, enable replay or send
CAPI events.

## Documented Contract

Gupshup documents a common JSON callback envelope with these top-level fields:

- `app`;
- `timestamp`;
- `version`;
- `type`;
- `payload`.

Inbound customer messages use top-level `type: "message"`. Delivery status
notifications use `type: "message-event"`. For inbound messages,
`payload.id` is the WhatsApp message identifier and the nested payload varies
with the message type.

References:

- https://docs.gupshup.io/docs/what-is-an-inbound-message
- https://docs.gupshup.io/docs/subscriptions-and-notifications
- https://docs.gupshup.io/docs/message-events

The real customer callback remains authoritative. WppTrack does not assume
that the documented envelope already exposes the CTWA referral, connected
number or every field required by the canonical conversation parser.

## Bootstrap Behavior

- `gupshup` is a selectable inbound webhook provider.
- The seeded `gupshup/v1` parser release is `observation_only`.
- The protected URL is displayed only after creation or secret rotation.
- Exact JSON request bodies are stored through the existing encrypted inbox and
  retention policy.
- Exact retries are deduplicated by the existing raw-body identity fallback.
- The neutral parser stores only the safe event type and message identifier in
  the redacted summary.
- Every accepted JSON shape is classified as `unsupported_event` until the
  live contract is approved.
- The raw payload remains available to platform owners through the audited
  backoffice payload view.
- Parser certification remains blocked because the neutral parser emits no
  CTWA evidence.

## Next Gate

After the first real campaign conversation arrives:

1. inspect the encrypted payload through the backoffice;
2. identify inbound direction, connected number, message ID, event timestamp,
   contact identity, CTWA, ad ID and referral metadata;
3. add sanitized fixtures;
4. implement and test the strict provider parser;
5. observe real CTWA classifications before proposing certification or replay.
