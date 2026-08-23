# RastrackDash sanitized export — F3.4 / F3.4b build report

Generated: 2026-08-23T20:15:00Z (F3.4b verify by orchestrator)
Source branch: `feat/rastrackdash-f3-web` (base main `6dc65dc` + F3.4b uncommitted → this commit)
Export destination: `/tmp/rastrackdash-export` (under `/tmp` only; never pushed; never written into `nod-rastrackdash-wpp`)

## F3.4 (already on main via #59)

- Wired `applyStaffOnlyBackofficeMethodsRemoval` + `applyMetaOAuthStateResidueRemoval` into `main()`
- Moved `WhatsappLabelDto` from `billing.ts` → `integrations.ts`
- Proven: shared build, prisma generate, **api typecheck**, **api nest build** green
- Web still failed on 8 billing/subscription DTO imports

## F3.4b (this slice)

### Codemods added / invoked

- `applyWebIntegrationsBillingUiRemoval` → `apps/web/src/app/(app)/integrations/page.tsx`
- `applyWebSettingsBillingUiRemoval` → `apps/web/src/app/(app)/settings/page.tsx`
- Wrapper `applyWebBillingSubscriptionUiRemoval` called from `main()` after F3.4 API codemods
- yml notes updated for F3.4b rewrite rules / remove paths as needed

Effects (from EXPORT_REPORT on verified run):

- Trimmed dead billing/instance-marketplace DTO imports on integrations page
- Dropped checkout/quote/subscription/package-billing Promise.all loads + server actions
- Replaced package/instance marketplace JSX with minimal native/BYO Uazapi status readout
- Settings: removed `ClientOwnerAccessResendResultDto` import + “Reenviar e-mail de acesso” block + dead resend action
- Local structural type for remaining WhatsApp instance summary shape where needed
- Kept Meta manual + generic settings shell

### Build matrix (revalidated by orchestrator after Claude max-turns left uncommitted diff)

| Step | Result |
|---|---|
| `sanitize-export.mjs --out /tmp/rastrackdash-export --force` | OK — secret **PASS**, dangling **0** |
| F3.4b codemods banner in export log | applied |
| `pnpm install` | OK |
| `pnpm --filter @wpptrack/shared build` | **OK** |
| `pnpm --filter @wpptrack/api typecheck` | **GREEN** |
| `pnpm --filter @wpptrack/web typecheck` | **GREEN** (exit 0, zero TS errors) |
| `pnpm --filter @wpptrack/web build` (`next build`) | **GREEN** — compiled, typed, 20/20 static pages |

`next build` routes observed include `/integrations`, `/settings`, login/overview/leads/events/reports — no `/subscription` route.

### Before → after (web)

| | Before F3.4b | After F3.4b |
|---|---|---|
| Web tsc errors | 8 (billing/subscription DTOs) | **0** |
| `next build` | FAIL | **PASS** |
| API typecheck | GREEN | **GREEN** |
| Secret / dangling | PASS / 0 | **PASS / 0** |

## G4 readiness verdict

**YES — technical build gate for sanitized monorepo export is green** (shared + api + web).

Still human-gated before public import:

1. Samuel explicit **`autorizado`** for G4 push into `nod-rastrackdash-wpp`
2. Branding/package rename polish may still be desired (WppTrack → RastrackDash) — product polish, not a build blocker
3. F4 license **client** is a separate phase after public template lands
4. Ops-alerts Uazapi disconnect still stubbed (documented earlier) — product follow-up, not a typecheck blocker

## Files changed (private repo, this commit)

- `scripts/rastrackdash/sanitize-export.mjs` — F3.4b web billing UI codemods + main() wire-up + report section
- `scripts/rastrackdash/sanitize-allowdeny.yml` — F3.4b notes/rules
- `scripts/rastrackdash/EXPORT_NOTES.md` — last dry-run refresh
- `scripts/rastrackdash/F3_4_BUILD_REPORT.md` — this report

## Commit

`fix: strip web billing DTOs from rastrackdash export (F3.4b)` — local only until push authorized.
