# Spike: auto-apply filters across client surfaces

Date: 2026-10-01
Branch: feat/reports-autoapply-filters (base 4cb15c3) (historical: spike branch)
Kanban: t_0767c043

## Status (updated 2026-10-01)

| Phase | Scope | State |
| --- | --- | --- |
| B | Auto-apply filters: Relatorios #121 `98bf9fc`, Leads #122 `4f42dd0`, Eventos #123 `8b99506`, Revisao de compras #124 `9db0858` | **Accepted and merged** |
| C API | UAZAPI instance activity + scoped leads filter #125 `75125d6` | **Merged** |
| C web | UAZAPI activity on Integracoes + `whatsappInstanceId` scope on Leads, branch `feat/uazapi-instance-activity-web` (base `75125d6`) | **Local only, gates green, not committed/pushed** |
| C deploy | Production API deploy of #125 and web smoke | **Pending** |
| D | Invites | **Pending** |

### C web (local, uncommitted)

- `integrations/whatsapp-instance-activity.tsx`: validates the
  `GET /integrations/whatsapp/instances/:id/activity` payload with the shared
  `whatsappInstanceActivitySchema`. Failure, timeout or malformed payload is
  `unavailable` ("Atividade indisponivel"), never zero. Null `lastLeadAt` /
  `lastWebhookAt` render "Nenhum lead registrado" / "Nenhum webhook
  registrado". Webhook recency is separate from the provider connection
  status: "Sem webhook recente ha mais de 24h" only when strictly older than
  24h from the server read time. "Ver leads desta instancia" links to
  `/leads?whatsappInstanceId=...` with no period.
- `integrations/page.tsx`: one activity read per distinct UAZAPI instance
  (not `pending_payment`, not `cloud_api`), in parallel with the status reads
  and under the same timeout. Instances only known from a UAZAPI inbound
  bridge are read once after the inbound data; nothing is read twice. New
  "Atividade" column in the instance table.
- `integrations/inbound-webhook-panel.tsx`: UAZAPI connections keep the real
  `eligibleRouted`; the four unmeasured counters show "Nao medido" with a
  note, and the bridged instance shows its activity and leads link. Other
  providers are unchanged.
- Leads: `whatsappInstanceId` is threaded through the URL read, the API
  query, the canonical `leadFiltersHref`, the scope keys, the hidden GET
  field and pagination. Limpar drops the editable filters (busca, situacao,
  etapa, origem, etiqueta, periodo) and keeps the scope (instance and report
  drill-down) and the page size; it is hidden when it would change nothing.
  A masked "Instancia WhatsApp" recorte says the list follows each lead's
  current instance, not message history, with "Ver todas as instancias" as
  the way out. The report drill-down banner gains "Remover recorte do
  relatorio", since Limpar now keeps that scope.
- Review finding P1 (RSC boundary), fixed: the Leads server page imported and
  called `leadFiltersHref` / `leadFiltersClearHref` / `hasEditableLeadFilter`
  from `lead-filters.tsx` (`"use client"`). In the RSC build those exports are
  client references and cannot be called on the server. The pure URL/state
  helpers, `LeadFilterValues`, keys, default page size and scope keys moved to
  `leads/lead-filter-params.ts` (no `"use client"`, no imports). The server
  page and the client component both import from there; the page takes only
  the `LeadFilters` component from the client module. `leadDateRangeStatus` /
  `committableLeadFilters` stay in the client module (client-only users, and
  they depend on the client `overview-filters`). Regression
  `tests/server-client-boundary.test.ts`: the helper module is not a client
  module and has no imports; `leads/page.tsx` and `integrations/page.tsx`
  take only components (PascalCase) from relative `"use client"` modules.
  Mutation check: importing `leadDateRangeStatus` from `./lead-filters` into
  the page makes it fail.
- Gates (local, after the fix): web suite 77 files / 788 tests green; `tsc`
  only the 4 known TS2353 in `tests/billing-trial-eligibility.test.ts` (file
  untouched); `next build` green.
- Real RSC render check (local only): `next start` of that build on
  127.0.0.1:3999 against a disposable mock API on 127.0.0.1:3333 (fake
  fixtures, fake session cookie, no production, no secrets). `/leads`,
  `/leads?whatsappInstanceId=...` and
  `/leads?whatsappInstanceId=...&status=lost&page=2&pageSize=50` all returned
  200 with the list, instance recorte, hidden scope field, Limpar keeping
  scope + page size and scoped pagination; no server errors and no provider
  id in the HTML. The pre-fix crash was not reproduced at runtime (that would
  need a separate pre-fix build); `/integrations` was not rendered against
  the mock (its imports are covered by the boundary test). No browser
  available, so no visual/layout capture; interaction is covered by jsdom
  and server-render tests only.
- Not done: production deploy, production smoke, commit/PR (parent reviews
  first).

## Goal

Client filter bars should apply on change, like the Visao geral (overview), with
no "Aplicar" CTA. This spike lists what is left and sets the rollout order.
Only Relatorios ships in this branch.

## Reference: how the overview already auto-applies

`apps/web/src/app/(app)/overview/overview-filters.tsx`

- Selects (BM, conta, numero WhatsApp) push the URL right away with
  `router.push(href, { scroll: false })` inside `startTransition`.
- Campaigns use the shared `FilterCombobox`
  (`src/components/filter-combobox.tsx`). Multi-select commits 600 ms after
  the last toggle (`filterComboboxMultiCommitDelayMs`) and the list stays open.
- Dates are debounced 800 ms (`dateCommitDelayMs`) and flushed on blur.
  `dateRangeStatus()` returns `incomplete` / `order` / `valid`. Only `valid`
  ranges commit, so a half-typed year never navigates.
- "Fim antes do inicio" shows inline (`.overview-filter-error`,
  `aria-invalid`), and the applied period stays in place.
- Local fields re-sync from the URL only when no transition is pending, and
  only the keys the URL changed. A late navigation does not overwrite a newer
  edit.
- A visually hidden submit (`.sr-only`, `tabIndex=-1`) keeps Enter-submit and
  the no-JS GET working.
- Status: "Atualizando..." spinner plus a polite live region that says "Dados
  atualizados." when the update finishes.

## Inventory of remaining "Aplicar" on CLIENT surfaces (historical)

Snapshot from the spike. Every row below has since shipped (phase B).

| Surface | File | Control | Fields | Status |
| --- | --- | --- | --- | --- |
| Relatorios | `app/(app)/reports/meta-report-filters.tsx` | "Aplicar filtros" | BM, conta, numero, nome, escopo do nome, status, veiculacao, classificacao WhatsApp, comparacao, itens por pagina | Shipped #121 `98bf9fc` |
| Relatorios | `app/(app)/reports/page.tsx` | "Aplicar periodo" (separate form) | Inicio, Fim | Shipped #121 `98bf9fc` |
| Leads | `app/(app)/leads/page.tsx` (~L333) | "Aplicar" | busca, status, evento | Shipped #122 `4f42dd0` |
| Eventos | `app/(app)/events/page.tsx` (~L495) | "Aplicar" | since, until, pageSize (hidden) | Shipped #123 `8b99506` |
| Revisao de compras | `app/(app)/events/purchase-reviews/page.tsx` (~L195) | "Aplicar" | since, until, view, status, providerRuleId | Shipped #124 `9db0858` |

## Explicitly OUT OF SCOPE

These are operator tools or bulk actions, not client filter bars:

- Backoffice inbound webhooks: `backoffice/inbound-webhooks/page.tsx`
  ("Aplicar modo", "Aplicar filtros", "Aplicar") and
  `inbound-webhooks/conversions/page.tsx` ("Aplicar").
- Billing: `backoffice/billing/page.tsx` "Aplicar nos selecionados" (a bulk
  mutation, not a filter) and the "Aplicar" column header.
- Health filters: `components/backoffice-health-filters.tsx` "Aplicar
  filtros".

## Recommended rollout (historical, completed in phase B)

1. **Relatorios.** #121.
2. **Leads.** The search field needs the debounce and Enter path. Selects
   apply immediately. #122.
3. **Eventos.** Only a date range plus a hidden pageSize. Reuse the date
   rule as is. #123.
4. **Revisao de compras.** Dates plus three selects. Same pattern. #124.

For each surface: one client component that owns the fields, a canonical
`*FiltersHref` builder that drops `page` on every change, no visible submit,
a hidden `.sr-only` submitter, and tests for the immediate select, the date
debounce/blur, the blocked inverted range, and no "Aplicar" in the markup.

Candidate shared extraction once a second surface adopts it: a generic
`useUrlFilters` hook from `reports/report-filter-state.tsx`, parameterised by
key list, href builder and range pairs. It stays per-page for now so the
rollout does not touch the overview.

## Date-range rule (all surfaces)

- Debounce typing 800 ms and flush on blur. Enter submits immediately.
- Commit only `valid` ranges. `incomplete` (partial year, one side empty for a
  required range) and `order` keep the last applied range. Other filters
  edited at the same time still apply.
- `order` shows "Fim antes do inicio" inline on the end field with
  `aria-invalid` and `aria-describedby`.
- Optional ranges (Relatorios comparison) treat both-empty as valid, so the
  comparison can be cleared.

## WhatsApp instance honesty banner

Keep the "Escopo do numero WhatsApp" banner on Relatorios (and on any surface
that adds the number filter). Leads and conversations are filtered by number.
Meta spend, impressions and other Meta metrics stay at campaign or account
scope, unless the API confirms the campaign is exclusive to that number. Auto-apply changes only how
the filter is applied, not that disclosure.

## What shipped for Relatorios

- `report-filter-state.tsx`: one `ReportFiltersProvider` shared by the
  Periodo and Escopo forms. A date still being typed and a select changed
  meanwhile land in the same URL. Provides `update` (immediate),
  `edit` (800 ms debounce), `flush` (blur), `submit` (Enter / no-JS),
  `reportFiltersHref` (canonical order, defaults omitted, no `page`), and
  `committableReportFilters` (blocks incomplete or inverted period and
  comparison ranges).
- `report-period-filter.tsx`: Inicio/Fim with auto-apply. "Aplicar periodo"
  removed.
- `meta-report-filters.tsx`: every select applies immediately. Name search
  and comparison dates are debounced. "Aplicar filtros" removed. The
  advanced panel stays open while the user works in it. Presentation mode still masks
  BM, conta and numero, and their values travel as hidden inputs.
- `whatsappInstanceId`, drill-down (`campaignId`/`adSetId`/`adId`),
  `selectedIds`, `view`, `metrics` and `pageSize` are preserved on every
  change.

## Known limitations

- The `structureNameContains` / `structureStatus` params (structure panel)
  are not carried by the filter bar. They were not carried before either.
- An `adAccountId` in the URL that does not belong to the selected BM shows as
  "Todas as contas" but stays in the URL until the BM changes. Before, the
  first Aplicar dropped it.
- Sync Meta and CSV export still use their own server-side hidden inputs
  (unchanged).
