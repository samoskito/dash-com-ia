# Spike: auto-apply filters across client surfaces

Date: 2026-10-01
Branch: feat/reports-autoapply-filters (base 4cb15c3)
Kanban: t_0767c043

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

## Inventory of remaining "Aplicar" on CLIENT surfaces

| Surface | File | Control | Fields | Status |
| --- | --- | --- | --- | --- |
| Relatorios | `app/(app)/reports/meta-report-filters.tsx` | "Aplicar filtros" | BM, conta, numero, nome, escopo do nome, status, veiculacao, classificacao WhatsApp, comparacao, itens por pagina | **Done in this branch** |
| Relatorios | `app/(app)/reports/page.tsx` | "Aplicar periodo" (separate form) | Inicio, Fim | **Done in this branch** |
| Leads | `app/(app)/leads/page.tsx` (~L333) | "Aplicar" | busca, status, evento | Next |
| Eventos | `app/(app)/events/page.tsx` (~L495) | "Aplicar" | since, until, pageSize (hidden) | After Leads |
| Revisao de compras | `app/(app)/events/purchase-reviews/page.tsx` (~L195) | "Aplicar" | since, until, view, status, providerRuleId | Last |

## Explicitly OUT OF SCOPE

These are operator tools or bulk actions, not client filter bars:

- Backoffice inbound webhooks: `backoffice/inbound-webhooks/page.tsx`
  ("Aplicar modo", "Aplicar filtros", "Aplicar") and
  `inbound-webhooks/conversions/page.tsx` ("Aplicar").
- Billing: `backoffice/billing/page.tsx` "Aplicar nos selecionados" (a bulk
  mutation, not a filter) and the "Aplicar" column header.
- Health filters: `components/backoffice-health-filters.tsx` "Aplicar
  filtros".

## Recommended rollout

1. **Relatorios (now).** This branch.
2. **Leads.** The search field needs the debounce and Enter path. Selects
   apply immediately.
3. **Eventos.** Only a date range plus a hidden pageSize. Reuse the date
   rule as is.
4. **Revisao de compras.** Dates plus three selects. Same pattern.

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
