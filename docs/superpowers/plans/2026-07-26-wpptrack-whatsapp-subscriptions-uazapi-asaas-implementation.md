# WhatsApp Subscriptions, Uazapi and Asaas - Implementation Plan

Status: Waves 1-10 implemented locally; Wave 11 automated validation complete.
External sandbox and production checkpoints remain pending.

Design:
`docs/plans/2026-07-26-wpptrack-whatsapp-subscriptions-uazapi-asaas-design.md`

Operational rollout:
`docs/setup/billing/2026-07-26-asaas-uazapi-package-rollout.md`

## Delivery Rules

- Preserve every current production connection, route, token and webhook URL.
- Introduce package billing and seat enforcement behind fail-closed feature
  flags.
- Treat a WhatsApp number/channel as a seat and a workspace plan as the single
  monthly financial subscription.
- Never activate from a browser callback; require a trusted Asaas webhook.
- Never mark a Uazapi instance active without a valid provider result.
- Keep external payload intake separate from production authorization.
- Use additive migrations and a legacy-protected backfill before enforcement.
- Keep all billing mutations workspace-scoped and audited.

## Wave 1 - Contracts, Enums and Additive Schema

- [x] Add shared DTOs for plan kinds, plan visibility, contract states, seat
      states, billing profiles, checkout, cancellation and invoice status.
- [x] Extend `SubscriptionPlan` with monthly package price, included seat count,
      kind and visibility.
- [x] Extend `WorkspaceSubscription` with commercial snapshots, financial
      state, current period, grace, cancellation and fiscal fields.
- [x] Add `WorkspaceBillingProfile`.
- [x] Add `WhatsappSeat` with nullable Uazapi instance and inbound channel
      targets.
- [x] Add database constraints ensuring exactly one seat target and unique
      current entitlement per target.
- [x] Add `BillingProviderEvent` for webhook idempotency.
- [x] Add `BillingContractAudit` for commercial evidence.
- [x] Keep legacy columns readable during the migration.
- [x] Add indexes for workspace contract lookup, capacity counts, provider
      reconciliation and fiscal operations.
- [x] Generate and validate Prisma Client.
- [x] Add migration tests against a schema containing the current 65
      migrations.

Primary files:

- `packages/shared/src/schemas/billing.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/<timestamp>_whatsapp_package_billing/migration.sql`
- `apps/api/test/workspace-billing-migration.test.ts`

Checkpoint: schema is deployable without changing current runtime behavior.

Validation completed on 2026-07-26:

- Prisma schema validation and client generation passed.
- API and shared-package typechecks passed.
- Five additive-migration tests passed.
- Six package-contract tests passed.
- All 98 shared-package tests passed.
- All 32 existing billing regression tests passed.

## Wave 2 - Plan Catalog, Contract Assignment and Seat Ledger

- [x] Implement standard, custom, exempt and legacy-protected plan management.
- [x] Require platform-owner authority for custom assignment and exemptions.
- [x] Store immutable price and capacity snapshots on every assignment.
- [x] Implement a single current contract invariant per workspace.
- [x] Implement seat reserve, activate, suspend, release and expiration
      operations.
- [x] Derive seat use from active/reserved rows instead of
      `activeInstances`.
- [x] Block downgrades below current seat use.
- [x] Require a reason for backoffice commercial changes.
- [x] Emit audit records for every plan, contract and seat transition.
- [x] Add cross-workspace reference and concurrency tests.

Primary files:

- `apps/api/src/billing/billing.service.ts`
- `apps/api/src/billing/backoffice-billing.controller.ts`
- `apps/api/src/billing/billing.controller.ts`
- `apps/api/test/billing-service.test.ts`
- `apps/api/test/backoffice-billing-controller.test.ts`
- `apps/api/test/billing-controller.test.ts`

Checkpoint: capacity can be calculated and enforced locally with Asaas disabled.

## Wave 3 - Asaas Customer and Recurring Checkout

- [x] Extend the Asaas adapter with customer create/update/retrieve.
- [x] Create recurring hosted checkouts with trusted package snapshot values.
- [x] Offer credit card through the documented hosted recurring checkout.
- [ ] Add Pix recurring in a separate Automatic Pix wave after provider
      validation.
- [x] Include stable workspace and contract external references.
- [x] Persist checkout and subscription identifiers without storing payment
      credentials.
- [x] Treat checkout redirects as presentation only.
- [x] Activate the contract only after a matching first-charge webhook.
- [x] Add idempotent handling for checkout, subscription and payment events.
- [x] Add provider reconciliation for a webhook missed during downtime.
- [x] Redact API errors before audit/log persistence.
- [x] Add adapter fixtures for success, provider validation errors, timeout and
      duplicate webhook delivery.

Primary files:

- `apps/api/src/billing/asaas.adapter.ts`
- `apps/api/src/billing/billing.service.ts`
- `apps/api/src/webhooks/webhooks.controller.ts`
- `apps/api/src/webhooks/webhooks.module.ts`
- `apps/api/test/asaas-adapter.test.ts`
- `apps/api/test/billing-service.test.ts`

Checkpoint: sandbox checkout creates one recurring subscription and duplicate
webhooks produce one local transition.

## Wave 4 - Cancellation, Delinquency and Reactivation

- [x] Add workspace-owner self-service cancellation.
- [x] Require confirmation and record an optional cancellation reason.
- [x] Remove the Asaas subscription idempotently.
- [x] Preserve product access until the current paid period end.
- [x] Suspend contract and seats at the access-end timestamp.
- [x] Implement `past_due`, three-day grace and post-grace suspension.
- [x] Block new seats during grace while preserving existing processing.
- [x] Reactivate contract and seats after a later confirmed payment.
- [x] Keep instances, routes and payload history during suspension.
- [x] Add scheduled reconciliation for time-based state transitions.
- [x] Test cancellation retries, already-removed subscriptions and payment
      races.

Primary files:

- `apps/api/src/billing/billing.service.ts`
- `apps/api/src/billing/billing.controller.ts`
- `apps/api/src/runtime/runtime.module.ts`
- `apps/api/test/workspace-billing-service.test.ts`
- `apps/api/test/billing-service.test.ts`

Checkpoint: cancellation and grace behavior are deterministic with fake time.

## Wave 5 - Automatic Service-Invoice Issuance

- [x] Add platform fiscal settings for municipal service identifier/code,
      service description, observations and required taxes.
- [x] Validate required fiscal configuration before enabling paid production.
- [x] Configure Asaas subscription invoice settings with
      `ON_PAYMENT_CONFIRMATION`.
- [x] Persist invoice configuration and invoice status references.
- [x] Consume invoice webhooks idempotently.
- [x] Expose fiscal failures in backoffice with provider reason and retry.
- [x] Keep paid access active when invoice issuance fails.
- [x] Add reconciliation for a paid charge without a corresponding invoice.
- [x] Add fixtures for scheduled, duplicate, failed and retried invoices.

Primary files:

- `apps/api/src/billing/asaas.adapter.ts`
- `apps/api/src/billing/billing.service.ts`
- `apps/api/src/webhooks/webhooks.controller.ts`
- `packages/shared/src/schemas/billing.ts`
- `apps/api/test/asaas-adapter.test.ts`
- `apps/api/test/billing-service.test.ts`

Checkpoint: one sandbox payment produces one invoice attempt and a visible
status.

## Wave 6 - Uazapi Provisioning and QR Journey

- [x] Require an active/exempt/legacy contract and an available seat before
      provisioning.
- [x] Reserve a seat before calling Uazapi.
- [x] Release the reservation on provider failure or timeout.
- [x] Reject empty provider instance IDs or missing instance tokens.
- [x] Configure the exact per-instance webhook after creation.
- [x] Encrypt the returned instance token with the existing connector key
      policy.
- [x] Expose QR data as a scannable image/modal instead of raw text.
- [x] Poll status with bounded intervals and stop on terminal states.
- [x] Promote the seat to active only when Uazapi reports connected.
- [x] Expire abandoned reservations.
- [x] Add retry-safe provisioning and concurrent-create tests.

Primary files:

- `apps/api/src/integrations/uazapi/uazapi.adapter.ts`
- `apps/api/src/integrations/whatsapp-connections.service.ts`
- `apps/api/src/integrations/whatsapp-connections.controller.ts`
- `apps/web/src/app/(app)/integrations/page.tsx`
- `apps/web/src/app/(app)/integrations/whatsapp-connection-actions.ts`
- `apps/api/test/uazapi-adapter.test.ts`
- `apps/api/test/whatsapp-connections-service.test.ts`
- `apps/web/tests/integrations-route.test.ts`

Checkpoint: sandbox payment confirmation unlocks one QR flow and consumes one
seat only.

## Wave 7 - External Channel Billing Gates

- [x] Keep Umbler/Gupshup connection intake available in observation without a
      seat.
- [x] Display billing state per discovered `InboundWebhookChannel`.
- [x] Require available capacity before channel production activation.
- [x] Create one seat for the selected channel in the same transaction as the
      local activation decision.
- [x] Require an active seat before live materialization.
- [x] Preserve observation payloads while unpaid, full or suspended.
- [x] Ensure one shared webhook connection can activate several independently
      entitled channels.
- [x] Keep controlled replay separate from automatic post-payment activation.
- [x] Release a seat only through an explicit confirmed channel removal flow.
- [x] Add regression tests for current Umbler and Gupshup observation,
      production and canonical conversion behavior.

Primary files:

- `apps/api/src/inbound-webhooks/inbound-webhook-connections.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-channel-routes.service.ts`
- `apps/api/src/inbound-webhooks/inbound-webhook-production-intake.service.ts`
- `apps/api/src/inbound-webhook-production/provider-conversion-production.service.ts`
- `apps/api/test/inbound-webhook-production-service.test.ts`
- `apps/api/test/inbound-webhook-channel-routes.test.ts`

Checkpoint: one unpaid discovered channel stays observable and one paid channel
on the same connection can enter production.

## Wave 8 - Workspace Subscription and WhatsApp UI

- [x] Add `Settings > Subscription`.
- [x] Show plan, monthly total, current period, payment state and cancellation.
- [x] Show used, reserved and available WhatsApp seats.
- [x] Add billing-profile collection with validation.
- [x] Add recurring checkout and payment-pending states.
- [x] Add invoice history and fiscal status.
- [x] Add an explicit self-service cancel confirmation.
- [x] Allow an owner to remove a Uazapi number with exact-name confirmation,
      provider deletion, immediate seat release and preserved local history.
- [x] Unify Uazapi instances and external channels in the WhatsApp integration
      area without hiding provider-specific actions.
- [x] Add actionable states for plan missing, payment pending, plan full,
      grace, suspended, provisioning failed and QR expired.
- [x] Keep analysts/admins read-only according to the approved role matrix.
- [ ] Verify desktop, collapsed sidebar, tablet and mobile layouts.

Primary files:

- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/(app)/integrations/page.tsx`
- `apps/web/src/styles/globals.css`
- `packages/shared/src/schemas/billing.ts`
- `apps/web/tests/integrations-route.test.ts`
- `apps/web/tests/settings-route.test.ts`

Checkpoint: a workspace owner can understand and complete the full journey
without backoffice assistance.

## Wave 9 - Backoffice Commercial and Fiscal Operations

- [x] Extend the existing Plans section with package price, seat limit, kind and
      visibility.
- [x] Add workspace contract assignment and required change reason.
- [x] Add exempt and legacy-protected assignment controls.
- [x] Show contract status, occupied seats, Asaas customer/subscription and
      current period.
- [x] Add payment, cancellation, grace and reconciliation views.
- [x] Add invoice status, fiscal configuration and failure recovery.
- [x] Prevent edits that would reduce capacity below seat use.
- [x] Keep provider payloads and credentials out of commercial views.
- [x] Add name/workspace filters and clear human-facing labels.

Primary files:

- `apps/web/src/app/(backoffice)/backoffice/page.tsx`
- `apps/web/src/components/backoffice-operations-navigation.tsx`
- `apps/api/src/billing/backoffice-billing.controller.ts`
- `apps/api/src/billing/billing.service.ts`
- `apps/web/tests/backoffice-route.test.ts`
- `apps/api/test/backoffice-billing-controller.test.ts`

Checkpoint: the platform owner can assign each approved example package and an
exemption without database access.

## Wave 10 - Legacy-Protected Backfill

- [x] Count current production WhatsApp resources per workspace.
- [x] Normalize and review duplicate provider/channel references.
- [x] Create one legacy-protected contract per current workspace.
- [x] Create seats for every current production Uazapi instance and external
      channel.
- [x] Set protected capacity exactly to the migrated active seat count.
- [x] Do not change current connection, channel or instance statuses.
- [x] Produce a dry-run report before applying the backfill.
- [x] Make the backfill idempotent and safe to resume.
- [x] Block new activations only after backfill verification.

Primary files:

- `apps/api/prisma/migrations/<timestamp>_backfill_legacy_whatsapp_seats/migration.sql`
- `apps/api/src/billing/legacy-billing-backfill.service.ts`
- `apps/api/src/billing/backoffice-billing.controller.ts`
- `apps/api/test/legacy-billing-backfill.test.ts`

Checkpoint: seat counts match production before and after migration and no
provider API is called.

## Wave 11 - Security, Regression and Controlled Rollout

- [x] Test workspace isolation for plans, profiles, contracts, seats, checkouts
      and cancellation.
- [x] Test platform-owner-only custom plan and exemption controls.
- [x] Test webhook authentication, event idempotency and external-reference
      spoofing.
- [x] Test concurrent seat reservation at the capacity boundary.
- [x] Test that checkout redirects cannot activate service.
- [x] Test secret redaction in provider and fiscal failures.
- [x] Run shared, API and web test suites, typechecks, Prisma validation, build
      and `git diff --check`.
- [ ] Deploy schema/API/web with enforcement and checkout feature flags false.
- [ ] Run the legacy backfill dry-run and compare counts.
- [ ] Enable one sandbox workspace.
- [ ] Validate customer creation, checkout, first payment, NFS-e configuration,
      Uazapi QR, message webhook and cancellation.
- [ ] Enable one production canary workspace.
- [ ] Observe one complete renewal cycle or provider-simulated equivalent.
- [ ] Expand gradually without migrating stable legacy clients until their
      definitive plans are assigned.

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

## Feature Flags

Introduce fail-closed flags:

- `WPPTRACK_PACKAGE_BILLING_ENABLED=false`
- `WPPTRACK_PACKAGE_BILLING_ENFORCEMENT_ENABLED=false`
- `WPPTRACK_ASAAS_RECURRING_ENABLED=false`
- `WPPTRACK_BILLING_LIFECYCLE_ENABLED=false`
- `WPPTRACK_ASAAS_FISCAL_ENABLED=false`
- `WPPTRACK_UAZAPI_PACKAGE_PROVISIONING_ENABLED=false`
- `WPPTRACK_EXTERNAL_CHANNEL_BILLING_ENFORCEMENT_ENABLED=false`
- `WPPTRACK_BILLING_LEGACY_BACKFILL_ENABLED=false`
- `WPPTRACK_ASAAS_RECONCILIATION_ENABLED=false`

Flags enable capability only. Contract, capacity, provider and permission gates
remain mandatory after a flag is enabled.

## Automated Validation Completed

Completed locally on 2026-07-26:

- 168 API test files and 1,222 tests passed, including the Asaas adapter
  timeout fixture.
- 46 web test files and 276 tests passed.
- Five shared test files and 100 tests passed.
- API, web and shared TypeScript checks passed.
- API, web and shared production builds passed.
- Prisma schema validation passed with a disposable local validation URL.
- `git diff --check` passed; only the existing Windows LF/CRLF warnings remain.

Still external/manual:

- Visual viewport review against an authenticated, seeded deployment.
- NFS-e configuration and invoice issuance.
- Removal of one sandbox Uazapi instance and confirmation that its package seat
  becomes available again.
- Production canary, cancellation and renewal-cycle observation.

Validated externally on 2026-07-27:

- Production schema is current and the API health endpoint returns `200`.
- Existing Umbler workspaces were protected by legacy contracts without
  changing their running connections.
- Asaas sandbox checkout, recurring subscription creation and payment webhook
  activated the Comunidade NOD contract.
- A Uazapi instance was created, connected through the in-product QR flow and
  displayed with its connected phone and active seat.

## Production Checkpoints

1. Additive schema is current and current traffic is unchanged.
2. Legacy dry-run counts match all active production numbers.
3. Sandbox recurring checkout returns a hosted payment URL.
4. First payment webhook activates exactly one workspace contract.
5. Automatic invoice settings are present on the Asaas subscription.
6. One Uazapi instance connects through an in-product QR.
7. A second seat within the package does not create another subscription.
8. Capacity blocks the first number above the plan limit.
9. An external channel remains observation-only without a seat.
10. Self-service cancellation stops renewal and preserves paid-period access.
11. Three-day grace and payment reactivation work without deleting data.
12. Only then is enforcement enabled for new production workspaces.

## Deferred Work

- Automatic per-seat overage charges.
- Different commercial prices for individual numbers in one workspace.
- Customer-created custom plans or self-service exemptions.
- Proration inside an already paid period.
- Automatic migration of stable legacy customers to paid plans.
- Providers beyond Uazapi, Umbler and Gupshup.
