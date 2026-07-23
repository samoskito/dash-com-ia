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

- [ ] Add an append-only provider-conversion decision audit model.
- [ ] Link decisions to workspace, delivery, rule and channel.
- [ ] Store normalized occurrence, rule snapshot, catalog snapshot, value,
      items, lead resolution and deterministic keys.
- [ ] Add decision-engine and parser versions.
- [ ] Add optional decision links to `ProviderConversionRuleExecution` and
      `PurchaseReview`.
- [ ] Add indexes for trace, workspace/date and decision filters.
- [ ] Add an idempotent migration and migration contract test.

### Service work

- `apps/api/src/conversion-rules/provider-conversion-decision.repository.ts`
- `apps/api/src/conversion-rules/provider-conversion-trace.service.ts`
- `apps/api/test/provider-conversion-decision-repository.test.ts`

### Invariants

- [ ] Ignored decisions create audit only.
- [ ] Review decisions create at most one review.
- [ ] Eligible decisions create at most one technical execution.
- [ ] A reevaluation appends a version; it never overwrites history.

### Exit criterion

A decision can be stored and queried without changing production side effects.

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

- [ ] Normalize once and evaluate once.
- [ ] Persist the decision before any execution or review.
- [ ] Route ignored decisions to internal audit only.
- [ ] Route actionable partial data to one review.
- [ ] Route eligible observation decisions without Meta side effects.
- [ ] Route eligible production decisions to one technical execution.
- [ ] Emit structured logs with delivery, decision and occurrence IDs.

### Exit criterion

New deliveries use the canonical engine while production materialization still
uses the existing service.

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

- [ ] Materialize only an eligible frozen decision.
- [ ] Remove catalog/message reinterpretation from technical retry.
- [ ] Keep Meta routing validation at materialization time.
- [ ] Implement retry for retryable technical states only.
- [ ] Implement explicit reevaluation that creates a new decision version.
- [ ] Route replay through the same orchestrator.
- [ ] Retain advisory locks and business dedupe.
- [ ] Prove concurrent workers create at most one event.

### Exit criterion

Automatic, replay, manual approval and retry converge on the same occurrence
and dedupe behavior.

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

- [ ] Exclude empty templates and untracked leads from operational review.
- [ ] Show only actionable partial, ambiguous or invalid catalog data.
- [ ] Make approval create a corrected decision version.
- [ ] Make rejection terminal with a reason.
- [ ] Separate pending review from history.
- [ ] Migrate existing empty and unknown-lead reviews idempotently.
- [ ] Preserve raw delivery and internal decision audit.

### Exit criterion

Every visible review can be corrected or rejected by the user.

## 10. Wave 6 - Unified Trace API and Backoffice

### Objective

Expose one evidence-backed trace across all layers.

### Backend

- [ ] Add a trace read model joining delivery, decision, review, execution,
      conversion log, queue state and Meta response.
- [ ] Add filters for workspace, connection, channel, rule, event, decision,
      state and minute-level date-time range.
- [ ] Derive summary counters from the same filtered query as the table.
- [ ] Add permission and pagination tests.

### Frontend

- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/page.tsx`
- `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/actions.ts`
- new focused trace and filter components under the same route
- `apps/web/tests/inbound-webhook-panel.test.ts`

### Tasks

- [ ] Label ignored decisions as internal outcomes, not customer errors.
- [ ] Show retry only for retryable technical failures.
- [ ] Show reevaluate only where business reevaluation is possible.
- [ ] Link raw payload and Meta audit from the same trace.
- [ ] Remove unexplained counter differences between pages.

### Exit criterion

An operator can explain any occurrence without switching among unrelated
tables or guessing what a status means.

## 11. Wave 7 - Customer-Facing UI Consolidation

### Objective

Align configuration and operation with the approved ownership boundaries.

### Settings

- [ ] Keep rule, trigger, author, channel, average-value, catalog and alias
      editing in Settings.
- [ ] Add the side-effect-free message decision tester.
- [ ] Show extracted attributes, items, value and decision reason.

### Integrations

- [ ] Keep connection, channel discovery and observation/production mode.
- [ ] Remove duplicate rule-editing surfaces.

### Events

- [ ] Keep actionable purchase review separate from Meta delivery history.
- [ ] Provide trace links for every review and event.
- [ ] Use human-facing labels mapped from the canonical codes.

### Component refactor

- [ ] Split `provider-conversion-rule-panel.tsx` into rule list, editor,
      catalog editor, test console and audit summary components.
- [ ] Preserve stable dimensions and responsive behavior.
- [ ] Add focused React contract tests before visual changes.

### Exit criterion

The customer sees only configuration and actions relevant to their role;
platform-only diagnostics remain in Backoffice.

## 12. Wave 8 - Shadow Comparison and Canary

### Flags

- [ ] Add a workspace/channel-scoped canonical-engine flag.
- [ ] Add shadow comparison without side effects.
- [ ] Record old/new decision mismatches with reason and trace ID.
- [ ] Keep the existing global safety gates as final kill switches.

### Rollout

1. [ ] Deploy schema and code with the new engine disabled.
2. [ ] Verify Prisma status and API health.
3. [ ] Enable shadow mode for one Umbler channel.
4. [ ] Review a representative sample of empty, partial and complete messages.
5. [ ] Enable observation for that channel.
6. [ ] Reevaluate controlled retained payloads.
7. [ ] Enable automatic production for the canary channel.
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

- [ ] API task is running without rollback or restart loop.
- [ ] Prisma reports all migrations applied.
- [ ] `/health` returns HTTP 200 with the production web origin allowed.
- [ ] Shadow mismatch count is understood before canary activation.
- [ ] Empty templates create no operational review.
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
