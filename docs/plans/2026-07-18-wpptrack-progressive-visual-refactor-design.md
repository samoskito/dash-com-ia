# WppTrack progressive visual refactor

Wave 1 implemented on 2026-07-18 after recording the production layout at
`layout-baseline-2026-07-18`.

## Product direction

WppTrack remains a quiet operational product. The refactor improves hierarchy,
scan speed, and navigation without changing business rules, integrations,
authorization, webhook processing, or data contracts.

The visual direction is an editorial operations console:

- dense enough for repeated daily work;
- clear section rhythm instead of decorative floating sections;
- restrained graphite surfaces with semantic color reserved for status and
  conversion stages;
- stable desktop and mobile layouts;
- progressive changes that can be compared with the recorded baseline.

## Application shell

The client navigation is now organized into two explicit groups:

- **Operacao:** Visao geral, Leads, Relatorios, and Eventos Meta.
- **Gestao:** Integracoes and Configuracoes.

Every route uses a Lucide icon and a visible active state. The active state also
uses `aria-current="page"`, so the current location is exposed to assistive
technology. In collapsed mode, the icons remain visible and the text is hidden
without changing the sidebar width.

The Backoffice remains a separate platform-owner destination.

## Content widths

The global `1180px` ceiling was replaced by route-oriented width modes:

- `page-narrow`: focused forms and authentication surfaces, up to `900px`;
- `page-standard`: settings and integration workflows, up to `1280px`;
- `page-wide`: dashboards, reports, leads, and event audit, up to `1520px`.

These modes preserve readable line length while allowing operational tables and
charts to use the available viewport.

## Overview hierarchy

The Overview now follows the user's decision path:

1. Page context and period controls.
2. Five primary metric cards, starting with investment.
3. Integrated conversion funnel with conversion and unit cost per stage.
4. Daily comparison between Meta and real WhatsApp conversations.

The funnel appears immediately after the primary metrics. This puts the
complete conversion journey in the first analytical viewport.

The workspace summary and tracking-quality visualization were removed after the
product scope became paid-traffic only. Their useful financial values now live
in the primary metrics and funnel, without repeating the same result lower on
the page.

## Responsive behavior

- Desktop keeps the expanded sidebar and the full horizontal funnel.
- Collapsed desktop keeps stable icon navigation at `76px`.
- Wide desktop shows all five primary metrics in one row.
- Medium widths use balanced metric rows before changing to the mobile stack.
- Mobile uses the existing drawer, a vertical funnel, stacked metric cards, and
  full-width controls.
- Fixed chart and funnel regions use stable dimensions so loading, hover, and
  dynamic values do not shift neighboring content.

## Visual evidence

Local screenshots generated from the refactored route:

- `artifacts/visual-refactor-2026-07-18/overview-desktop.png`
- `artifacts/visual-refactor-2026-07-18/overview-desktop-collapsed.png`
- `artifacts/visual-refactor-2026-07-18/overview-mobile.png`
- `artifacts/visual-refactor-2026-07-18/overview-mobile-menu.png`

The visual audit confirmed:

- no horizontal page overflow at `1440x1000` or `390x844`;
- no section overlap;
- no text overflow on mobile;
- correct Overview section order;
- visible active navigation in expanded, collapsed, and mobile states.

## Verification

```bash
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Wave 1 result:

- 36 test files passed;
- 207 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps.

## Rollback

The original working application remains available at:

```bash
git show layout-baseline-2026-07-18
```

Full and selective recovery instructions are documented in
`docs/plans/2026-07-18-wpptrack-layout-baseline.md`.

Do not use a destructive reset for a visual rollback. Compare or restore only
the frontend files so later operational and integration work remains intact.

## Wave 2 status

The Leads list and lead detail refactor is complete and documented in
`docs/plans/2026-07-18-wpptrack-leads-visual-refactor-design.md`.

Wave 2 preserves the desktop comparison tables and introduces dedicated mobile
cards for leads, Pixel/CAPI events, and webhook diagnostics. Search and primary
filters are now separated from advanced filters, and operational labels are
human-readable while technical identifiers remain available for audit.

Verification after Wave 2:

- 36 test files passed;
- 208 tests passed;
- TypeScript validation passed;
- Next.js production build passed.

## Wave 3 status

The Reports refactor is complete and documented in
`docs/plans/2026-07-18-wpptrack-reports-visual-refactor-design.md`.

Wave 3 separates period commands from page identity, groups filters by
frequency, introduces controlled metric families, removes organic metrics from
Meta entity rows, and replaces clipped mobile tables with labeled metric cards.

Verification after Wave 3:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed.

## Wave 4 status

The Meta Events refactor is complete and documented in
`docs/plans/2026-07-18-wpptrack-events-visual-refactor-design.md`.

Wave 4 separates period selection from optional event filters, gives delivery
health priority over passive classifications, fits the desktop audit into five
structured columns, and replaces the clipped mobile table with complete event
cards. Inspection and authorized retry behavior are unchanged.

Verification after Wave 4:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps;
- desktop and mobile visual audit passed without page-level overflow.

## Wave 5 status

The Integrations refactor is complete and documented in
`docs/plans/2026-07-18-wpptrack-integrations-visual-refactor-design.md`.

Wave 5 groups the route into Meta Ads, WhatsApp sources, and signal flow. Saved
technical structures remain available through progressive disclosure so the
page opens as an operational overview instead of a continuous configuration
stack.

Verification after Wave 5:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps;
- desktop and mobile visual audit passed without page-level overflow;
- expanded Meta and Umbler controls remained inside the mobile viewport.

## Wave 6 status

The Settings refactor is complete and documented in
`docs/plans/2026-07-18-wpptrack-settings-visual-refactor-design.md`.

Wave 6 turns the continuous settings stack into Account, Team, and Conversions
domains. Identity and member workflows stay visible, while funnel and WhatsApp
trigger configuration use independent progressive disclosure with operational
counts in their summaries.

Verification after Wave 6:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps;
- desktop height reduced from `2820px` to `2305px`;
- mobile height reduced from `5956px` to `3991px`;
- initial and expanded desktop/mobile states passed without page-level
  overflow.

## Wave 7 status

The Overview business-health refinement is complete and documented in
`docs/plans/2026-07-18-wpptrack-overview-business-health-adjustment-design.md`.

Wave 7 adds investment as the fifth primary metric, exposes contextual cost per
funnel stage, removes the redundant workspace summary and tracking-quality
blocks, and replaces the native sidebar scrollbar with a thin themed control.

Verification after Wave 7:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps;
- desktop, medium-width and mobile visual audits passed without page-level
  overflow;
- the sidebar scrollbar uses a transparent track and a `7px` mint thumb.

## Wave 8 status

The Backoffice refactor is complete and documented in
`docs/plans/2026-07-18-wpptrack-backoffice-visual-refactor-design.md`.

Wave 8 separates client administration into Workspaces, Internal Team, and
MySQL Connector domains. It also compresses platform operations into
task-specific areas, keeps filters next to the dataset they control, and adds
dedicated mobile workspace cards without changing authorization or operational
contracts.

Verification after Wave 8:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps;
- desktop and mobile visual audits passed without page-level overflow;
- the Backoffice home, client administration, inbound webhook observation, and
  internal operations remain independently navigable on mobile.
