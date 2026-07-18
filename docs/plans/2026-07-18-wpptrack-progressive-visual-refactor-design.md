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
2. Primary metric cards.
3. Integrated conversion funnel.
4. Daily comparison between Meta and real WhatsApp conversations.
5. Workspace financial summary and tracking quality in one paired section.

The funnel is independent from the workspace summary and appears immediately
after the primary metrics. This puts the complete conversion journey in the
first analytical viewport.

The tracking quality visualization now shares the same section as the workspace
summary. On wide screens the two panels sit side by side; on smaller screens
they stack in reading order.

## Responsive behavior

- Desktop keeps the expanded sidebar and the full horizontal funnel.
- Collapsed desktop keeps stable icon navigation at `76px`.
- Tablet reduces the Overview summary to one column.
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
