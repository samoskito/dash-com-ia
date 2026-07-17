# WppTrack Umbler Webhook Observation Implementation Plan

Date: 2026-07-17
Status: Ready for execution
Design: docs/plans/2026-07-17-wpptrack-umbler-inbound-webhook-design.md

## 1. Goal

Implement the approved provider-aware inbound webhook foundation and expose one
Umbler Talk connection in strict observation mode.

The first live checkpoint is a generated URL registered in a test Umbler
workspace. WppTrack must accept, encrypt, classify and display real deliveries
without creating leads, conversation ledger records, conversion logs or CAPI
jobs.

## 2. Global Gates

### 2.1 Observation-only gate

- There is no API transition from `observation` to `production` in this plan.
- The Umbler parser release remains `observation_only`.
- The processor must not inject `LeadsService`, `ConversionEventsService` or
  `ConversionEventsQueueService`.
- Tests assert that lead, tracking-event, conversion-log and CAPI queue methods
  are never called.
- Observation deliveries are not replayed automatically after parser
  certification.

### 2.2 Tenant gate

- Public webhook requests never accept a workspace ID.
- Workspace context is derived only from the persisted connection.
- Every management query is scoped by the authenticated active workspace.
- Route references are reloaded and checked against the same workspace.
- Unauthorized and nonexistent management resources return the same generic
  response.
- Queue jobs contain workspace and resource IDs, and the processor revalidates
  their relationship before processing.

### 2.3 Secret and privacy gate

- Plaintext webhook secrets are returned only on create/rotate.
- Secrets are stored only as SHA-256 hashes.
- Raw payloads use AES-256-GCM with a dedicated key.
- Queue jobs, logs, diagnostics and normalized summaries contain no raw message,
  full contact phone, CTWA value, media URL or plaintext secret.
- Full payload access is platform-owner-only and audited.
- Encrypted payload columns are cleared after seven days.

### 2.4 Delivery gate

- A valid delivery is durably persisted before returning 202.
- Database failure returns non-2xx so Umbler can retry.
- Connection + `EventId` deduplicates provider retries.
- Connection + canonical message dedupe key protects the business event.
- Duplicate deliveries return 202 without duplicate queue work.
- Queue publication failure leaves a recoverable pending delivery.

### 2.5 Existing-production no-touch gate

- Do not change the existing Meta, Uazapi, Asaas or external MySQL endpoints.
- Do not change Barbieri credentials, routing, reporting or CAPI behavior.
- Do not alter existing lead or conversion classification.
- The feature is disabled by default until the deployment checkpoint.

## 3. Wave 0 - Feature Configuration and Safety Baseline

Purpose: add explicit configuration and regression guards before adding data or
runtime behavior.

### Tests first

Add failing cases to:

- `apps/api/test/deployment-config.test.ts`
- `apps/api/test/load-env.test.ts`

Cover:

- inbound webhooks disabled by default;
- enabled mode requires a valid 32-byte encryption key;
- malformed or short keys fail startup without printing the value;
- `API_PUBLIC_URL` is required and HTTPS in production when the feature is
  enabled;
- test/development may use HTTP localhost;
- existing email, Google and Meta configuration results remain unchanged.

Run:

```bash
pnpm --filter @wpptrack/api test -- test/deployment-config.test.ts test/load-env.test.ts
```

Expected before implementation: new assertions fail.

### Implementation

Update:

- `.env.example`
- `apps/api/src/config/deployment-config.ts`

Add:

```text
INBOUND_WEBHOOKS_ENABLED=false
INBOUND_WEBHOOK_ENCRYPTION_KEY=
```

Expose a parsed configuration object with:

- `enabled`;
- validated key material only when enabled;
- fixed raw retention of seven days;
- validated `API_PUBLIC_URL`.

Never serialize the key in a DTO or startup message.

### Regression guard

Add a focused architecture test that imports the inbound observation module and
asserts it has no dependency on lead or conversion execution services.

Suggested file:

- `apps/api/test/inbound-webhook-observation-boundary.test.ts`

### Acceptance

- The application starts unchanged with the feature disabled.
- Enabling without a valid key fails fast.
- Existing configuration tests still pass.

### Commit

```text
feat(config): gate inbound webhook observation
```

## 4. Wave 1 - Prisma Models, Migration and Shared Contracts

Purpose: create the tenant-scoped observation model before exposing endpoints.

### Tests first

Create:

- `apps/api/test/inbound-webhook-migration.test.ts`
- `packages/shared/src/schemas/inbound-webhooks.test.ts`

Migration assertions:

- all connection-owned tables carry `workspaceId`;
- connection + deterministic ingress key is unique;
- connection + canonical event dedupe key is unique;
- channel identity is unique by connection, organization and provider channel;
- route foreign keys cannot cascade-delete Meta history;
- encrypted payload columns and `payloadExpiresAt` exist;
- connection removal uses a tombstone timestamp instead of deleting delivery
  history;
- parser release `umbler/v1` is inserted as `observation_only`.

Contract assertions:

- only `umbler` is currently accepted as a provider;
- connection creation accepts a safe display name;
- update contracts cannot request `production`;
- route input supports several BMs for one channel and several channels for one
  BM;
- secret-bearing create/rotate responses are separate from ordinary list DTOs;
- full CTWA and message content are absent from normalized observation DTOs.

### Schema

Update:

- `apps/api/prisma/schema.prisma`
- `packages/shared/src/schemas/inbound-webhooks.ts`
- `packages/shared/src/index.ts`

Add enums:

- `InboundWebhookProvider`
- `InboundWebhookParserReleaseStatus`
- `InboundWebhookConnectionStatus`
- `InboundWebhookChannelStatus`
- `InboundWebhookDeliveryStatus`
- `InboundWebhookEventClassification`

Add models:

- `InboundWebhookParserRelease`
- `InboundWebhookConnection`
- `InboundWebhookChannel`
- `InboundWebhookChannelRoute`
- `InboundWebhookDelivery`
- `InboundWebhookEvent`

Add relations to:

- `Workspace`
- `User`
- `MetaBusinessConnection`
- `MetaReportingAccount`
- `MetaConversionDestination`

Add `removedAt` to the connection as a non-destructive tombstone. Management
lists exclude removed connections by default, while audit and delivery history
remain intact.

Extend `DiagnosticSource` and the shared diagnostic source schema with
`umbler`.

### Migration

Create:

- `apps/api/prisma/migrations/<timestamp>_inbound_webhook_observation/migration.sql`

The migration must be additive. It must not update existing workspace,
integration, lead, event or Meta rows.

### Verification

```bash
pnpm --filter @wpptrack/api prisma:generate
pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
pnpm --filter @wpptrack/shared test -- src/schemas/inbound-webhooks.test.ts
pnpm --filter @wpptrack/api test -- test/inbound-webhook-migration.test.ts
pnpm --filter @wpptrack/shared typecheck
```

### Acceptance

- Existing data is untouched.
- The schema supports multiple connections, channels and many-to-many routes.
- No plaintext payload or secret column exists.

### Commit

```text
feat(db): add inbound webhook observation model
```

## 5. Wave 2 - Encryption and Connection Management

Purpose: let an integration manager create a protected Umbler connection and
receive a URL without exposing the secret again.

### Tests first

Create:

- `apps/api/test/inbound-webhook-payload-encryption.test.ts`
- `apps/api/test/inbound-webhook-connections-service.test.ts`
- `apps/api/test/inbound-webhook-connections-controller.test.ts`

Cover:

- AES-256-GCM round trip;
- random IV for identical payloads;
- tampering and wrong-key rejection;
- no key/ciphertext in thrown messages;
- create generates at least 256 bits of secret entropy;
- only the hash is persisted;
- URL uses `API_PUBLIC_URL`, opaque connection ID and query token;
- list/get never return the secret;
- rotate replaces the hash and returns one new URL;
- pause revokes public acceptance without deleting observations;
- remove sets `removedAt` and invalidates the secret;
- owner/admin pass `canManageIntegrations`;
- analyst is read-only;
- cross-workspace connection IDs return the same result as missing IDs;
- no create action is available while the feature is disabled.

### Implementation

Create:

- `apps/api/src/inbound-webhooks/inbound-webhook-payload-encryption.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-connections.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-connections.controller.ts`
- `apps/api/src/inbound-webhooks/inbound-webhooks.module.ts`

Import the module from:

- `apps/api/src/app.module.ts`

Management endpoints:

```text
GET    /integrations/inbound-webhooks
POST   /integrations/inbound-webhooks
GET    /integrations/inbound-webhooks/:connectionId
POST   /integrations/inbound-webhooks/:connectionId/rotate-secret
PUT    /integrations/inbound-webhooks/:connectionId/status
DELETE /integrations/inbound-webhooks/:connectionId
```

In this release, status input accepts only `observation` and `paused`.
`production` returns a conflict explaining that parser certification and the
production wave are still pending.

Audit:

- connection created;
- secret rotated;
- connection paused/resumed;
- connection removed.

Audit summaries contain IDs and statuses, never the URL or secret.

### Verification

```bash
pnpm --filter @wpptrack/api test -- \
  test/inbound-webhook-payload-encryption.test.ts \
  test/inbound-webhook-connections-service.test.ts \
  test/inbound-webhook-connections-controller.test.ts
pnpm --filter @wpptrack/api typecheck
```

### Acceptance

- A manager can generate a Umbler URL.
- Reloading the page cannot reveal the secret.
- Rotation invalidates the old URL.
- Production cannot be selected.

### Commit

```text
feat(api): manage protected inbound webhook connections
```

## 6. Wave 3 - Durable Public Ingress and Queue

Purpose: accept a real Umbler delivery quickly and durably without parsing it in
the request path.

### Tests first

Create:

- `apps/api/test/inbound-webhook-ingestion-service.test.ts`
- `apps/api/test/inbound-webhook-public-controller.test.ts`
- `apps/api/test/inbound-webhook-queue-service.test.ts`
- extend `apps/api/test/queue-contract.test.ts`

Cover:

- missing, removed, paused and wrong-token connections return one generic
  unauthorized/not-found response;
- valid token uses constant-time comparison;
- non-JSON and oversized requests are rejected before persistence;
- raw request bytes are encrypted before database write;
- a valid Umbler envelope uses `EventId` as its ingress key;
- a malformed envelope uses a raw-body SHA-256 ingress key and remains
  observable;
- valid new delivery persists once and returns 202;
- duplicate `EventId` increments attempt metadata and returns 202;
- duplicate delivery does not enqueue twice;
- `x-attempt` is parsed conservatively;
- no workspace header or body value can override connection tenancy;
- queue payload contains only delivery, connection and workspace IDs;
- persistence failure returns non-2xx;
- queue failure leaves the delivery pending for recovery;
- no diagnostics summary contains raw PII.

### Queue contract

Update:

- `apps/api/src/common/queue/queue.constants.ts`

Add:

- `INBOUND_WEBHOOK_QUEUE`
- `InboundWebhookJobPayload`

The payload contains:

```ts
{
  deliveryId: string;
  connectionId: string;
  workspaceId: string;
}
```

### Implementation

Create:

- `apps/api/src/inbound-webhooks/inbound-webhook-public.controller.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-ingestion.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-queue.service.ts`
- `apps/api/src/inbound-webhooks/providers/inbound-webhook-delivery-identity.ts`
- `apps/api/src/inbound-webhooks/providers/umbler/umbler-v1-delivery-identity.ts`

Register the queue in:

- `apps/api/src/inbound-webhooks/inbound-webhooks.module.ts`

Public route:

```text
POST /webhooks/inbound/:connectionId?token=...
```

Use `@RawBody()` so the encrypted inbox preserves the accepted JSON bytes. A
bounded identity extractor may read only the provider envelope needed for
`EventId` and event type. Full Umbler parsing remains asynchronous. The
controller must not call diagnostics, leads, Meta or conversion services.

Use deterministic BullMQ job IDs derived from the delivery ID. Do not put
payload contents in BullMQ.

### Verification

```bash
pnpm --filter @wpptrack/api test -- \
  test/inbound-webhook-ingestion-service.test.ts \
  test/inbound-webhook-public-controller.test.ts \
  test/inbound-webhook-queue-service.test.ts \
  test/queue-contract.test.ts
pnpm --filter @wpptrack/api typecheck
```

### Acceptance

- A valid request is acknowledged after durable storage.
- Umbler retries cannot duplicate queue work.
- The request path has no provider business logic.

### Commit

```text
feat(webhooks): add durable inbound webhook ingress
```

## 7. Wave 4 - Provider Registry and Umbler v1 Parser

Purpose: validate the exact Umbler contract and produce canonical observation
events.

### Fixture

Create a sanitized fixture from the supplied historical payload:

- `apps/api/test/fixtures/umbler/message-with-ctwa.json`

Replace all real names, phones, IDs, text, URLs and CTWA values with synthetic
data. Preserve only the payload shape.

Add fixtures or programmatic variants for:

- inbound CTWA message;
- inbound message without CTWA;
- outbound/member message;
- private note;
- unsupported event type;
- malformed event;
- repeated delivery with the same message;
- valid channel with changed display name/phone.

### Tests first

Create:

- `apps/api/test/umbler-v1-parser.test.ts`
- `apps/api/test/inbound-webhook-parser-registry.test.ts`

Cover canonical mapping and classifications:

- `eligible_route_unresolved`;
- `ignored_no_ctwa`;
- `ignored_outbound`;
- `ignored_private`;
- `unsupported_event`;
- `invalid_payload`.

Assert:

- root `EventId` is the delivery identity;
- `LastMessage.Id` is the message identity;
- organization/channel/message form the deterministic event dedupe key;
- `LastMessage.EventAtUTC` wins over `EventDate`;
- `Ad.SourceId` maps to ad ID;
- the CTWA value is available only inside the processor result and is not
  included in the persisted redacted summary;
- parser errors never include raw values.

### Implementation

Create:

- `apps/api/src/inbound-webhooks/providers/inbound-webhook-parser.ts`
- `apps/api/src/inbound-webhooks/providers/inbound-webhook-parser.registry.ts`
- `apps/api/src/inbound-webhooks/providers/umbler/umbler-v1.parser.ts`
- `apps/api/src/inbound-webhooks/providers/umbler/umbler-v1.types.ts`

The registry resolves provider + parser version from the connection. There is
no fallback parser. Unknown or retired versions fail the delivery safely.

### Verification

```bash
pnpm --filter @wpptrack/api test -- \
  test/umbler-v1-parser.test.ts \
  test/inbound-webhook-parser-registry.test.ts
pnpm --filter @wpptrack/api typecheck
```

### Acceptance

- The supplied payload maps deterministically.
- Organic, outbound and private events cannot become paid candidates.
- Adding a future provider requires a new parser, not changes to Umbler logic.

### Commit

```text
feat(umbler): normalize webhook payloads for observation
```

## 8. Wave 5 - Observation Processor and Channel Discovery

Purpose: process queued deliveries, discover connected numbers and persist
redacted classifications.

### Tests first

Create:

- `apps/api/test/inbound-webhook-observation-processor.test.ts`
- `apps/api/test/inbound-webhook-channel-discovery.test.ts`

Cover:

- processor reloads delivery, connection and workspace together;
- processor refuses cross-tenant job payloads;
- payload is decrypted only inside processing;
- one Umbler connection discovers several channels;
- stable channel ID updates mutable name/phone without creating duplicates;
- same channel ID in another connection remains isolated;
- one delivery can emit zero or more canonical events;
- canonical dedupe suppresses the same message in a different delivery;
- status and classification counters are updated;
- a redacted `WebhookLog`/diagnostic entry uses source `umbler`;
- no message text, full phone, CTWA or media URL reaches diagnostics;
- parser failure marks the delivery and remains inspectable;
- no lead, conversion event or CAPI queue call occurs.

### Implementation

Create:

- `apps/api/src/inbound-webhooks/inbound-webhook-observation.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook.processor.ts`

Register the processor in:

- `apps/api/src/inbound-webhooks/inbound-webhooks.module.ts`

Use `DiagnosticsService` only for a redacted operational summary. The encrypted
inbox remains the source for full platform-owner inspection.

Suggested summary fields:

- provider;
- connection ID;
- event type;
- parser version;
- channel ID;
- connected phone suffix only;
- ad ID;
- has CTWA boolean;
- classification;
- route status.

### Verification

```bash
pnpm --filter @wpptrack/api test -- \
  test/inbound-webhook-observation-processor.test.ts \
  test/inbound-webhook-channel-discovery.test.ts \
  test/inbound-webhook-observation-boundary.test.ts
pnpm --filter @wpptrack/api typecheck
```

### Acceptance

- Several Umbler numbers appear under one connection.
- CTWA and non-CTWA messages have different classifications.
- Observation has zero production side effects.

### Commit

```text
feat(umbler): observe deliveries and discover channels
```

## 9. Wave 6 - Many-to-Many Meta Route Preview

Purpose: configure and evaluate channel/BM/destination routes without decrypting
Meta credentials or sending CAPI.

### Tests first

Create:

- `apps/api/test/inbound-webhook-channel-routes-service.test.ts`
- extend `apps/api/test/meta-connection-resolver-service.test.ts`
- extend `apps/api/test/inbound-webhook-observation-processor.test.ts`

Cover:

- one channel maps to several BMs;
- several channels map to one BM;
- route may restrict an exact reporting account;
- route may override the conversion destination;
- no override uses account override, then BM default;
- every reference must belong to the current workspace;
- paused/missing Meta connections are invalid;
- unknown ad ID is unresolved;
- unsynchronized ad account is unresolved;
- ad ID resolves to the exact Meta ad account and BM;
- channel not authorized for the resolved BM is unresolved;
- conflicting routes are unresolved;
- no BM fallback occurs;
- preview does not return or decrypt an access token.

### Meta resolver

Update:

- `apps/api/src/integrations/meta/meta-connection-resolver.service.ts`

Add a metadata-only route preview method that reuses attributed ad/account
resolution but returns only:

- reporting account ID;
- ad account ID;
- business connection ID;
- conversion destination ID;
- pixel ID;
- page ID;
- resolution status/reason.

Do not call the existing token-bearing delivery method and discard its token.

### Route service and API

Create:

- `apps/api/src/inbound-webhooks/inbound-webhook-channel-routes.service.ts`

Add management endpoints:

```text
GET    /integrations/inbound-webhooks/:connectionId/channels
PUT    /integrations/inbound-webhooks/channels/:channelId/routes
DELETE /integrations/inbound-webhooks/channels/:channelId/routes/:routeId
PUT    /integrations/inbound-webhooks/channels/:channelId/status
```

Saving routes is transactional. Reprocess route resolution for unresolved
observations without executing production effects.

### Verification

```bash
pnpm --filter @wpptrack/api test -- \
  test/inbound-webhook-channel-routes-service.test.ts \
  test/meta-connection-resolver-service.test.ts \
  test/inbound-webhook-observation-processor.test.ts
pnpm --filter @wpptrack/api typecheck
```

### Acceptance

- Channel/BM routing is genuinely many-to-many.
- Exact ad attribution chooses one allowed BM/destination.
- Ambiguity remains visible and blocked.

### Commit

```text
feat(umbler): preview exact Meta routes by channel
```

## 10. Wave 7 - Workspace Integrations UI

Purpose: expose connection creation, observation health and route management in
the existing Integrations page.

### Tests first

Create:

- `apps/web/tests/inbound-webhook-actions.test.ts`
- `apps/web/tests/inbound-webhook-panel.test.ts`
- extend `apps/web/tests/integrations-route.test.ts`

Cover:

- provider selector shows Umbler and is extensible;
- create response shows the URL once with a copy action;
- ordinary reload shows only masked connection metadata;
- observation/paused status is clear;
- no production activation control exists;
- counters distinguish eligible routed, unresolved, no CTWA, duplicate and
  invalid;
- channels show connected number, name and last seen;
- route editor supports several route rows per channel;
- exact BM/account/destination options come only from current-workspace API
  data;
- analyst controls are read-only;
- owner/admin controls are enabled;
- presentation privacy mode masks connection name, number, BM, account, Pixel
  and Page;
- error text never includes raw payload or secret.

### Implementation

Create:

- `apps/web/src/app/(app)/integrations/inbound-webhook-actions.ts`
- `apps/web/src/app/(app)/integrations/inbound-webhook-panel.tsx`
- `apps/web/src/app/(app)/integrations/inbound-webhook-route-editor.tsx`

Update:

- `apps/web/src/app/(app)/integrations/page.tsx`
- existing integration page styles or the nearest shared stylesheet

UI structure:

- section label `Fontes de mensagens`;
- compact connection list;
- `Adicionar conexao` command;
- provider menu;
- name input;
- one-time URL result;
- connection health and counters;
- channel table;
- route editor per channel;
- pause, rotate and remove actions with confirmation.

Do not add cards inside cards. Use the current operational panel/table language
and existing button/icon conventions.

### Verification

```bash
pnpm --filter @wpptrack/web test -- \
  tests/inbound-webhook-actions.test.ts \
  tests/inbound-webhook-panel.test.ts \
  tests/integrations-route.test.ts
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Run local browser checks at desktop and mobile widths:

- URL copy and one-time visibility;
- empty connection state;
- several connections;
- one connection with seven channels;
- one channel with several BM routes;
- long names and masked privacy mode;
- no overflow or overlapping controls.

### Acceptance

- A workspace manager can configure the test without terminal access.
- The UI clearly says that observation does not create leads or conversions.
- Sensitive integration data respects presentation privacy mode.

### Commit

```text
feat(web): add Umbler webhook observation panel
```

## 11. Wave 8 - Platform Payload Inspection and Parser Status

Purpose: let the platform owner compare real encrypted deliveries with parser
output safely.

### Tests first

Create:

- `apps/api/test/backoffice-inbound-webhooks-controller.test.ts`
- `apps/api/test/inbound-webhook-payload-access.test.ts`
- `apps/web/tests/inbound-webhook-payload-route.test.ts`

Cover:

- only platform owners can list all workspace deliveries;
- only platform owners can decrypt a non-expired payload;
- workspace managers cannot retrieve raw payload through any route;
- expired/cleared payload returns metadata with `payloadAvailable=false`;
- every successful and failed raw-access attempt is audited;
- audit entry contains actor, workspace, delivery and source IP;
- response does not contain webhook secret or URL;
- parser release status is visible;
- certification action is not exposed in this observation release.

### Implementation

Create:

- `apps/api/src/inbound-webhooks/backoffice-inbound-webhooks.controller.ts`
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/page.tsx`
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/[deliveryId]/payload/page.tsx`

Reuse:

- `PlatformAdminService`
- `AuditLog`
- existing backoffice payload presentation patterns

The raw viewer displays:

- encrypted payload availability/expiry;
- provider, parser version and classification;
- formatted JSON only after authorized server-side decryption;
- normalized comparison beside the raw payload.

### Verification

```bash
pnpm --filter @wpptrack/api test -- \
  test/backoffice-inbound-webhooks-controller.test.ts \
  test/inbound-webhook-payload-access.test.ts
pnpm --filter @wpptrack/web test -- \
  tests/inbound-webhook-payload-route.test.ts
pnpm --filter @wpptrack/api typecheck
pnpm --filter @wpptrack/web typecheck
```

### Acceptance

- The platform owner can inspect the real Umbler shape.
- Raw access is unavailable to customer roles and leaves an audit trail.

### Commit

```text
feat(backoffice): inspect encrypted inbound webhook payloads
```

## 12. Wave 9 - Retention, Recovery and Diagnostics

Purpose: enforce seven-day data minimization and recover accepted deliveries
whose queue publication or processing was interrupted.

### Tests first

Create:

- `apps/api/test/inbound-webhook-maintenance-service.test.ts`
- extend `apps/api/test/inbound-webhook-ingestion-service.test.ts`

Cover:

- expired raw payload columns are cleared, not merely hidden;
- normalized metadata and audit history remain;
- non-expired payloads are untouched;
- pending unprocessed deliveries are re-enqueued once;
- already queued/processed deliveries are not duplicated;
- removed/paused connections do not process new work;
- maintenance is safe with multiple API replicas;
- errors are redacted and surfaced in diagnostics.

### Implementation

Create:

- `apps/api/src/inbound-webhooks/inbound-webhook-maintenance.service.ts`

Follow the existing auto-sync lifecycle pattern, but use database claims or
idempotent queue job IDs so multiple replicas cannot create duplicate work.

Maintenance responsibilities:

- clear expired encrypted payload fields;
- recover pending deliveries older than a short grace period;
- mark unrecoverable parser versions for operator review;
- report redacted counts, never payload values.

### Verification

```bash
pnpm --filter @wpptrack/api test -- \
  test/inbound-webhook-maintenance-service.test.ts \
  test/inbound-webhook-ingestion-service.test.ts \
  test/inbound-webhook-observation-processor.test.ts
pnpm --filter @wpptrack/api typecheck
```

### Acceptance

- Seven-day deletion is enforced by data mutation.
- Accepted deliveries survive transient queue failures.

### Commit

```text
feat(webhooks): retain and recover inbound observations safely
```

## 13. Wave 10 - Full Verification and Release Package

Purpose: prove the observation feature is deployable without changing existing
production behavior.

### Automated verification

Run focused suites first, then:

```bash
pnpm --filter @wpptrack/shared test
pnpm --filter @wpptrack/api test
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/shared typecheck
pnpm --filter @wpptrack/api typecheck
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/shared build
pnpm --filter @wpptrack/api build
pnpm --filter @wpptrack/web build
pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
git diff --check
```

### Static no-side-effect proof

Verify:

- inbound observation module does not import lead/conversion execution;
- no new code calls CAPI or conversion queues;
- no existing webhook route changed;
- migration contains no updates/deletes against current tables;
- connection status API rejects production.

### Local visual verification

Use Playwright against the local application:

- desktop viewport;
- mobile viewport;
- empty state;
- seven discovered channels;
- many-to-many routes;
- loading, success and error states;
- presentation privacy mode;
- raw backoffice payload page.

### Operational documentation

Add:

- `docs/setup/inbound-webhooks/umbler-observation.md`

Document:

- generating `INBOUND_WEBHOOK_ENCRYPTION_KEY`;
- setting the feature flag;
- migration/API/web deployment order;
- creating and rotating a connection;
- registering the URL in Umbler;
- controlled CTWA and non-CTWA tests;
- inspecting classifications;
- checking expiry and audit;
- rollback by pausing connections and disabling the feature;
- explicit warning that observation does not create leads or CAPI.

### Acceptance

- All checks pass.
- The test URL is ready to be configured after deployment.
- Existing Barbieri Meta reporting and CAPI regression tests pass unchanged.

### Commit

```text
docs: add Umbler observation rollout guide
```

## 14. Deployment Checkpoint

Deploy in this order:

1. Generate a new 32-byte random key. Do not reuse Meta, SMTP or external MySQL
   keys.
2. Save `INBOUND_WEBHOOK_ENCRYPTION_KEY` in the API environment.
3. Keep `INBOUND_WEBHOOKS_ENABLED=false`.
4. Deploy migration and API.
5. Confirm API health, migration completion and existing integrations.
6. Deploy web.
7. Set `INBOUND_WEBHOOKS_ENABLED=true` and redeploy API.
8. Create one Umbler observation connection in the target workspace.
9. Copy the one-time URL into Umbler Settings > Webhooks.
10. Keep the connection in observation.

Do not configure or modify the Barbieri workspace for this test.

## 15. Live Observation Checklist

Record baseline counts before the first request:

- leads;
- tracking events;
- conversion logs;
- CAPI jobs;
- inbound deliveries/events.

Generate controlled events:

1. inbound CTWA message on channel A;
2. retry or duplicate of the same event;
3. organic inbound message on channel A;
4. inbound CTWA message on channel B;
5. outbound/member message;
6. private note if Umbler exposes one safely;
7. CTWA event with known synchronized ad;
8. CTWA event with unknown ad.

Expected:

- channels A and B are discovered;
- CTWA candidates are separated from organic messages;
- duplicate attempt count increases without a second canonical event;
- known ad resolves only through an allowed route;
- unknown ad remains unresolved;
- all lead/tracking/conversion/CAPI baseline counts remain unchanged;
- raw payload is visible only in platform backoffice;
- no secret appears in logs;
- Umbler reports successful delivery.

## 16. Stop Conditions

Stop before further rollout if:

- Umbler payload shape differs materially from the documented envelope;
- `EventId` is absent or unstable;
- `Channel.Id` cannot identify connected numbers consistently;
- the connected number is not present or trustworthy;
- `Ad.SourceId` does not map to the Meta ad identity used by WppTrack;
- raw payload appears in ordinary logs or customer APIs;
- any lead, conversation or CAPI side effect occurs;
- Barbieri or another existing integration changes behavior.

Payload differences are added as sanitized fixtures and parser v1 is adjusted
before any certification discussion.

## 17. Production Follow-Up, Explicitly Deferred

After live payload validation, create a separate approved plan for:

- platform-owner parser certification;
- workspace production activation;
- canonical `conversation_started` ledger writes;
- paid lead upsert;
- exact Meta destination/CAPI queueing;
- production retry and replay policy;
- removal of organic-conversation UI where still present;
- provider health monitoring and alerts.

No production-side-effect code belongs in this observation plan.
