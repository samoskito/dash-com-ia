# RastrackDash sanitized export — F3.4 build report

Generated: 2026-08-23T14:46:45Z
Source commit (pre-commit HEAD): 9c6a4f1
Export destination: `/tmp/rastrackdash-export` (under `/tmp` only, never pushed, never written into `nod-rastrackdash-wpp`)

## Critical bug fixed this pass

`applyStaffOnlyBackofficeMethodsRemoval` and `applyMetaOAuthStateResidueRemoval` were fully
implemented in `scripts/rastrackdash/sanitize-export.mjs` (F3.4 CONTINUE task) but never
invoked from `main()` — the exporter defined the codemods and then silently skipped them,
so every export still carried the dead staff-backoffice / MetaOAuthState code that F3.4
CONTINUE's real `tsc --noEmit` run had already diagnosed. Fixed by:

- Wiring both functions into `main()` right after the F3.3 codemod block
  (`applyOpsAlertsWhatsappConnectionsStub`), with a matching `console.log` banner.
- Adding an `## F3.4 typecheck residue codemods` section to `writeExportReport()` so
  `f34Codemod` / `f34CodemodFailed` entries are visible in `EXPORT_REPORT.md` (they were
  logged into the array but never printed).

All anchor/string codemod steps in both functions matched current private source on the
first re-run — no drift, no codemod text changes were needed.

## Also carried in this commit

- `packages/shared/src/schemas/billing.ts` / `.../integrations.ts`: moved
  `whatsappLabelSchema` / `whatsappLabelListSchema` (+ `WhatsappLabelDto` /
  `WhatsappLabelListDto` types) from `billing.ts` to `integrations.ts`. This DTO is a
  WhatsApp/UAZAPI conversation-label concept, not billing — keeping it in `billing.ts`
  meant it disappeared along with the rest of the billing schema exports once `billing/`
  is stripped from the export, breaking `uazapi.adapter.ts`. `packages/shared/src/index.ts`
  already does `export * from "./schemas/integrations"`, so `@wpptrack/shared` still
  re-exports both names — no index.ts change needed.

## Build matrix

Run from `/tmp/rastrackdash-export` after `pnpm install`:

| Step | Command | Result |
|---|---|---|
| Export | `node scripts/rastrackdash/sanitize-export.mjs --self-test` | PASS (4/4 checks) |
| Export | `node scripts/rastrackdash/sanitize-export.mjs --out /tmp/rastrackdash-export --force` | OK — secret scan PASS, dangling relative-imports: 0 |
| Install | `pnpm install` | OK (513 packages, lockfile up to date) |
| Shared build | `pnpm --filter @wpptrack/shared build` | **OK** (exit 0) |
| Prisma generate | `pnpm --filter @wpptrack/api prisma:generate` | **OK** (Prisma Client v6.19.3 generated) |
| **API typecheck** | `pnpm --filter @wpptrack/api typecheck` | **GREEN — exit 0, zero errors** |
| **API build** | `pnpm --filter @wpptrack/api build` (`nest build`) | **GREEN — exit 0** |
| Web typecheck | `pnpm --filter @wpptrack/web typecheck` | FAIL — exit 2, 8 errors (see below) |
| Web build | `pnpm --filter @wpptrack/web build` (`next build`) | FAIL — exit 1, same root cause, build worker aborts on first error |

## Remaining errors (web only — API is fully green)

All 8 web `tsc` errors are pre-existing billing/subscription DTO imports the F3.x codemod
passes never targeted (in scope was API dangling imports; web's billing/subscription page
code was left for a later slice per `EXPORT_REPORT.md`'s "Known limitations" section):

```
src/app/(app)/integrations/page.tsx(14,3): error TS2305: no exported member 'WhatsappInstanceCheckoutDto'
src/app/(app)/integrations/page.tsx(15,3): error TS2305: no exported member 'WhatsappInstanceConnectionDto'
src/app/(app)/integrations/page.tsx(16,3): error TS2305: no exported member 'WhatsappInstanceQuoteDto'
src/app/(app)/integrations/page.tsx(17,3): error TS2724: no exported member 'WhatsappInstanceSummaryDto' (billing schema, stripped)
src/app/(app)/integrations/page.tsx(18,3): error TS2724: no exported member 'WorkspacePackageBillingStateDto' (billing schema, stripped)
src/app/(app)/integrations/page.tsx(19,3): error TS2305: no exported member 'WorkspaceSubscriptionSummaryDto' (billing schema, stripped)
src/app/(app)/settings/page.tsx(2,3): error TS2305: no exported member 'ClientOwnerAccessResendResultDto' (staff/backoffice schema, stripped)
src/app/(app)/settings/page.tsx(10,3): error TS2724: no exported member 'WhatsappInstanceSummaryDto' (billing schema, stripped)
```

These are the same class of "imports a schema/DTO that billing/backoffice-strip removed"
break the F3.3/F3.4 codemods already fixed on the API side, just not yet mirrored into the
two web pages above. Fixing them is a real codemod-writing task (trim imports + remove/replace
the JSX sections that render checkout/quote/subscription-summary UI), not a one-line anchor
fix, so it is left as a documented follow-up rather than rushed in this pass — consistent
with F3.4's brief ("short wire-up + verify, not a redesign").

## G4 readiness verdict

**Partial — API ready, web is not.**

- The private → public sanitize pipeline for `apps/api` + `packages/shared` is provably
  buildable: install, shared build, prisma generate, `api typecheck`, and `api build` all
  exit 0 against a real `tsc`/`nest build` run of the sanitized tree.
- `apps/web` is not yet import-clean; publishing to `nod-rastrackdash-wpp` (G4) today would
  ship a web app that fails `next build`. This blocks a full G4 export until a follow-up
  slice adds `apps/web/src/app/(app)/integrations/page.tsx` and `.../settings/page.tsx` to
  the codemod set (same pattern as F3.3/F3.4: trim the dead-DTO imports, remove/replace the
  JSX that reads checkout/quote/subscription-summary/client-owner-resend data).
- Secret scan: PASS. Dangling relative-import scan: 0. No licensing/billing source ever
  reaches the export tree.

## Files changed (private repo, this commit)

- `scripts/rastrackdash/sanitize-export.mjs` — wired the two F3.4 codemods into `main()`;
  added the F3.4 section to `writeExportReport()`.
- `packages/shared/src/schemas/billing.ts` — removed `whatsappLabelSchema` /
  `whatsappLabelListSchema` / `WhatsappLabelDto` / `WhatsappLabelListDto`.
- `packages/shared/src/schemas/integrations.ts` — added the same (moved, not duplicated).
- `scripts/rastrackdash/EXPORT_NOTES.md` — refreshed by the latest `--force` run.
- `scripts/rastrackdash/F3_4_BUILD_REPORT.md` — this report (new).

## Commit

`fix: make rastrackdash sanitized export typecheck (F3.4)` — HEAD of
`feat/rastrackdash-f3-build` after this commit (local only, not pushed anywhere; see the
task's final chat report for the exact hash — amending this file's own commit to embed its
own resulting hash isn't possible).
