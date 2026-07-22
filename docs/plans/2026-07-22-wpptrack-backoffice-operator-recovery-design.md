# WppTrack Backoffice Operator Navigator and Production Recovery

## Objective

Make inbound webhook operations navigable by workspace, connection, and channel,
while closing the production gap where a CTWA received after activation is later
resolved but never receives a production queue item.

This work must preserve the existing historical replay behavior and keep raw
provider callbacks auditable before a provider-specific parser is certified.

## Operator model

The backoffice starts with three human-readable selectors:

1. Workspace
2. Webhook connection
3. WhatsApp channel

The selected scope is reused by counters, delivery filters, payload links, and
operational actions. Technical IDs remain internal to requests and are not the
primary navigation mechanism.

Every delivery row identifies its workspace and connection. Message deliveries
also identify the normalized channel or channels discovered in that payload.
Provider callbacks that do not yet create normalized events remain visible with
an explicit `Aguardando parser` classification and an auditable raw payload.

## Separate operational lanes

### Delivery audit

Used to inspect all received callbacks, including:

- WhatsApp message observations
- conversion automation callbacks
- unsupported provider events, such as the first tag-change samples
- invalid or failed deliveries

### Historical replay

The existing replay remains unchanged. It accepts only CTWA events received
before the production activation boundary of the connection or channel.

### Production recovery

A new operation handles CTWA events received after activation that:

- belong to an active production connection and channel
- now have an exact validated Meta route
- still have an encrypted payload inside retention
- have no historical replay item
- have no production item

Recovery never moves a historical event into production and never duplicates an
existing production item. It creates the missing production items and queues
them through the normal production processor.

## Safety barriers

- platform owner authorization is required on every endpoint
- production feature gates must be enabled
- parser release must be certified
- connection and channel must be active in production
- event must be after both activation timestamps
- raw payload must still be available
- route must be exact and resolved
- selection is limited to 1, 5, 10, or the remaining eligible events, capped at
  500 per operation
- operator must type the exact connection name
- production item uniqueness keeps the operation idempotent
- every authorization is recorded in the audit log

## Provider tag callbacks

The dedicated Umbler tag webhook can be created now in observation mode. Until
the first real payload is inspected and a parser version is certified, the
callback is retained and displayed as unsupported. It must not create a lead or
conversion yet.

Because unsupported callbacks do not currently produce normalized events, their
future conversion requires either a dedicated provider-callback reparse path or
new callbacks after the certified parser is deployed. The CTWA replay and
production recovery flows must not reinterpret these callbacks.

## Acceptance criteria

- operator can find a client without copying a workspace ID
- operator can narrow deliveries to one connection and one channel
- rows clearly show which client and source produced the delivery
- tag-change payload is discoverable and auditable in the selected connection
- historical replay keeps its current activation boundary
- post-activation resolved gaps appear in a separate production recovery preview
- recovery canary creates and queues only the selected missing items
- repeated authorization does not duplicate production items
- tests cover scoping, safety boundaries, confirmation, idempotency, and UI
  actions
