# WppTrack Umbler Conversion Pipeline Hardening Implementation Plan

## 1. Goal

Implement the approved design in
`docs/plans/2026-07-23-wpptrack-umbler-conversion-pipeline-hardening-design.md`
without interrupting active Umbler or Meta delivery.

This plan replaces conflicting unchecked work in
`2026-07-21-wpptrack-umbler-conversion-events-implementation.md` for the scoped
Umbler conversion pipeline.

## 2. Delivery Rules

- Work in small, independently testable waves.
- Do not activate a new production path globally.
- Do not reinterpret or resend existing materialized events.
- Keep raw webhook payload retention unchanged.
- Use one canonical decision engine for live, replay and review approval.
- Stop after each production checkpoint and verify counts, logs and health.
- Keep unrelated working-tree changes untouched.

## 3. Current Working-Tree Baseline

The implementation starts with a tested but uncommitted safety patch covering:

- blank catalog templates classified as ignored;
- empty legacy purchase reviews hidden from operational review;
- parser, observation, review-service and UI reason-code tests;
- an idempotent migration for existing empty-template reviews.

Files currently involved:

- `apps/api/src/conversion-rules/structured-catalog-message.parser.ts`
- `apps/api/src/inbound-webhook-production/purchase-reviews.service.ts`
- `apps/api/test/provider-conversion-observation-service.test.ts`
- `apps/api/test/purchase-reviews-service.test.ts`
- `apps/api/test/structured-catalog-message-parser.test.ts`
- `apps/web/src/app/(app)/integrations/provider-conversion-rule-panel.tsx`
- `packages/shared/src/schemas/conversion-rules.ts`
- `apps/api/prisma/migrations/20260723170000_ignore_empty_purchase_templates/`
- `apps/api/test/empty-purchase-template-migration.test.ts`

This patch becomes Wave 0 only after its behavior is reconciled with the
canonical decision contract. It must not be discarded or silently mixed with
later waves.

## 4. Wave 0 - Freeze the Safety Baseline

### Objective

Capture the current urgent guard as an explicit baseline before architectural
changes.

### Tasks

- [x] Review the existing diff against the approved empty-template invariant.
- [x] Add the unknown paid-lead ignore invariant to the same behavior matrix.
- [x] Confirm ignored rows never create `PurchaseReview` or
      `ConversionEventLog`.
- [x] Confirm existing sent events are untouched by the migration.
- [x] Run focused tests, full API tests and API/web/shared builds.
- [x] Commit the safety baseline separately from the architecture waves.

### Verification

```powershell
pnpm --filter @wpptrack/api test -- structured-catalog-message-parser provider-conversion-observation-service purchase-reviews-service empty-purchase-template-migration
pnpm --filter @wpptrack/api test
pnpm --filter @wpptrack/shared build
pnpm --filter @wpptrack/api build
pnpm --filter @wpptrack/web build
```

### Checkpoint

No deployment is required until Wave 0 is reviewed as a coherent safety patch.

## 5. Wave 1 - Canonical Decision Contract

### Objective

Create a pure, exhaustive business decision contract before changing
orchestration.

### New or focused files

- `packages/shared/src/schemas/provider-conversion-decisions.ts`
- `apps/api/src/conversion-rules/provider-conversion-decision.types.ts`
- `apps/api/src/conversion-rules/provider-conversion-decision.engine.ts`
- `apps/api/src/conversion-rules/provider-conversion-paid-lead-resolver.service.ts`
- `apps/api/test/provider-conversion-decision-engine.test.ts`
- `apps/api/test/provider-conversion-paid-lead-resolver.test.ts`

### Tasks

- [x] Define the discriminated decision union.
- [x] Define separate technical-delivery states.
- [x] Extract catalog, average-value and automation evaluators behind the
      engine.
- [x] Return typed ignored, review, eligible and duplicate results.
- [x] Resolve paid leads before creating operational effects.
- [x] Preserve current phone normalization and paid attribution requirements.
- [x] Add exhaustive compile-time handling for every decision code.

### Fixture matrix

- [x] Team-authored empty template.
- [x] Bot-authored empty template.
- [x] Contact-authored empty template.
- [x] Known paid lead with partial catalog attributes.
- [x] Unknown lead with partial and complete catalog data.
- [x] Known lead with valid single and multi-item catalog data.
- [x] Known lead with aliases and quantities.
- [x] Qualified-lead automation callback.
- [x] Average-value purchase callback and message.

### Exit criterion

The engine is pure and fully tested; no existing runtime path uses it yet.

### Wave 1 checkpoint

- The shared contract separates canonical business decisions from technical
  delivery states.
- The frozen paid-lead attribution includes campaign, ad set, ad and CTWA.
- Qualified leads carry a lifetime dedupe policy.
- Purchases carry an explicit rolling 24-hour dedupe policy, preserving later
  repurchases.
- The paid-lead resolver reuses the existing phone normalization and requires
  both ad and CTWA attribution.
- The engine covers catalog, average-value message and provider-automation
  rules without database, queue or Meta dependencies.
- The representative `3,5 / Nacional` typo remains reviewable; exact catalog
  combinations use catalog prices instead of payment text.
- Focused result: 34 tests passed.
- Type validation and builds passed for shared and API.
- The current live, replay and production paths are still unchanged.

## 6. Wave 2 - Versioned Decision Persistence

### Objective

Persist a frozen decision before any review or Meta side effect.

### Prisma work

- [x] Add an append-only provider-conversion decision audit model.
- [x] Link decisions to workspace, delivery, rule and channel.
- [x] Store normalized occurrence, rule snapshot, catalog snapshot, value,
      items, lead resolution and deterministic keys.
- [x] Add decision-engine and parser versions.
- [x] Add optional decision links to `ProviderConversionRuleExecution` and
      `PurchaseReview`.
- [x] Add indexes for trace, workspace/date and decision filters.
- [x] Add an idempotent migration and migration contract test.

### Service work

- `apps/api/src/conversion-rules/provider-conversion-decision.repository.ts`
- `apps/api/src/conversion-rules/provider-conversion-trace.service.ts`
- `apps/api/test/provider-conversion-decision-repository.test.ts`

### Invariants

- [x] Ignored decisions create audit only.
- [x] Review decisions create at most one review.
- [x] Eligible decisions create at most one technical execution.
- [x] A reevaluation appends a version; it never overwrites history.

### Exit criterion

A decision can be stored and queried without changing production side effects.

### Wave 2 checkpoint

- Canonical decisions are frozen in an append-only audit table before later
  waves connect the engine to operational side effects.
- Repeating the same initial evaluation returns the existing frozen decision.
- A new version requires an explicit reevaluation request and must supersede
  the latest version; implicit and stale reevaluations are rejected.
- An advisory transaction lock serializes concurrent decisions for the same
  workspace, rule and occurrence.
- Optional one-to-one links constrain one review and one technical execution
  per persisted decision.
- The trace service returns ordered decision versions while keeping source
  delivery, review and technical execution states separate.
- The migration is idempotent, does not rewrite existing conversions and
  enforces append-only storage at the database layer.
- Focused result: 47 tests passed.
- Full API result: 146 test files and 1,105 tests passed.
- Prisma validation, API typecheck, API build and `git diff --check` passed.
- The current live, replay and production paths are still unchanged.

## 7. Wave 3 - One Observation and Orchestration Path

### Objective

Replace ad hoc observation branching with the canonical engine and
orchestrator.

### Focused files

- `apps/api/src/conversion-rules/provider-conversion-observation.service.ts`
- `apps/api/src/conversion-rules/provider-conversion-orchestrator.service.ts`
- `apps/api/src/conversion-rules/conversion-catalog.service.ts`
- `apps/api/src/conversion-rules/structured-catalog-message.parser.ts`
- `apps/api/test/provider-conversion-observation-service.test.ts`
- `apps/api/test/provider-conversion-orchestrator.test.ts`

### Tasks

- [x] Normalize once and evaluate once.
- [x] Persist the decision before any execution or review.
- [x] Route ignored decisions to internal audit only.
- [x] Route actionable partial data to one review.
- [x] Route eligible observation decisions without Meta side effects.
- [x] Route eligible production decisions to one technical execution.
- [x] Emit structured logs with delivery, decision and occurrence IDs.

### Exit criterion

New deliveries use the canonical engine while production materialization still
uses the existing service.

### Wave 3 checkpoint

- The observation service normalizes and evaluates each occurrence once.
- The append-only decision is persisted before review or execution effects.
- Ignored and duplicate decisions remain internal audit only.
- Actionable partial catalog data creates one review linked to its decision.
- Eligible observation decisions create no technical execution.
- Eligible production decisions create or recover one execution linked to the
  frozen decision.
- Reprocessing an observed retained delivery reuses its initial frozen
  decision instead of silently reevaluating current configuration.
- Structured logs carry workspace, source delivery, decision version and
  occurrence identifiers.
- Focused result: 52 tests passed.
- API typecheck and build passed.

## 8. Wave 4 - Frozen Production, Retry and Reevaluation

### Objective

Make production consume the frozen decision instead of reparsing mutable
configuration.

### Focused files

- `apps/api/src/inbound-webhook-production/provider-conversion-production.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-production-queue.service.ts`
- `apps/api/src/inbound-webhooks/backoffice-inbound-webhooks.service.ts`
- `apps/api/src/inbound-webhooks/inbound-conversion-automation-ingestion.service.ts`
- `apps/api/test/provider-conversion-production-service.test.ts`
- `apps/api/test/provider-conversion-retry-reevaluation.test.ts`

### Tasks

- [x] Materialize only an eligible frozen decision.
- [x] Remove catalog/message reinterpretation from technical retry.
- [x] Keep Meta routing validation at materialization time.
- [x] Implement retry for retryable technical states only.
- [x] Implement explicit reevaluation that creates a new decision version.
- [x] Route replay through the same orchestrator.
- [x] Retain advisory locks and business dedupe.
- [x] Prove concurrent workers create at most one event.

### Exit criterion

Automatic, replay, manual approval and retry converge on the same occurrence
and dedupe behavior.

### Wave 4 checkpoint

- Canonical production consumes the persisted eligible decision and does not
  decrypt or reinterpret the original message during technical retry.
- Meta route availability remains a live technical check at materialization
  time; the business decision and catalog value stay frozen.
- Permanent failures become unrecoverable BullMQ jobs, while unexpected
  infrastructure failures retain the same decision and use the configured
  retry policy.
- Observation replay returns to the canonical orchestrator and reuses the
  initial decision unless an explicit reevaluation key is supplied.
- Review approval appends a corrected decision version and creates its linked
  execution without mutating the previous audit row.
- Advisory transaction locks and event-specific business dedupe protect
  QualifiedLead lifetime uniqueness and the Purchase 24-hour window.
- Focused canonical result: 8 test files and 70 tests passed.
- API typecheck and production build passed.

## 9. Wave 5 - Review Semantics and Legacy Cleanup

### Objective

Keep purchase review strictly actionable.

### Focused files

- `apps/api/src/inbound-webhook-production/purchase-reviews.service.ts`
- `apps/api/src/inbound-webhook-production/purchase-reviews.controller.ts`
- `apps/api/test/purchase-reviews-service.test.ts`
- `apps/api/test/purchase-reviews-controller.test.ts`
- `apps/web/src/app/(app)/events/purchase-reviews/purchase-review-panel.tsx`
- `apps/web/tests/purchase-review-panel.test.ts`

### Tasks

- [x] Exclude empty templates and untracked leads from operational review.
- [x] Show only actionable partial, ambiguous or invalid catalog data.
- [x] Make approval create a corrected decision version.
- [x] Make rejection terminal with a reason.
- [x] Separate pending review from history.
- [x] Migrate existing empty and unknown-lead reviews idempotently.
- [x] Preserve raw delivery and internal decision audit.

### Exit criterion

Every visible review can be corrected or rejected by the user.

### Wave 5 checkpoint

- The actionable queue now contains only canonical `review_required` rows.
- Technical delivery failures no longer masquerade as purchases requiring a
  customer decision; they remain available in history and Meta delivery audit.
- Legacy meaningful reviews for known paid leads are normalized to
  `review_required`.
- Legacy unsent reviews without a paid lead are closed with the internal
  `ignored_untracked_lead` reason.
- Empty templates and untracked leads remain hidden from customer operations,
  while raw delivery and append-only decision evidence are preserved.
- Approval appends an eligible corrected decision; rejection is terminal and
  stores the operator reason.
- Focused result: 6 API test files and 23 tests passed.
- Purchase-review frontend contract result: 3 tests passed.
- The dedicated `ignored_empty_template` enum migration is idempotent and has
  a contract test proving that it does not mutate deliveries or encrypted raw
  payloads.
- Integrated validation result: API 150 files / 1137 tests, Web 41 files / 252
  tests and Shared 4 files / 89 tests passed.
- Prisma validation, monorepo typecheck, Shared/API/Web production builds and
  `git diff --check` passed.

## 10. Wave 6 - Unified Trace API and Backoffice

### Objective

Expose one evidence-backed trace across all layers.

### Backend

- [x] Add a trace read model joining delivery, decision, review, execution,
      conversion log, queue state and Meta response.
- [x] Add filters for workspace, connection, channel, rule, event, decision,
      state and minute-level date-time range.
- [x] Derive summary counters from the same filtered query as the table.
- [x] Add permission and pagination tests.

### Frontend

- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/page.tsx`
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/actions.ts`
- new focused trace and filter components under the same route
- `apps/web/tests/inbound-webhook-panel.test.ts`

### Tasks

- [x] Label ignored decisions as internal outcomes, not customer errors.
- [x] Show retry only for retryable technical failures.
- [x] Show reevaluate only where business reevaluation is possible.
- [x] Link raw payload and Meta audit from the same trace.
- [x] Remove unexplained counter differences between pages.

### Exit criterion

An operator can explain any occurrence without switching among unrelated
tables or guessing what a status means.

### Wave 6 checkpoint

- Backoffice now exposes a single occurrence-level trace joining retained
  delivery, latest immutable decision, review or technical execution and the
  final Meta audit.
- Workspace, connection, channel, rule, event, decision, operational state and
  minute-level period filters drive both the table and its summary counters.
- Technical retry and business reevaluation are separate actions. Reevaluation
  targets one exact rule and occurrence, appends a decision version and is
  idempotent by an operator request key.
- Raw payload and Meta request/response evidence are reachable from the same
  trace without exposing those controls to workspace users.
- Focused verification passed for shared contracts, API authorization and
  idempotency, message and automation reevaluation paths, and the Backoffice
  route actions.

## 11. Wave 7 - Customer-Facing UI Consolidation

### Objective

Align configuration and operation with the approved ownership boundaries.

### Settings

- [x] Keep rule, trigger, author, channel, average-value, catalog and alias
      editing in Settings.
- [x] Add the side-effect-free message decision tester.
- [x] Show extracted attributes, items, value and decision reason.

### Integrations

- [x] Keep connection, channel discovery and observation/production mode.
- [x] Remove duplicate rule-editing surfaces.

### Events

- [x] Keep actionable purchase review separate from Meta delivery history.
- [x] Provide trace links for every materialized review and event; keep
      pending reviews explicit while no Meta event exists.
- [x] Use human-facing labels mapped from the canonical codes.

### Component refactor

- [ ] Split `provider-conversion-rule-panel.tsx` into rule list, editor,
      catalog editor, test console and audit summary components.
- [ ] Preserve stable dimensions and responsive behavior.
- [x] Add focused React contract tests before visual changes.

### Wave 7 checkpoint

- Settings remains the single customer-facing owner for trigger, channel,
  author, average-value, catalog and alias editing. Integrations keeps only
  connection discovery, channel readiness and observation/production controls.
- The catalog simulator remains side-effect free and now renders its canonical
  decision, human reason, matched trigger, extracted attributes, line items,
  quantities, catalog total and observed payment value.
- The simulator form and result were extracted from the legacy panel as the
  first low-risk component boundary. Focused Settings, Integrations and panel
  contracts pass together (38 tests), followed by the Web typecheck.
- Purchase review now shows a canonical human diagnosis and distinguishes a
  pending purchase with no Meta event from a materialized purchase. The latter
  links to the same audit detail used in Meta Events, while platform-only raw
  provider trace remains in Backoffice.
- Human status and reason labels are centralized and reused by Settings and
  Events. The focused purchase-review, Events-route and Settings-panel
  contracts pass together (24 tests), followed by the Web typecheck.

### Exit criterion

The customer sees only configuration and actions relevant to their role;
platform-only diagnostics remain in Backoffice.

## 12. Wave 8 - Shadow Comparison and Canary

### Flags

- [x] Add a workspace/channel-scoped canonical-engine flag.
- [x] Add shadow comparison without side effects.
- [x] Record old/new decision mismatches with reason and trace ID.
- [x] Keep the existing global safety gates as final kill switches.

### Local implementation status (2026-07-24)

- [x] Migration defaults every existing and new channel to `legacy`.
- [x] Channel modes `legacy`, `shadow` and `canonical` are implemented.
- [x] Shadow mode persists append-only semantic comparisons while legacy remains authoritative.
- [x] Shadow comparison failure cannot block the authoritative legacy decision.
- [x] Platform-owner controls require the exact channel name and current comparison counters.
- [x] Direct `legacy` to `canonical` activation is blocked.
- [x] Canonical rollback to `legacy` is available and audited.
- [x] Shadow tests prove one authoritative decision and one execution path.
- [x] Full API suite passed: 155 files and 1,171 tests.
- [x] Full web suite passed: 43 files and 261 tests.
- [x] Full shared suite passed: 4 files and 92 tests, including 17 rollout contracts.
- [x] Shared, API and web builds and monorepo typecheck passed.
- [x] Prisma schema validation and `git diff --check` passed.
- [x] Production schema and code deployment verified through Prisma status,
      API health and a stable API task.
- [x] BrinkPark was promoted from shadow to the canonical engine as the first
      production canary.
- [ ] Canary production evidence remains under active monitoring.

### Deferred UI debt

- [x] Replace the gray native dropdown presentation in the inbound Backoffice
      workspace and the customer purchase-review filters with the existing dark
      design-system controls.
- [x] Make the purchase-review command bar respond to its available content
      width, preserving a compact layout with the sidebar expanded, collapsed
      and on mobile without horizontal overflow.
- [x] Keep the visual patch isolated from decision, replay, materialization and
      Meta-delivery behavior while the BrinkPark canonical canary remains under
      active monitoring.
- [x] Add focused layout contracts and verify the affected controls with
      responsive browser renders, web typecheck and a production web build.

### Rollout

1. [x] Deploy schema and code with the new engine disabled.
2. [x] Verify Prisma status and API health.
3. [x] Enable shadow mode for one Umbler channel.
4. [ ] Review a representative sample of empty, partial and complete messages.
   - [x] Empty template: canonical `ignored_empty_template`; no operational
         review or conversion.
   - [x] Complete catalog purchase: legacy and canonical both `eligible` with
         `catalog_matched`.
   - [ ] Partial or unknown catalog combination: canonical must require review
         for a resolved paid lead and must not create an automatic conversion.
   - The operator explicitly accepted validating the remaining partial case
     during the protected BrinkPark production canary.
5. [ ] Enable observation for that channel.
6. [ ] Reevaluate controlled retained payloads.
7. [x] Enable automatic production for the BrinkPark canary channel.
8. [ ] Verify Meta events, dedupe, reviews and counters.
9. [ ] Expand to remaining channels in the first workspace.
10. [ ] Expand to the second Umbler workspace.

### Rollback

- [ ] Disable the workspace/channel canonical-engine flag.
- [ ] Leave raw payloads and decision audits intact.
- [ ] Do not roll back already materialized conversion events.
- [ ] Reconcile queued work before re-enabling either engine.

## 13. Required Test Gates

Every wave must pass its focused tests. Before any production deployment:

```powershell
pnpm --filter @wpptrack/shared test
pnpm --filter @wpptrack/api test
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/shared build
pnpm --filter @wpptrack/api build
pnpm --filter @wpptrack/web build
pnpm typecheck
```

Also validate:

```powershell
pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
git diff --check
```

## 14. Production Evidence Checklist

- [x] API task is running without rollback or restart loop.
- [x] Prisma reports all migrations applied.
- [x] `/health` returns HTTP 200 with the production web origin allowed.
- [x] Shadow mismatch count is understood before canary activation.
- [x] Empty templates create no operational review.
- [ ] Unknown paid leads create no operational review.
- [ ] Partial known-lead purchases appear once in review.
- [ ] Complete known-lead purchases create one event.
- [ ] Qualified lead is deduplicated for life.
- [ ] Repurchase inside 24 hours is deduplicated.
- [ ] Repurchase after 24 hours is accepted.
- [ ] Retry preserves the frozen decision.
- [ ] Reevaluation creates a visible new version.
- [ ] Automatic and replay counters reconcile with trace records.

## 15. Completion Definition

The work is complete only after both Umbler workspaces have passed canary,
automatic processing and audit verification, and the old evaluator can be
disabled without losing observation, replay or production capabilities.
