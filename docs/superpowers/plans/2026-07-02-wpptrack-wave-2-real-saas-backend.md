# WppTrack Wave 2 Real SaaS Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for independent tasks and superpowers:test-driven-development for behavior changes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move WppTrack from navigable shell plus auth foundation into a functional SaaS backend that can persist workspace data, expose diagnostics, and provide non-secret integration/billing control surfaces without requiring real Meta, Uazapi or Asaas credentials.

**Architecture:** Keep all external-provider secrets and calls behind NestJS modules. Use Prisma migrations for durable entities, shared Zod schemas for API contracts, and thin controllers over services. Frontend can remain visually stable while consuming typed backend endpoints in later tasks.

**Tech Stack:** NestJS, Prisma, PostgreSQL, BullMQ/Redis, Zod, Vitest, Next.js, pnpm/turbo.

---

## Scope Rules

- [ ] Do not integrate real Meta, Uazapi or Asaas credentials in this wave.
- [ ] Do not expose provider tokens, refresh tokens or API keys to frontend responses.
- [ ] Keep the WppTrack design system unchanged unless wiring UI state requires small component changes.
- [ ] Keep `Clientes` out of the client-facing app.
- [ ] Commit each stable backend slice separately.
- [ ] Run focused tests after each slice, then root verification after integration.

## Task 1: Workspace API

**Files:**
- Modify: `packages/shared/src/schemas/workspace.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/contracts.test.ts`
- Create: `apps/api/src/auth/auth-token.ts`
- Create: `apps/api/src/auth/auth-user.decorator.ts`
- Create: `apps/api/src/workspaces/workspaces.controller.ts`
- Modify: `apps/api/src/workspaces/workspaces.service.ts`
- Modify: `apps/api/src/workspaces/workspaces.module.ts`
- Create: `apps/api/test/workspaces-controller.test.ts`

Steps:

- [ ] Add shared schemas for authenticated workspace summaries and member invites.
- [ ] Add an auth token helper that reads `Bearer` or `wpptrack_session` cookie.
- [ ] Add `@AuthUser()` decorator that resolves current session through `AuthService`.
- [ ] Add `GET /workspaces/current` returning the first workspace for the authenticated user with role permissions.
- [ ] Add `GET /workspaces/current/members` returning current workspace members.
- [ ] Add `POST /workspaces/current/invites` creating a pending invite for owner/admin roles.
- [ ] Cover all endpoints with controller/service tests.
- [ ] Commit with `feat: add workspace API`.

## Task 2: Diagnostics Persistence and API

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create migration under `apps/api/prisma/migrations/`
- Create: `packages/shared/src/schemas/diagnostics.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/contracts.test.ts`
- Create: `apps/api/src/diagnostics/diagnostics.module.ts`
- Create: `apps/api/src/diagnostics/diagnostics.service.ts`
- Create: `apps/api/src/diagnostics/diagnostics.controller.ts`
- Create: `apps/api/test/diagnostics-contract.test.ts`
- Modify: `apps/api/src/app.module.ts`

Steps:

- [ ] Add Prisma enums/models for `DiagnosticEvent`, `WebhookLog`, `IntegrationLog`, `ConversionEventLog`, `JobAttempt` and `AuditLog`.
- [ ] Add safe indexes by `workspaceId`, `source`, `status`, `occurredAt`, and related ids.
- [ ] Add shared DTO schemas for diagnostic events list/detail/create.
- [ ] Add `DiagnosticsService.recordEvent`, `listEvents`, and `getEvent`.
- [ ] Add `GET /backoffice/diagnostics/events` and `POST /backoffice/diagnostics/events` as internal scaffolds.
- [ ] Redact sensitive fields from persisted summaries.
- [ ] Cover persistence and redaction with tests.
- [ ] Commit with `feat: add diagnostics persistence`.

## Task 3: Integration Status API

**Files:**
- Modify: `apps/api/src/integrations/integrations.module.ts`
- Create: `apps/api/src/integrations/integrations.service.ts`
- Create: `apps/api/src/integrations/integrations.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/integrations-controller.test.ts`
- Modify if needed: `packages/shared/src/schemas/integrations.ts`

Steps:

- [ ] Add `IntegrationsService.getHealthSummary()` aggregating Meta, Uazapi and Asaas adapters.
- [ ] Add `GET /integrations/health` for authenticated workspace context.
- [ ] Add non-secret connect-intention endpoints returning next-action metadata, not external calls: `/integrations/meta/start`, `/integrations/uazapi/start`, `/integrations/asaas/status`.
- [ ] Cover missing env behavior and shape with tests.
- [ ] Commit with `feat: expose integration status API`.

## Task 4: Billing and WhatsApp Instance Activation Scaffold

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create migration under `apps/api/prisma/migrations/`
- Create: `packages/shared/src/schemas/billing.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/billing/billing.module.ts`
- Create: `apps/api/src/billing/billing.service.ts`
- Create: `apps/api/src/billing/billing.controller.ts`
- Create: `apps/api/test/billing-contract.test.ts`
- Modify: `apps/api/src/app.module.ts`

Steps:

- [ ] Add Prisma models for `SubscriptionPlan`, `WorkspaceSubscription`, `PaymentCharge`, `SplitReceiver`, `SplitRule`, and `WhatsappInstanceActivation`.
- [ ] Add shared DTOs for instance price quote and activation checkout.
- [ ] Add `GET /billing/whatsapp-instance/quote`.
- [ ] Add `POST /billing/whatsapp-instance/checkout` that creates a pending WhatsApp instance and pending charge record without activating it.
- [ ] Ensure status remains `pending_payment` until a future Asaas webhook confirms payment.
- [ ] Cover payment-before-activation with tests.
- [ ] Commit with `feat: scaffold billing activation flow`.

## Task 5: Frontend Backend Wiring

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/(app)/integrations/page.tsx`
- Modify: `apps/web/src/app/(backoffice)/backoffice/page.tsx`
- Modify tests under `apps/web/tests/`

Steps:

- [ ] Add API client helper using `NEXT_PUBLIC_API_URL`.
- [ ] Add login/register form actions that call backend auth endpoints.
- [ ] Show integration health from `/integrations/health` when available, with static fallback for local preview.
- [ ] Show diagnostics empty/loading/error states in backoffice.
- [ ] Keep visual parity with Telemetria Noturna.
- [ ] Cover route/rendering behavior with tests.
- [ ] Commit with `feat: wire web shell to backend APIs`.

## Task 6: Integrated Verification and Handoff

Steps:

- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `docker compose ps`.
- [ ] Run Prisma `validate`, `migrate status`, and `migrate deploy` against local Postgres.
- [ ] Update `Projeto.md` with completed Wave 2 slices, verification evidence, remaining credential-dependent work, and next wave.
- [ ] Commit docs with `docs: record wave 2 backend status`.
