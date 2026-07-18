# WppTrack Reports visual refactor

Wave 3 of the progressive visual refactor was implemented on 2026-07-18. It
improves Reports without changing APIs, report calculations, authorization,
Meta synchronization, attribution rules, or data contracts.

## Baseline findings

The previous page placed the period form, export, synchronization, status tags,
and page title in the same two-column header. On desktop, the action area
compressed the title until it wrapped almost one character per line.

The report table also attempted to expose every metric family at once. On
mobile, the page avoided global overflow by clipping the table, but users could
see entity names without the metrics required to evaluate performance.

The baseline was captured locally before implementation. Screenshots remain
outside version control because report views can contain client campaign data;
the recoverable code baseline is preserved by the
`layout-baseline-2026-07-18` Git tag.

## Operational hierarchy

Reports now follows a progressive analysis sequence:

1. Page title and report level.
2. Dedicated period and command surface.
3. Campaign, ad set, or ad selection.
4. Primary filters with advanced controls available on demand.
5. Filtered summary and metric-family selector.
6. Performance results.
7. Pagination and optional Meta synchronization diagnostics.

The command surface separates the period from export and Meta synchronization,
so operational actions no longer compete with the page identity.

Primary filters contain Business Manager, ad account, and entity search.
Status, WhatsApp classification, comparison period, name scope, and page size
remain grouped under advanced filters. Comparison inputs are now visible when
the operator needs them instead of existing only as hidden fields.

## Compact controls refinement

The follow-up refinement consolidates the period commands and report filters
into one low-emphasis control center. On wide desktops, the surface uses two
compact rows:

1. period, export, Meta synchronization, and synchronization context;
2. report level, result count, Business Manager, ad account, name search, and
   the filter command.

The duplicate "Estrutura e filtros" heading was removed. Advanced filters now
use a small disclosure control at the end of the primary filter row and only
consume vertical space when opened. At narrower desktop widths the two rows
wrap deliberately before controls become compressed; mobile keeps full-width
inputs and touch targets.

This hierarchy keeps the report summary and the beginning of the performance
table in the first desktop viewport under normal conditions. Filters remain
easy to find, but the table is the visual destination of the page.

Follow-up verification:

- 36 web test files passed;
- 212 tests passed, including the compact control layout contract;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps.

The automated browser surface was unavailable during this follow-up, so the
final visual confirmation is performed against the deployed Vercel preview.

## Metric groups

The result table uses four controlled metric groups:

- **Visao geral:** investment, Meta conversations, core funnel, traffic
  revenue, and acquisition ROAS.
- **Trafego:** investment, Meta and real conversations, total received, and
  tracking coverage.
- **Funil:** real conversations and conversion stages.
- **Receita:** investment, acquisition and repurchase revenue, total revenue,
  and ROAS.

Organic metrics are intentionally absent from campaign, ad set, and ad rows.
They remain workspace-level concepts and are not presented as if Meta entities
owned that traffic.

The selected group is a UI-only query parameter. API requests, CSV contracts,
and report calculations remain unchanged.

## Responsive behavior

Desktop keeps a compact comparison table with stable entity and review columns.
Each metric group has an explicit minimum table width, and horizontal scrolling
is constrained to the table container.

At mobile widths, table headers are removed and every row becomes a readable
two-column metric card. Each cell carries its own visible label, while entity
identity and WhatsApp review span the full card width. All selected metrics
remain available without horizontal scrolling.

## Visual evidence

Desktop and mobile Playwright captures were reviewed locally and intentionally
not versioned to avoid publishing campaign or workspace-identifying data.

The visual audit covered all three report levels and all four metric groups at
`1440x1000` and `390x844`. No route produced page-level horizontal overflow,
empty mobile labels, overlapping controls, or an application error.

## Verification

```bash
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Wave 3 result:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps.

## Rollback

The original production layout remains recorded at
`layout-baseline-2026-07-18`. Wave 1 is recorded in commit
`63b4822d2ca58e3d804ebbb9474b0ea8da4a4668`.

For a selective rollback, compare the Reports route, its client filter
component, its route tests, and the Wave 3 rules in
`apps/web/src/styles/layout-system.css`. Do not reset the repository or restore
unrelated operational files.
