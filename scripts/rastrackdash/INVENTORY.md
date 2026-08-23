# RastrackDash sanitize inventory (F3.1)

Human-readable companion to [`sanitize-allowdeny.yml`](./sanitize-allowdeny.yml).
Evidence-based walk of the private monorepo at branch `feat/rastrackdash-f3-sanitize`
(base `eebcfec`). Every path was inspected (file listing and/or source read) before
being classified — see "evidence" column.

Legend: **KEEP** ship as-is · **STRIP** never ship · **REWRITE** ship, but code/config
must change first (branding, domain, BYO-only) · **DEFER(F4+)** decision or larger
rework needed, out of scope for F3.1/F3.2.

## `apps/api/src/*` (22 top-level modules — full coverage)

| Module | Verdict | Reason | Evidence |
|---|---|---|---|
| `auth/` | REWRITE | Email/password + Google login is core (student = platform owner of their deploy). But `backoffice-platform-users.controller.ts` (PalmUP multi-client staff user mgmt) is STRIP, and `platform-admin.service.ts` / `platform-admin-bootstrap.ts` assume a multi-client staff hierarchy — need rewrite to single-owner bootstrap. | `apps/api/src/auth/*.ts` |
| `billing/` | DEFER(F4+) | 24 files, almost entirely Asaas/package/subscription/split billing — PalmUP monetization only, not generic to a self-hosted deploy. `whatsapp-seat.service.ts` + `billing-seat.module.ts` hold a generic "seat = WhatsApp instance" concept that may be worth keeping; needs a product decision before deletion (see `defer_review` in yml). | `apps/api/src/billing/*.ts` (24 files) |
| `common/` | KEEP | Framework plumbing: Prisma, queue (BullMQ), guards, HTTP interceptor, date-time, phone, runtime config. No PalmUP-specific business logic. | `apps/api/src/common/**` |
| `config/` | REWRITE | `deployment-config.ts` hardcodes `assertProductionBrevoConfig()` requiring `noreply@rastrack.app` / `suporte@rastrack.app` — fails boot otherwise. Rewrite to a generic "sender must be verified" check, no hardcoded domain. | `apps/api/src/config/deployment-config.ts:199-232` |
| `conversion-events/` | KEEP | Core product: Meta CAPI conversion event building/sending. No license/billing coupling found. | `apps/api/src/conversion-events/*.ts` |
| `conversion-rules/` | KEEP | Core product: funnel/conversion rule engine, decision engine, catalog. 17 files, no PalmUP-exclusive coupling found. | `apps/api/src/conversion-rules/*.ts` |
| `diagnostics/` | KEEP | Product diagnostics feature (workspace-scoped event log/troubleshooting). | `apps/api/src/diagnostics/*.ts` |
| `email/` | REWRITE | Core transactional email (queue, renderer, health) is product infra, but templates hardcode `suporte@rastrack.app` and the module is Brevo-flavored. Rewrite for BYO SMTP branding. | `apps/api/src/email/email-message.renderer.ts:134,192,234` |
| `external-data/` | KEEP | Core product: external MySQL connector sync, ingestion, auto-sync. No PalmUP-exclusive coupling found (has its own `backoffice-external-data.controller.ts` — verify scope in F3.2, likely workspace-scoped already). | `apps/api/src/external-data/*.ts` |
| `health/` | KEEP | Trivial `/health` endpoint. | `apps/api/src/health/*.ts` |
| `inbound-webhook-production/` | KEEP | Core: production-intake pipeline + purchase review workflow (workspace-scoped). | `apps/api/src/inbound-webhook-production/*.ts` |
| `inbound-webhook-replay/` | DEFER(F4+) | Replay engine itself is generic infra (KEEP), but `inbound-webhook-replay.controller.ts` reads as a PalmUP-staff, cross-workspace triage tool. Needs scoping review, not a blanket keep. | `apps/api/src/inbound-webhook-replay/inbound-webhook-replay.controller.ts` |
| `inbound-webhooks/` | DEFER(F4+) | Core registry (Umbler/Gupshup parsers, ingestion, channel routes) is KEEP — this is the product's inbound webhook system. `backoffice-inbound-webhooks.*` and `backoffice-inbound-webhook-recovery.*` (4 files) look like PalmUP staff, platform-wide recovery tools; needs a workspace-scoping decision before shipping. | `apps/api/src/inbound-webhooks/*.ts` (23 files) |
| `integrations/` | REWRITE | `meta/` manual connections (KEEP, BYO token) vs. OAuth broker (`meta/start`, `meta/callback`, `MetaOAuthState`, `legacy_oauth` source) which needs PalmUP's own `META_APP_ID`/`META_APP_SECRET` — STRIP the broker, keep manual. `asaas/` subfolder is STRIP (billing gateway). `uazapi/` adapter is KEEP as BYO. | `apps/api/src/integrations/integrations.controller.ts:75-99`, `apps/api/src/integrations/meta/meta-connection-resolver.service.ts`, `apps/api/src/integrations/asaas/asaas.adapter.ts` |
| `leads/` | KEEP | Core product: leads CRUD/list. | `apps/api/src/leads/*.ts` |
| `licensing/` | STRIP | Entire license server (activate/heartbeat/Guru webhook/admin/notify/crypto) — PalmUP-operated infra per F1/F2, must never ship to the public template. 15 files. | `apps/api/src/licensing/*.ts` (15 files) |
| `ops-alerts/` | KEEP | Workspace-level product feature: WhatsApp disconnect / webhook-silence alerts to workspace managers. Verified workspace-scoped (`@Controller("workspaces/:workspaceId/ops-alerts")`), not PalmUP-internal ops. | `apps/api/src/ops-alerts/ops-alerts.controller.ts:8` |
| `reporting/` | KEEP | Core product: Meta reporting sync + metrics engine + WhatsApp campaign classifier. | `apps/api/src/reporting/*.ts` |
| `scripts/` | REWRITE | `create-user.ts` KEEP (generic). `create-platform-admin.ts` / `promote-platform-owner.ts` REWRITE to a single self-host owner bootstrap (currently assume PalmUP multi-client staff model). `audit-gupshup-ctwa.ts` STRIP (PalmUP internal audit tool). | `apps/api/src/scripts/*.ts` (4 files) |
| `webhooks/` | KEEP | Legacy Uazapi webhook parser/controller — generic BYO Uazapi inbound path. Verify no overlap/dead-code vs. `inbound-webhooks/` in F3.2. | `apps/api/src/webhooks/*.ts` |
| `workspaces/` | REWRITE | Core multi-tenant workspace module is KEEP. `client-swap/` (4 files) is a PalmUP-staff "swap active client data" support tool — STRIP. `backoffice-workspaces.controller.ts` (cross-client workspace listing for PalmUP staff) — DEFER, likely becomes a single-owner admin view or is dropped. | `apps/api/src/workspaces/client-swap/*.ts`, `apps/api/src/workspaces/backoffice-workspaces.controller.ts` |
| `xmax/` | STRIP | Bespoke integration with one external CRM tenant type ("atenderbem.com" queues/tags), not a generic feature for the target student audience. 8 files + 4 Prisma models. | `apps/api/src/xmax/*.ts`, `apps/api/src/xmax/xmax-webhook.controller.ts:1-60` |

## `apps/web` areas

| Area | Verdict | Reason | Evidence |
|---|---|---|---|
| `app/(app)/events/` | KEEP | Core product UI. | — |
| `app/(app)/integrations/` | REWRITE | 16 files; `meta-oauth-button.tsx` (broker flow) STRIP, `meta-manual-connection-panel.tsx` / `meta-manual-actions.ts` KEEP. | `apps/web/src/app/(app)/integrations/meta-oauth-button.tsx` |
| `app/(app)/leads/` | KEEP | Core product UI. | — |
| `app/(app)/overview/` | KEEP | Core product UI (dashboard). | — |
| `app/(app)/reports/` | KEEP | Core product UI. | — |
| `app/(app)/settings/` | KEEP | Workspace settings UI; references platform-admin concepts in places — re-verify per `auth/` rewrite. | `apps/web/src/app/(app)/settings/page.tsx` |
| `app/(app)/subscription/` | DEFER(F4+) | Presumed wired to package-billing/Asaas checkout; needs confirmation of full removal vs. a BYO-billing stub. | `apps/web/src/app/(app)/subscription/page.tsx` |
| `app/(backoffice)/backoffice/billing/` | STRIP | PalmUP billing ops console. | `apps/web/src/app/(backoffice)/backoffice/billing/page.tsx` |
| `app/(backoffice)/backoffice/clients/` | STRIP | PalmUP staff multi-client console, ties to `client-swap`. | `apps/web/src/app/(backoffice)/backoffice/clients/page.tsx` |
| `app/(backoffice)/backoffice/diagnostics/` | DEFER(F4+) | Mirrors API-side ambiguity; may become single-owner admin view. | — |
| `app/(backoffice)/backoffice/inbound-webhooks/` | DEFER(F4+) | Mirrors API-side `inbound-webhooks` backoffice ambiguity (recovery/replay/parser-recovery subpaths). | `apps/web/src/app/(backoffice)/backoffice/inbound-webhooks/**` |
| `app/(backoffice)/backoffice/webhooks/` | DEFER(F4+) | Same as above. | — |
| `app/actions/` | KEEP | Shared Next.js server actions; re-verify no billing/license imports in F3.2. | `apps/web/src/app/actions/*.ts` |
| `app/invite/` | KEEP | Workspace invite flow, core multi-tenant feature. | — |
| `app/login/*` | KEEP | Auth flows (password, Google, forgot/reset/verify/activate). | `apps/web/src/app/login/**` |
| `components/` | REWRITE | 27 files; STRIP `client-swap-panel.tsx` and `backoffice-*.tsx` (7 files: action-form, clients-navigation, health-filters, home, navigation, operations-navigation + client-swap-panel). Rest KEEP. | `apps/web/src/components/*.tsx` |
| `lib/` | KEEP | API client, workspace context, date-time, money-input helpers. Verify `api.ts`/`server-api.ts` have no hardcoded PalmUP URLs beyond the documented `rewrite_rules.cookie-and-url-domains`. | `apps/web/src/lib/*.ts` |
| `styles/` | REWRITE | Branding tokens/colors reference WppTrack; rebrand to RastrackDash. | `apps/web/src/styles/*.css` |

## `packages/*`

| Package | Verdict | Reason | Evidence |
|---|---|---|---|
| `packages/shared/` | REWRITE | Export surface (Zod schemas + shared types) consumed by both apps. No license schema present (licensing is self-contained in `apps/api/src/licensing/`, good sign). `schemas/billing.ts` and `schemas/platform-administration.ts` need trimming once `billing/` and staff tooling are resolved (F3.2). | `packages/shared/src/schemas/*.ts` (16 schema files, no license schema found) |

## Root-level

| Path | Verdict | Reason |
|---|---|---|
| `Projeto.md` | STRIP | Internal PalmUP planning doc, business-sensitive (154KB). |
| `artifacts/` | STRIP | Internal QA/visual-refactor screenshots, not product code. |
| `visualizacao-wpptrack.html`, `wpptrack-saas-visual.html` | STRIP | Internal sales/mockup HTML, not app code. |
| `design-system/` | DEFER(F4+) | Branded PDF + design philosophy doc + PNG exports; needs its own review for rebrand scope and asset licensing before public distribution. |
| `wpptrack-design-system/` | DEFER(F4+) | Larger component/token/UI-kit bundle with its own SKILL.md; same rebrand + licensing concerns as above, plus it's a sizeable review surface on its own. |
| `docker-compose.yml` | KEEP | Generic Postgres 16 + Redis 7, no secrets, no PalmUP-specific config. |
| `Dockerfile` | KEEP | Build steps only; re-verify no baked-in secrets in F3.2. |
| `turbo.json`, `pnpm-workspace.yaml`, `package.json` | KEEP | Generic monorepo tooling config. |
| `.env.example` | REWRITE | See `env_strip` / `env_allow` in the yml — license/Asaas/admin-token vars removed, domain defaults genericized. |
| `README.md` | REWRITE | Private-repo README; public template gets its own README authored in F3.2/F4 (not this file — that one already exists at `scripts/rastrackdash/README.md`). |

## Counts

Verified by running `node scripts/rastrackdash/sanitize-export.mjs` (which loads and
counts every section of the yml — see that script's output for the authoritative
numbers; the values below match it as of this writing):

- API modules inventoried: **22 / 22** top-level dirs under `apps/api/src` (full coverage)
- API modules — verdict split: KEEP 10 · REWRITE 6 · DEFER(F4+) 4 · STRIP 2
- `remove_paths` entries in yml: **25**
- `remove_path_patterns` entries in yml: **12**
- `keep_paths` entries in yml: **32**
- `defer_review` entries in yml: **20**
- `rewrite_rules` entries in yml: **7**
- `secret_fail_patterns` entries in yml: **18**
- `env_strip` entries in yml: **34**
- `env_allow` entries in yml: **59**
- Prisma models total in schema: **79**
- Prisma models flagged `prisma_models_remove.remove`: **19**
- Prisma models flagged `defer_review` (seat concept): **2** (`WhatsappSeat`, `WhatsappInstanceActivation`)
- `app_module_imports_remove`: **2** confident (`LicensingModule`, `XmaxModule`) + **1** defer (`BillingModule`)

## Open questions (carried into F3.2 planning)

1. **`billing/` split** — how much of `whatsapp-seat.service.ts` / `billing-seat.module.ts` can be extracted as a standalone "capacity tracking" concept independent of Asaas/subscriptions?
2. **`meta/oauth/advanced/*` endpoints** — confirm whether these are reachable only via the `legacy_oauth` broker path (strip) or also serve `manual` connections (keep). `meta-connection-resolver.service.ts` tags both sources, so this needs a call-graph read in F3.2, not a guess.
3. **Backoffice inbound-webhook tooling** — is platform-wide (PalmUP staff) recovery/replay UI rewritten to be workspace-scoped for the self-host owner, or dropped entirely? Affects `inbound-webhooks/`, `inbound-webhook-replay/`, and 3 web `(backoffice)` subpaths.
4. **`app/(app)/subscription/`** — full strip or a BYO-billing placeholder page?
5. **`design-system/` and `wpptrack-design-system/`** — asset licensing and rebrand scope unresolved; may need a dedicated F3.x slice given their size (component library + token system + PDF).
6. **Platform-admin/owner bootstrap** — exact shape of the single self-host "owner" bootstrap flow (`create-platform-admin.ts`, `promote-platform-owner.ts`, `WPPTRACK_PLATFORM_ADMIN_EMAILS`) needs a design decision, not just a rename.
7. **`webhooks/` vs `inbound-webhooks/` overlap** — confirm `apps/api/src/webhooks/uazapi-webhook-parser.ts` isn't dead code superseded by the newer inbound-webhooks registry.

## Suggested F3.2 next step

Implement `sanitize-export.mjs` to actually copy `keep_paths`, delete `remove_paths`
(+ `remove_path_patterns`), apply the `rewrite_rules` as codemods/string replacements,
strip the listed Prisma models and `app.module.ts` imports, generate the trimmed
`.env.example` from `env_allow`, and run the `secret_fail_patterns` scan as a hard
gate over the export output before any write to `nod-rastrackdash-wpp`. Resolve the
`defer_review` list (open questions above) before F3.2 touches those paths — F3.2
should refuse to auto-decide on `defer_review` entries and instead fail loudly if one
falls inside `keep_paths` without an explicit resolution.
