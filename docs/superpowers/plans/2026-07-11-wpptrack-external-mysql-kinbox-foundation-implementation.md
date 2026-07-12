# WppTrack External MySQL/Kinbox Data Foundation - Implementation Plan

Date: 2026-07-11

Status: Deployed and configured for Barbieri; lead backfill and the three append-only event paths are active. A read-only PostgreSQL reconciliation gate now measures real versus historical events, matching, duplicates, failures and CAPI readiness. The connector remains in shadow mode and the legacy n8n Meta sends remain active until the production gate is reviewed and explicitly approved.

Design source: `docs/superpowers/specs/2026-07-11-wpptrack-external-mysql-kinbox-data-foundation-design.md`

## Goal

Implement Block 0.5 so WppTrack can securely backfill standardized external MySQL leads, incrementally ingest append-only Kinbox/official WhatsApp events, reconcile them in shadow mode and later own Meta CAPI delivery without querying MySQL during page rendering.

## Implementation Result

- Prisma models and migration created for connectors, cursors, ingestion records and conversion value provenance.
- Credentials use AES-256-GCM and never enter response DTOs or audit summaries.
- MySQL adapter reads only `vw_wpptrack_leads` and `vw_wpptrack_events` with bounded, parameterized cursor queries.
- Kinbox daily Purchase deduplication is isolated in the provider policy. Other providers accept multiple same-day purchases when a stable event or transaction ID exists.
- Incremental BullMQ worker, deterministic active-job protection, automatic scheduling, JobAttempt and IntegrationLog observability are implemented.
- Platform-admin endpoints for create, update, test, sync and health are implemented.
- Connector listings aggregate imported, duplicate, rejected and pending records in one database query; the backoffice follows a manual sync until completion without reloading the page or moving its scroll position.
- Platform backoffice exposes a read-only CAPI cutover gate for `conversation_started`, `qualified_lead` and `purchase`, including real/historical counts, matching, duplicate/failure totals, Meta destination readiness and actionable blockers. Removed ingestion records cannot block the gate, and no cutover action or external side effect is exposed yet.
- The first Barbieri production observation found six intentional `ExternalLeadNotMatched` quarantines from the legacy orphan cleanup. The gate now reports those as non-blocking discarded events, counts only accepted rows as real samples, compares unique expected conversion IDs to persisted conversions and reserves the blocked state for technical rejections, pending rows, missing links or missing Meta configuration.
- Standard MySQL ledger/views and an exact n8n dual-write/cutover guide are available under `docs/setup/external-mysql/`.
- The reviewed Kinbox QualifiedLead export now has a reproducible sanitizer and an inactive import artifact that writes the canonical append-only event before existing side effects while preserving the current Meta delivery for shadow reconciliation.
- The reviewed Kinbox Purchase export now has a sanitized replacement with daily provider-specific deduplication, a value-free ledger record and a daily stable event ID for the temporary Meta delivery.
- Reporting contracts expose estimated revenue provenance through `valueSource`, `estimatedRevenueCents` and `hasEstimatedRevenue`.
- Latest verification after the CAPI cutover gate: 468 API tests, 105 web tests and 55 shared-contract tests passed (628 total), plus lint/typechecks, web production build, isolated Nest build, Prisma validation and `git diff --check`. The aggregate API prebuild only encountered the known local Prisma DLL lock while a development process held the generated client.

The migration, customer views, read-only account, network allowlist and connector are live for Barbieri. The append-only event workflows are active and their first operational records have been ingested. Block 0.5 now advances through the objective reconciliation gate without disabling the current n8n Meta delivery.

## Guardrails

- External MySQL is read-only from WppTrack.
- Secrets are encrypted and never returned by API DTOs or logs.
- Meta OAuth/Graph API remains the recurring Meta Ads source.
- Kinbox one-purchase-per-local-day is adapter-specific, not global.
- Shadow mode never enqueues Meta CAPI.
- Cursor advances only after successful PostgreSQL persistence.
- Existing Uazapi behavior and current report formulas remain compatible.

## Task 1 - Dependency, Models and Migration

### Files

- Modify `apps/api/package.json` and `pnpm-lock.yaml`.
- Modify `apps/api/prisma/schema.prisma`.
- Create `apps/api/prisma/migrations/20260711170000_external_data_connectors/migration.sql`.
- Modify `.env.example`.

### Changes

1. Add `mysql2` as API runtime dependency.
2. Add `external_mysql` to `DiagnosticSource`.
3. Add `ExternalDataConnector` with workspace, provider, status, timezone, encrypted credentials, SSL mode, shadow/send flags and sync timestamps.
4. Add `ExternalSyncCursor` unique by connector + stream.
5. Add connector/source metadata and `valueSource` to `ConversionEventLog`.
6. Add Workspace relations and indexes for connector state and sync due reads.
7. Add `EXTERNAL_CONNECTOR_ENCRYPTION_KEY` and auto-sync settings to `.env.example`.

### Tests and checks

- `pnpm --filter @wpptrack/api prisma:generate`
- `pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma`

## Task 2 - Shared Contracts

### Files

- Create `packages/shared/src/schemas/external-data-connectors.ts`.
- Modify `packages/shared/src/index.ts`.
- Modify `packages/shared/src/schemas/diagnostics.ts`.
- Modify `packages/shared/tests/contracts.test.ts`.

### Contracts

- Connector create/update input with password accepted only on writes.
- Sanitized connector DTO with no encrypted fields/password.
- Connection test result.
- Manual sync input/result.
- Sync health and cursor DTO.
- Canonical event types and value-source enums.

### Tests

- Reject invalid ports, timezones, providers and SSL modes.
- Ensure response schemas cannot contain credential fields.
- Ensure `external_mysql` is a valid diagnostic source.

## Task 3 - Credential Encryption and MySQL Adapter

### Files

- Create `apps/api/src/external-data/external-credential-encryption.service.ts`.
- Create `apps/api/src/external-data/external-mysql.adapter.ts`.
- Create focused tests in `apps/api/test/`.

### Behavior

- AES-256-GCM encryption using a connector-specific environment key.
- `testConnection`, `readLeadsPage` and `readEventsPage` methods.
- Fixed view names only: `vw_wpptrack_leads`, `vw_wpptrack_events` and optional legacy view.
- Parameterized cursor values, bounded batches, connect/query timeouts and TLS modes.
- No connection object or secret survives the operation.
- Safe error codes without raw connection strings.

## Task 4 - Provider Policies and Canonical Ingestion

### Files

- Create `apps/api/src/external-data/external-event-policy.ts`.
- Create `apps/api/src/external-data/external-event-ingestion.service.ts`.
- Modify `apps/api/src/conversion-events/conversion-events.service.ts`.
- Modify reporting/diagnostic DTO projections for `valueSource`.
- Add unit tests.

### Behavior

1. Normalize phone and resolve/upsert lead.
2. Build provider-specific dedupe key.
3. Kinbox QualifiedLead: once per connector + lead identity.
4. Kinbox Purchase without transaction ID: once per connector + lead identity + workspace-local date.
5. Other providers: prefer external event ID or transaction ID and allow multiple same-day purchases.
6. Recover CTWA/ad attribution from the stored lead when Kinbox omits it.
7. Resolve configured average value, snapshot it with `valueSource=configured_average` and label estimates in report outputs.
8. Preserve business events even when CAPI is blocked.
9. Queue ready CAPI events only when connector send mode is enabled and shadow mode is disabled.

### Required tests

- Same Kinbox Purchase twice on one local day creates one conversion.
- Kinbox Purchase on another local day creates repurchase.
- Two same-day purchases with different transaction IDs in another provider create two conversions.
- Retry uses the same event ID.
- Missing lead context is pending/reconcilable.
- Shadow mode creates data but does not enqueue CAPI.

## Task 5 - Incremental Sync Queue

### Files

- Extend `apps/api/src/common/queue/queue.constants.ts`.
- Create `apps/api/src/external-data/external-sync-queue.service.ts`.
- Create `apps/api/src/external-data/external-sync.processor.ts`.
- Create `apps/api/src/external-data/external-auto-sync.service.ts`.
- Create `apps/api/src/external-data/external-sync.service.ts`.
- Create `apps/api/src/external-data/external-data.module.ts`.
- Modify `apps/api/src/app.module.ts`.

### Behavior

- Queue per connector with deterministic active-job protection.
- Initial lead backfill and incremental event streams use separate cursors.
- Configurable interval, initial delay, connector batch limit and row batch size.
- Cursor update occurs in the same PostgreSQL transaction as accepted ingestion bookkeeping where possible.
- Failed rows are audited; retryable connector failures fail the job for BullMQ backoff.
- JobAttempt and IntegrationLog record safe counts and durations.

## Task 6 - Backoffice API and Shadow Operations

### Files

- Create `apps/api/src/external-data/backoffice-external-data.controller.ts`.
- Create `apps/api/src/external-data/external-data.service.ts`.
- Add controller/service tests.

### Endpoints

- `GET /backoffice/external-data/connectors`
- `POST /backoffice/external-data/connectors`
- `PATCH /backoffice/external-data/connectors/:id`
- `POST /backoffice/external-data/connectors/:id/test`
- `POST /backoffice/external-data/connectors/:id/sync`
- `GET /backoffice/external-data/connectors/:id/health`

All routes require platform-admin authentication. Create/update audit logs; DTOs never expose credentials.

## Task 7 - Standard MySQL and n8n Artifacts

### Files

- Create `docs/setup/external-mysql/kinbox-standard-schema.sql`.
- Create `docs/setup/external-mysql/README.md`.
- Create sanitized n8n workflow artifacts or exact patch guides for Purchase, QualifiedLead and official Meta conversation intake.
- QualifiedLead artifact completed and activated from `docs/setup/external-mysql/n8n/kinbox-qualified-lead-dual-write.json`; its real records are measured by the cutover gate.
- Purchase artifact completed and activated from `docs/setup/external-mysql/n8n/kinbox-purchase-dual-write.json`; its real records are measured by the cutover gate.
- The Uazapi/Wesley `Etapa 4 - Recebimento de Mensagens` export remains rejected as the Barbieri source.
- Official Meta conversation artifact completed and activated at `docs/setup/external-mysql/n8n/meta-conversation-started-dual-write.json` from the correct `Etapa 2 - [Meta] Recebimento de Mensagem` export. After the first HMAC-based replacement rejected a real delivery with `401`, the old workflow was restored. By explicit operator decision on 2026-07-12, the replacement now has no POST HMAC, App Secret, raw-binary dependency or `401` branch. It stores the normal JSON payload in `wpptrack_webhook_inbox` before ACK 200, then normalizes and writes the append-only event before legacy effects. The safe test accepts a captured real payload without credentials and stops before ledger, lead and CAPI writes. Real conversation records are now measured by the cutover gate; the WppTrack CAPI cutover remains pending explicit approval.

### SQL

- Create `tracking_events` with unique dedupe key and cursor indexes.
- Create fixed safe views without token columns.
- Include placeholders for the standardized client suffix.
- Include least-privilege GRANT examples without real users/passwords.

### n8n

- Persist event before any external side effect.
- Hardcode canonical type by workflow, not incoming `event_name`.
- Remove pinned production data and inline secrets.
- Use connector webhook secret/credential.
- Preserve the current flow only until shadow reconciliation is approved.

## Task 8 - Verification and Handoff

### Automated verification

- Focused shared/API tests for all new modules.
- Existing conversion, reporting and diagnostics tests.
- `pnpm --filter @wpptrack/shared typecheck`
- `pnpm --filter @wpptrack/api typecheck`
- `pnpm --filter @wpptrack/api build`
- `pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma`
- `git diff --check`

### Manual/deployment checkpoints

1. Apply PostgreSQL migration through normal Dokploy deploy.
2. Add connector encryption/auto-sync environment variables.
3. Apply standard SQL to the customer MySQL with a privileged operator account.
4. Create a dedicated read-only user for the WppTrack views.
5. Configure the connector through backoffice.
6. Run connection test, backfill and shadow incremental sync.
7. Reconcile daily counts before enabling WppTrack CAPI.
8. Disable old n8n Meta-send nodes only after approval.
9. Rotate the Uazapi token found inline in the exported workflow.

## Exit Criteria

- Connector can be configured and tested without exposing secrets.
- Backfill and incremental sync are idempotent and resumable.
- Real conversations, qualified leads and purchases reach PostgreSQL.
- Kinbox daily policy is isolated to Kinbox tests/code.
- Estimated values are labeled and persisted correctly.
- Shadow mode proves parity without duplicate Meta sends.
- Project plan and `Projeto.md` reflect the deployed state and remaining human actions.
