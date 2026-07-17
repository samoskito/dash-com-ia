# WppTrack Umbler Inbound Webhook Design

Date: 2026-07-17
Status: Approved for implementation planning

## 1. Objective

Add a native inbound-webhook integration that lets a workspace generate a
protected WppTrack URL, register it in Umbler Talk and observe real message
events before any production side effect is enabled.

Umbler is the first provider, but the foundation must support later parsers for
Data Crazy, R100 WPP, 360dialog and other message platforms. The transport,
security, retention and audit layers are shared. Payload interpretation remains
strictly provider-specific.

The first release ends in observation mode. It must not create leads, register
`conversation_started`, enqueue CAPI or alter any existing integration.

## 2. Approved Product Decisions

- A workspace may create several Umbler webhook connections.
- One Umbler webhook connection may receive events for several connected
  numbers.
- Connected numbers are discovered from real payloads.
- A number may be associated with several Meta BMs.
- A Meta BM may be associated with several numbers.
- Each number/BM route may use the BM default conversion destination or an
  exact Pixel/Page override.
- Only paid-attributed inbound messages with a non-empty CTWA identifier are
  candidates for a real conversation.
- Organic messages are retained only for technical observation and are not
  counted as leads or conversations.
- Ambiguous Meta routing fails closed. WppTrack never guesses a default BM.
- Full payloads are encrypted and retained for seven days.
- Full payload access is restricted to platform owners and is audited.
- A provider parser must be certified by a platform owner before any connection
  using that parser can enter production.
- After parser certification, workspace owners and admins may activate a
  connection whose routes are valid.

## 3. Current Umbler Contract

The historical payload supplied for this design matches the current documented
Umbler Talk webhook envelope:

- `Type`: provider event type, such as `Message`;
- `EventDate`: event timestamp in ISO 8601;
- `Payload.Type`: currently `Chat`;
- `Payload.Content`: the Umbler `BasicChatModel`;
- `EventId`: stable delivery identifier that remains the same across retries.

The supplied payload also contains:

- `Payload.Content.Organization.Id`;
- `Payload.Content.Channel.Id`;
- `Payload.Content.Channel.PhoneNumber`;
- `Payload.Content.Channel.Name`;
- `Payload.Content.Contact.Id`;
- `Payload.Content.Contact.PhoneNumber`;
- `Payload.Content.LastMessage.Id`;
- `Payload.Content.LastMessage.Source`;
- `Payload.Content.LastMessage.IsPrivate`;
- `Payload.Content.LastMessage.EventAtUTC`;
- `Payload.Content.LastMessage.Ad.CTWaCLId`;
- `Payload.Content.LastMessage.Ad.SourceId`;
- ad URL, title, description, thumbnail and media metadata.

Umbler considers a delivery successful when the endpoint returns a 2xx status
in less than five seconds. Failed deliveries may be retried, with the attempt
number in `x-attempt`. WppTrack must durably accept the delivery and respond
before running provider parsing or route analysis.

Reference:
https://help.umbler.com/hc/pt-br/articles/14023563758861-Como-criar-Webhooks

## 4. Approaches Considered

### 4.1 Dedicated Umbler implementation

A dedicated table, endpoint and screen would be the shortest path for the first
provider. It would duplicate token handling, retention, diagnostics and UI for
every later platform. This approach is rejected.

### 4.2 User-configurable universal payload mapper

A generic field-mapping interface could accept arbitrary provider payloads, but
it would move parsing and security decisions into workspace configuration. It
would be difficult to validate and too easy to misroute sensitive conversion
data. This approach is rejected.

### 4.3 Shared connector infrastructure with provider parsers

This is the approved approach. Connections, authentication, encrypted inbox,
retention, queues, audit and channel routing are shared. Each provider owns a
versioned parser that validates its exact payload and produces canonical
events.

## 5. High-Level Architecture

The feature has five layers:

1. **Connection management** creates, lists, pauses and rotates webhook
   connections inside the authenticated workspace.
2. **Public ingestion** authenticates the opaque connection and secret,
   persists the raw delivery and returns 202.
3. **Provider parsing** selects the parser stored on the connection and emits
   zero or more canonical inbound events.
4. **Observation and routing** discovers channels, classifies CTWA eligibility
   and resolves exact Meta route candidates without executing them.
5. **Operations UI** displays connections, discovered channels, routing,
   delivery classifications and platform-owner payload inspection.

The public endpoint is provider-neutral:

```text
POST {API_PUBLIC_URL}/webhooks/inbound/{connectionId}?token={secret}
```

The provider is read from the persisted connection. It is never trusted from a
query parameter, header or payload field.

## 6. Data Model

### 6.1 Provider parser release

`InboundWebhookParserRelease` records:

- provider;
- parser version;
- status: `observation_only`, `certified` or `retired`;
- certification actor and timestamp;
- creation and update timestamps.

The first seeded release is `umbler/v1` in `observation_only`.

### 6.2 Webhook connection

`InboundWebhookConnection` records:

- workspace;
- provider;
- display name;
- parser version;
- hashed webhook secret;
- status: `observation`, `production` or `paused`;
- creator;
- last delivery and last successful parse timestamps;
- creation and update timestamps.

The plaintext secret is returned only when the connection is created or
rotated. Rotation invalidates the previous URL immediately.

### 6.3 Discovered channel

`InboundWebhookChannel` records:

- workspace and connection;
- provider organization ID;
- provider channel ID;
- normalized connected phone;
- provider channel name;
- state: `discovered`, `active` or `paused`;
- first and last seen timestamps.

The stable identity is connection + organization ID + channel ID. Name and
phone are mutable display attributes.

### 6.4 Channel-to-Meta route

`InboundWebhookChannelRoute` records:

- workspace and channel;
- Meta business connection;
- optional exact Meta reporting account;
- optional conversion destination override;
- status and validation result;
- creation and update timestamps.

This is a many-to-many routing table. A channel may have several BM routes, and
a BM route may be used by several channels. If no destination override is
stored, the existing account override or BM default destination applies.

Every referenced connection, account and destination must belong to the same
workspace. The API revalidates this invariant; it is not delegated to the
frontend.

### 6.5 Delivery inbox

`InboundWebhookDelivery` records:

- workspace, connection and provider;
- external delivery ID;
- provider event type;
- parser version;
- status and classification;
- first/last received timestamp and attempt count;
- encrypted raw payload, IV, authentication tag and key version;
- payload expiry timestamp;
- redacted normalized summary;
- parse/routing error code;
- processed timestamp.

Connection + external delivery ID is unique. A retry increments attempt
metadata without duplicating processing.

### 6.6 Canonical observed event

`InboundWebhookEvent` records zero or more normalized events per delivery:

- workspace, connection and channel;
- provider event and message identifiers;
- deterministic dedupe key;
- occurred timestamp;
- contact identity hash;
- ad ID;
- CTWA presence;
- classification and reason;
- resolved BM, account and destination references when unambiguous;
- redacted summary.

Connection + deterministic dedupe key is unique. This second idempotency layer
protects against distinct provider deliveries that contain the same message.

## 7. Umbler Parser v1

The parser accepts an object with the documented Umbler envelope. It emits a
paid conversation candidate only when all conditions are true:

- root `Type` is `Message`;
- `Payload.Type` is `Chat`;
- `LastMessage.Source` identifies the contact;
- `LastMessage.IsPrivate` is false;
- `LastMessage.Ad.CTWaCLId` is non-empty;
- organization ID, channel ID, message ID, contact phone and timestamp are
  valid.

Canonical mapping:

- external delivery ID: root `EventId`;
- external message ID: `LastMessage.Id`;
- organization: `Organization.Id`;
- channel: `Channel.Id`;
- connected number: `Channel.PhoneNumber`;
- contact external ID: `Contact.Id`;
- contact phone: `Contact.PhoneNumber`;
- occurred at: `LastMessage.EventAtUTC`, falling back to `EventDate`;
- ad ID: `LastMessage.Ad.SourceId`;
- CTWA: `LastMessage.Ad.CTWaCLId`;
- source URL and creative metadata: `LastMessage.Ad`.

The conversation dedupe key is derived from provider, organization, channel and
message ID. It does not use contact phone or mutable names.

Messages without CTWA are classified `ignored_no_ctwa`. Unsupported event
types, private notes, outbound messages and malformed payloads receive explicit
classifications. They remain visible in technical observation but never become
conversation candidates.

## 8. Exact Meta Route Resolution

The connected number alone does not choose a Meta destination.

For a CTWA candidate, WppTrack:

1. resolves the discovered channel;
2. reads the Umbler ad ID from `Ad.SourceId`;
3. finds the workspace-scoped `MetaAd`;
4. resolves its ad account and normalized Meta business connection;
5. verifies that the channel has an active route allowing that BM/account;
6. applies the channel route destination override, account override or BM
   default destination;
7. records the resolved route as an observation result.

This extends the existing `MetaConnectionResolverService`, which already
resolves an attributed ad ID to an exact reporting account, business connection
and conversion destination.

If the ad is unknown, Meta data has not been synchronized, the channel does not
allow the resolved BM or more than one route remains possible, classification
is `eligible_route_unresolved`. There is no fallback BM or Pixel.

## 9. Security and Privacy

- Public ingestion never accepts a workspace ID.
- Tenant context comes only from the authenticated connection record.
- The webhook secret has at least 256 bits of entropy and is stored only as a
  SHA-256 hash.
- Secret comparison is constant-time.
- Query secrets are redacted from application, proxy guidance, audit and error
  logs.
- JSON content type and a conservative request-size limit are enforced.
- Raw payloads use authenticated encryption with a dedicated
  `INBOUND_WEBHOOK_ENCRYPTION_KEY`.
- Raw payloads expire after seven days and are deleted by a scheduled cleanup
  job.
- Normalized summaries exclude message content, full contact phone, CTWA value,
  media URLs and other unnecessary personal data.
- Platform-owner raw payload access creates an audit entry with actor, delivery,
  workspace, timestamp and source IP.
- Workspace owners/admins see normalized observations and routes, not raw
  payloads.
- Analysts have read-only access to normalized connection status if the product
  exposes that section to them.
- Unauthorized and nonexistent connection resources use the same generic
  response in authenticated management APIs.

## 10. Acknowledgement, Queue and Failure Handling

The public request path performs only:

1. connection and token validation;
2. basic body validation and size enforcement;
3. encrypted durable persistence or retry update;
4. queue publication;
5. HTTP 202 response.

Parsing, channel discovery and route resolution run in BullMQ.

If persistence fails, the endpoint returns a non-2xx response so Umbler retries.
If queue publication fails after persistence, the delivery remains pending and
can be recovered by a reconciliation job. Duplicate deliveries return 202 and
do not enqueue duplicate work.

Parser failures are isolated to the delivery. They never disable current Meta,
Uazapi, external MySQL or CAPI paths.

## 11. Permissions and Certification

The existing `canManageIntegrations` capability controls connection creation,
rotation, routing, pause and activation. It is currently granted to workspace
owners and admins. Platform owners retain full support authority.

Parser certification is platform-only:

- a parser release starts `observation_only`;
- only a platform owner may certify it;
- certification is audited;
- retired parser versions cannot be selected for new connections.

A connection may enter production only when:

- its parser release is certified;
- at least one active channel route exists;
- every enabled route references an active Meta connection;
- exact destination resolution succeeds;
- the actor has integration-management permission.

The first implementation intentionally omits the production transition and all
production side effects. It may persist the certification model and guards, but
Umbler remains observation-only until the real-payload checkpoint is approved.

## 12. Operations UI

The Integrations page gains a `Message sources` section with:

- provider selector;
- connection name;
- generated URL with copy action;
- observation/production/paused status;
- last delivery and parse health;
- eligible, unresolved, no-CTWA, duplicate and invalid counters;
- discovered organization, channel name and connected number;
- many-to-many channel/BM/destination route editor;
- token rotation and pause controls.

The connection URL is shown after creation or rotation. The secret cannot be
retrieved later.

The platform backoffice gains provider and classification filters plus an
audited raw-payload viewer. The viewer shows expiry and never includes the
secret URL.

## 13. First Release Scope

The observation release includes:

- generic connector, parser release, channel, route, delivery and event models;
- migration and shared API contracts;
- provider-neutral authenticated endpoint;
- encrypted inbox and seven-day cleanup;
- BullMQ ingestion processor and recovery;
- Umbler v1 parser using the supplied payload as a fixture;
- channel discovery and CTWA classification;
- exact Meta route observation;
- workspace management UI;
- platform raw-payload inspection;
- cross-tenant, idempotency, encryption, parser and no-side-effect tests.

It excludes:

- lead creation;
- `wpptrack_tracking_events` or other conversation-ledger writes;
- CAPI queueing or delivery;
- replaying observation events into production;
- organic conversation metrics;
- Data Crazy, R100 WPP, 360dialog or other provider parsers;
- changes to Barbieri;
- changes to existing Uazapi, Meta, Asaas or external MySQL webhooks.

## 14. Validation and Rollout

Release order:

1. add configuration and migration with the feature hidden;
2. deploy API and verify migration/startup;
3. deploy web and expose Umbler observation to platform operators;
4. create one test connection in the target workspace;
5. register the generated URL in Umbler;
6. send controlled CTWA and non-CTWA messages through several channels;
7. compare encrypted raw payloads with normalized observations;
8. add any real payload variants as fixtures;
9. verify duplicate retries and route ambiguity;
10. approve a separate production-side-effect implementation.

Required checks include Prisma validation, shared/API/web typechecks, focused
tests, affected production builds, `git diff --check` and confirmation that
Barbieri remains online with unchanged routing.

## 15. Success Criteria

The observation release is successful when:

- a manager creates a Umbler connection and obtains a working protected URL;
- Umbler receives 202 responses within its limit;
- retries do not duplicate observed events;
- all connected Umbler numbers are discovered from one webhook;
- CTWA events are separated from organic messages;
- ad IDs resolve only to explicitly allowed channel/BM routes;
- ambiguous events remain unresolved without side effects;
- raw payloads are encrypted, audited and removed after seven days;
- no lead, conversation ledger row or CAPI job is created;
- no existing workspace integration changes behavior.
