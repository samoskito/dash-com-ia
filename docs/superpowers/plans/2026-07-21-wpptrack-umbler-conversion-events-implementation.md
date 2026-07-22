# Umbler Qualified Lead and Purchase Events - Implementation Plan

Design:
`docs/plans/2026-07-21-wpptrack-umbler-conversion-events-design.md`

## Delivery Rules

- Preserve the current Umbler `LeadSubmitted` production path.
- Keep both new environment gates disabled until observation is validated.
- Make every query and mutation workspace-scoped in the API.
- Use the existing encrypted inbox, conversion registry, CAPI queue and audit
  trail instead of creating a parallel delivery system.
- Deploy schema and API before exposing rule controls in the web app.

## Wave 1 - Contracts, Gates and Schema

- [ ] Add provider conversion trigger and mode schemas in
  `packages/shared/src/schemas/conversion-rules.ts`.
- [ ] Add DTOs for automation endpoints, rule executions, catalogs, variants,
  channel scopes and test-message results.
- [ ] Extend `ConversionTriggerType` without changing legacy keyword/label
  behavior.
- [ ] Add Prisma models for provider rule configuration, channel scopes,
  signed endpoints, rule executions, catalogs, attributes and variants.
- [ ] Link conversion automation deliveries to the existing inbound webhook
  inbox without changing old delivery rows.
- [ ] Add indexes for workspace listing, endpoint lookup, execution idempotency,
  contact/event dedupe and catalog combination uniqueness.
- [ ] Add `INBOUND_CONVERSION_RULES_ENABLED` and
  `INBOUND_CONVERSION_PRODUCTION_ENABLED` to deployment configuration with
  fail-closed defaults.
- [ ] Add migration tests proving existing conversion rules and Umbler records
  retain their behavior.

Primary files:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/<timestamp>_umbler_conversion_events/migration.sql`
- `apps/api/src/config/deployment-config.ts`
- `packages/shared/src/schemas/conversion-rules.ts`
- `packages/shared/src/schemas/inbound-webhooks.ts`
- `apps/api/test/deployment-config.test.ts`
- `apps/api/test/inbound-conversion-migration.test.ts`

## Wave 2 - Rule Management and Signed URLs

- [ ] Extend `ConversionRulesService` with provider rule CRUD while keeping
  the legacy evaluator restricted to `keyword` and `whatsapp_label`.
- [ ] Validate connection and channel ownership on every rule mutation.
- [ ] Generate at least 256 bits of endpoint entropy and store only its hash.
- [ ] Return the plaintext URL once after creation or rotation.
- [ ] Add audited pause, observation, production, rotation and removal actions.
- [ ] Add a public rule endpoint that derives workspace, provider and event
  exclusively from the signed endpoint record.
- [ ] Reject unsupported content types and oversized bodies before persistence.
- [ ] Preserve automation callbacks in the encrypted inbound inbox and return a
  fast 202 after durable acceptance.

Primary files:

- `apps/api/src/conversion-rules/conversion-rules.controller.ts`
- `apps/api/src/conversion-rules/conversion-rules.service.ts`
- `apps/api/src/conversion-rules/conversion-rules.module.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-public.controller.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-ingestion.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-payload-encryption.service.ts`
- `apps/api/test/conversion-rules-controller.test.ts`
- `apps/api/test/conversion-rules-service.test.ts`
- `apps/api/test/inbound-conversion-public-controller.test.ts`

## Wave 3 - Automation Observation and Parser Certification

- [ ] Add a versioned Umbler automation identity extractor and parser.
- [ ] Accept the real callback envelope without trusting event, value or
  workspace fields from the payload.
- [ ] Normalize contact, chat/conversation, channel and occurrence time.
- [ ] Use stable provider IDs for permanent ingress dedupe when available.
- [ ] Use endpoint, body hash and a bounded retry window only as fallback.
- [ ] Persist one redacted rule execution per normalized callback.
- [ ] Add explicit outcomes for missing contact, missing channel, unsupported
  payload, duplicate delivery and parser failure.
- [ ] Extend backoffice payload filters to distinguish message intake from
  conversion automation callbacks.
- [ ] Capture both real tag payloads, add fixtures and require platform-owner
  parser certification before production mode.

Primary files:

- `apps/api/src/inbound-webhooks/providers/umbler/umbler-automation-v1.types.ts`
- `apps/api/src/inbound-webhooks/providers/umbler/umbler-automation-v1.parser.ts`
- `apps/api/src/inbound-webhooks/providers/inbound-webhook-parser.registry.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook.processor.ts`
- `apps/api/src/inbound-webhooks/backoffice-inbound-webhooks.service.ts`
- `apps/api/test/umbler-automation-v1-parser.test.ts`
- `apps/api/test/inbound-conversion-observation.test.ts`
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/page.tsx`

Checkpoint: do not implement production materialization until at least one real
callback from each automation use case is stored and its parser fixture passes.

## Wave 4 - Paid Lead Attribution and Business Dedupe

- [ ] Resolve automation contact identity to an existing lead by workspace and
  stable contact/phone identity.
- [ ] Require paid attribution and reject missing or organic leads.
- [ ] Re-resolve the current Meta connection and destination from trusted lead
  attribution; ignore public Meta hints.
- [ ] Build a lifetime `QualifiedLead` business key shared across rules and
  provider retries.
- [ ] Implement rolling 24-hour `Purchase` dedupe using occurrence time.
- [ ] Serialize purchase decisions with a workspace/customer database advisory
  lock so concurrent callbacks cannot both pass.
- [ ] Accept a purchase exactly 24 hours or more after the previous accepted
  purchase.
- [ ] Preserve existing first-purchase and repurchase classification.
- [ ] Record duplicate and blocked outcomes without publishing CAPI jobs.

Primary files:

- `apps/api/src/conversion-rules/provider-conversion-attribution.service.ts`
- `apps/api/src/conversion-rules/provider-conversion-dedupe.service.ts`
- `apps/api/src/integrations/meta/meta-connection-resolver.service.ts`
- `apps/api/src/conversion-events/conversion-events.service.ts`
- `apps/api/test/provider-conversion-attribution.test.ts`
- `apps/api/test/provider-conversion-dedupe.test.ts`
- `apps/api/test/conversion-events-service.test.ts`

## Wave 5 - Automation Materialization

- [ ] Translate eligible automation executions into the existing conversion
  event input.
- [ ] Materialize `QualifiedLead` without value.
- [ ] Materialize automation `Purchase` with the rule's configured average
  value, currency and content name.
- [ ] Persist execution and conversion-log linkage before queue publication.
- [ ] Reconcile an accepted execution whose queue publication failed.
- [ ] Never release observation history merely because a rule is activated.
- [ ] Add controlled execution replay with preview, canary and explicit
  platform-owner authorization.
- [ ] Prove that replay and live handling converge on the same dedupe keys.

Primary files:

- `apps/api/src/conversion-rules/provider-conversion-materializer.service.ts`
- `apps/api/src/conversion-rules/provider-conversion-queue.service.ts`
- `apps/api/src/conversion-rules/provider-conversion.processor.ts`
- `apps/api/src/conversion-events/conversion-events.service.ts`
- `apps/api/src/inbound-webhook-replay/inbound-webhook-replay.service.ts`
- `apps/api/test/provider-conversion-materializer.test.ts`
- `apps/api/test/provider-conversion-processor.test.ts`
- `apps/api/test/provider-conversion-replay.test.ts`

## Wave 6 - Catalog Domain and Exact Matcher

- [ ] Implement catalogs with one or two ordered attributes and currency.
- [ ] Validate unique normalized variant combinations and positive cent values.
- [ ] Support explicit aliases without fuzzy or AI matching.
- [ ] Parse structured lines by configured attribute labels.
- [ ] Normalize case, surrounding whitespace and decimal separators.
- [ ] Require exactly one variant and one parseable message amount.
- [ ] Compare the message amount with the catalog's authoritative cents.
- [ ] Return machine-readable failures for missing fields, unknown combination,
  ambiguity, missing price and price mismatch.
- [ ] Produce deterministic content and item metadata for a matched variant.
- [ ] Add a side-effect-free test-message API.

Primary files:

- `apps/api/src/conversion-rules/conversion-catalog.service.ts`
- `apps/api/src/conversion-rules/structured-catalog-message.parser.ts`
- `apps/api/src/conversion-rules/conversion-rules.controller.ts`
- `apps/api/test/conversion-catalog-service.test.ts`
- `apps/api/test/structured-catalog-message-parser.test.ts`

Required fixtures:

- all six approved `Tamanho` and `Modelo` combinations;
- a case and whitespace variation;
- unknown size and model;
- ambiguous aliases;
- missing price;
- price differing from the catalog;
- a message containing several products, which must be rejected.

## Wave 7 - Umbler Outbound Message Evaluation

- [ ] Extend the internal Umbler event shape with message direction, author type
  and content while keeping content out of redacted summaries.
- [ ] Preserve current inbound CTWA classification and `LeadSubmitted`
  behavior byte-for-byte where possible.
- [ ] Evaluate catalog rules only for non-private outbound messages.
- [ ] Accept messages sent by an organization member or bot.
- [ ] Ignore contact messages and unsupported message types.
- [ ] Scope evaluation to configured connection and channels.
- [ ] Resolve the contact back to its original paid lead and trusted Meta route.
- [ ] Apply the shared 24-hour purchase dedupe and materializer.
- [ ] Support observation and controlled replay of retained message payloads.

Primary files:

- `apps/api/src/inbound-webhooks/providers/inbound-webhook-parser.ts`
- `apps/api/src/inbound-webhooks/providers/umbler/umbler-v1.types.ts`
- `apps/api/src/inbound-webhooks/providers/umbler/umbler-v1.parser.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-observation.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-production-intake.service.ts`
- `apps/api/test/umbler-v1-parser.test.ts`
- `apps/api/test/inbound-catalog-rule-evaluation.test.ts`
- `apps/api/test/inbound-webhook-production-service.test.ts`

## Wave 8 - Workspace UI

- [ ] Add an `Eventos de conversao` section inside each Umbler connection.
- [ ] List event, trigger, channels, mode, last execution and status reason.
- [ ] Add an automation-rule flow for `QualifiedLead` and average-value
  `Purchase`.
- [ ] Display the signed URL once with copy and rotate actions.
- [ ] Add a compact catalog editor with one/two attributes and variant rows.
- [ ] Add a test-message panel that shows the matched variant or block reason.
- [ ] Add observation, activate and pause controls with confirmation.
- [ ] Keep analyst access read-only and enforce all authorization again in the
  API.
- [ ] Add responsive layout and text-fit tests for desktop and mobile widths.

Primary files:

- `apps/web/src/app/(app)/integrations/inbound-webhook-panel.tsx`
- `apps/web/src/app/(app)/integrations/inbound-webhook-actions.ts`
- `apps/web/src/app/(app)/integrations/page.tsx`
- `apps/web/src/components/conversion-rule-builder.tsx`
- `apps/web/src/styles/globals.css`
- `apps/web/tests/inbound-webhook-panel.test.ts`
- `apps/web/tests/inbound-webhook-actions.test.ts`
- `apps/web/tests/integrations-route.test.ts`

## Wave 9 - Backoffice and Operations

- [ ] Add rule, event, trigger, execution state and reason filters.
- [ ] Show observation counts, eligible executions, duplicates, blocks,
  materializations and Meta delivery status.
- [ ] Keep raw payload access platform-only and audited.
- [ ] Add parser certification and controlled replay readiness checks.
- [ ] Add canary sizes `1`, `5` and `10` before full execution replay.
- [ ] Prevent overlapping replay batches for the same rule/channel.
- [ ] Expose exact business-dedupe reasons instead of generic failures.

Primary files:

- `apps/api/src/inbound-webhooks/backoffice-inbound-webhooks.controller.ts`
- `apps/api/src/inbound-webhooks/backoffice-inbound-webhooks.service.ts`
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/page.tsx`
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/replay/[connectionId]/page.tsx`
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/replay/actions.ts`
- `apps/api/test/backoffice-inbound-webhooks-controller.test.ts`
- `apps/web/tests/inbound-webhook-replay-route.test.ts`

## Wave 10 - Regression, Security and Rollout

- [ ] Test cross-workspace reads, writes, URL use and channel/catalog
  references.
- [ ] Test token rotation, constant-time validation and one-time secret display.
- [ ] Test provider retries, worker retries and concurrent business events.
- [ ] Test lifetime qualified-lead dedupe and 24-hour purchase boundaries.
- [ ] Test catalog matches for human and bot messages.
- [ ] Test that inbound customer messages never create catalog purchases.
- [ ] Test unresolved lead, organic lead, stale route and ambiguous destination
  failures.
- [ ] Run all API and web tests, typechecks, Prisma validation, builds and
  `git diff --check`.
- [ ] Deploy with both new gates false and verify current Umbler live traffic.
- [ ] Enable observation only, capture and certify real automation payloads.
- [ ] Run one canary per rule type before production activation.
- [ ] Verify Meta acceptance, first-purchase/repurchase reporting and no changes
  to Barbieri or existing lead routes.

Validation commands:

```powershell
pnpm --filter @wpptrack/shared test
pnpm --filter @wpptrack/api test
pnpm --filter @wpptrack/web test
pnpm typecheck
pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
pnpm build
git diff --check
```

## Production Checkpoints

1. Schema/API deploy succeeds with both flags false.
2. Existing Umbler connections continue sending `LeadSubmitted`.
3. Observation receives one real qualified-lead automation callback.
4. Observation receives one real average-purchase automation callback.
5. The catalog matcher passes the six approved variants and blocks a wrong
   price.
6. Platform owner certifies the automation parser.
7. One canary event per rule reaches Meta successfully.
8. Only then are individual rules switched to production.

## Deferred Work

- Generic free-text keyword triggers for Umbler.
- Dynamic value extraction from arbitrary customer message templates.
- AI or fuzzy semantic conversation interpretation.
- Providers other than Umbler using this conversion-rule adapter.
