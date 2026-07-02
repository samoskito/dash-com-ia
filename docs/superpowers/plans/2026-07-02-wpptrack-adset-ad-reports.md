# WppTrack Ad Set And Ad Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real report rows for Meta ad sets and ads, exposed by backend endpoints and rendered in the Reports page without invented metrics.

**Architecture:** Reuse the existing campaign reporting contract shape for ad set and ad report rows. The API will expose `/reports/adsets` and `/reports/ads`, both scoped to the authenticated workspace and filtered by the same `since`/`until` query parameters already used by `/reports/campaigns`. Metrics come from persisted Meta snapshots plus internal `Lead` and `ConversionEventLog` records matched by `adSetId` or `adId`.

**Tech Stack:** Next.js App Router, NestJS, Prisma, Vitest, shared Zod contracts.

---

### Task 1: Shared Reporting Contracts

**Files:**
- Modify: `packages/shared/src/schemas/reporting.ts`
- Modify: `packages/shared/tests/contracts.test.ts`

- [ ] Write a failing contract test proving ad set and ad report overview payloads parse with the same performance fields used by campaign rows.
- [ ] Run `pnpm --filter @wpptrack/shared test -- tests/contracts.test.ts` and confirm the new test fails because the schemas are missing.
- [ ] Add `adSetReportRowSchema`, `adReportRowSchema`, `adSetReportOverviewSchema`, and `adReportOverviewSchema`; export their DTO types.
- [ ] Re-run the shared contract test and confirm it passes.
- [ ] Commit as `feat: add ad level reporting contracts`.

### Task 2: Backend Reporting Service And Controller

**Files:**
- Modify: `apps/api/src/reporting/meta-reporting.service.ts`
- Modify: `apps/api/src/reporting/reporting.controller.ts`
- Modify: `apps/api/test/meta-reporting-service.test.ts`
- Modify: `apps/api/test/reporting-controller.test.ts`

- [ ] Write failing service tests for `getAdSetReportOverview` and `getAdReportOverview`, verifying spend/event metrics are matched by `adSetId` and `adId`.
- [ ] Write failing controller tests for `GET /reports/adsets` and `GET /reports/ads`, including `since`/`until` forwarding.
- [ ] Run the focused API tests and confirm they fail because the methods/endpoints are missing.
- [ ] Implement service methods using `metaAdSet.findMany`, `metaAd.findMany`, sent `conversionEventLog` rows, and `lead` rows. Keep spend at `0` until Meta insights by ad set/ad are persisted, so cost-per values remain `null` instead of estimated.
- [ ] Implement controller endpoints with the same auth and range-label handling as campaign reports.
- [ ] Re-run focused API tests and confirm they pass.
- [ ] Commit as `feat: add adset and ad report endpoints`.

### Task 3: Reports Page UI

**Files:**
- Modify: `apps/web/src/app/(app)/reports/page.tsx`
- Modify: `apps/web/tests/reports-route.test.ts`

- [ ] Write a failing web route test proving Reports fetches `/reports/adsets` and `/reports/ads`, renders "Performance por conjunto" and "Performance por anuncio", and does not invent rows on API failure.
- [ ] Run `pnpm --filter @wpptrack/web test -- tests/reports-route.test.ts` and confirm the test fails because the UI does not fetch/render those sections.
- [ ] Add server-side fetch helpers for ad set/ad reports with `real`, `empty`, and `error` states.
- [ ] Render two new tables below campaign performance using the same metric columns and empty/error copy.
- [ ] Re-run the focused web route test and confirm it passes.
- [ ] Commit as `feat: show adset and ad reports`.

### Task 4: Documentation And Full Verification

**Files:**
- Modify: `Projeto.md`

- [ ] Update `Projeto.md` with the new endpoints and UI behavior.
- [ ] Run `pnpm exec turbo test --force`.
- [ ] Run `pnpm exec turbo typecheck --force`.
- [ ] Run `pnpm exec turbo build --force`.
- [ ] Run `git diff --check -- . ':!design-system' ':!visualizacao-wpptrack.html' ':!wpptrack-design-system' ':!wpptrack-saas-visual.html'`.
- [ ] Commit documentation if it was not included in the feature commits.
