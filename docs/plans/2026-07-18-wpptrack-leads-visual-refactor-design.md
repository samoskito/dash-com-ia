# WppTrack Leads visual refactor

Wave 2 of the progressive visual refactor was implemented on 2026-07-18. It
improves the Leads list and lead detail without changing APIs, authorization,
data contracts, attribution rules, or event processing.

## Baseline findings

The previous desktop table remained usable, but search, operational filters,
period controls, and result context competed at the same visual level.

On mobile, the Leads table and the event tables inside the lead detail kept a
desktop minimum width. The page itself did not overflow, but the user had to
scroll inside clipped tables to discover important fields and actions.

The baseline was captured locally before implementation. Screenshots remain
outside version control because lead views can contain customer-identifying
data; the recoverable code baseline is preserved by the
`layout-baseline-2026-07-18` Git tag.

## Leads list

The list now follows a clear operational sequence:

1. Page context and total workspace volume.
2. Primary search, status, and funnel-stage controls.
3. Advanced attribution, label, period, and page-size controls.
4. Applied period context and result count.
5. Leads in a comparison table on desktop or readable cards on mobile.
6. Pagination and distinct empty, no-result, loading, and error states.

Advanced controls remain collapsed until needed. Active advanced filters are
counted in the control label, and a dedicated clear action restores the full
workspace list.

The desktop table keeps comparison density while making the lead identity,
campaign/source, stage, dates, and detail action explicit. At mobile widths,
each lead becomes a stable card with the same information and a full-width
detail action. No horizontal table interaction is required.

## Lead detail

The detail route now prioritizes human-readable operational information:

- source, status, event name, trigger, and webhook origin use product labels;
- technical event names and identifiers remain available as secondary audit
  information;
- attribution, journey facts, Pixel/CAPI events, and webhook diagnostics have
  separate visual regions;
- the return action uses a familiar arrow icon and remains visible near the
  lead identity.

Desktop retains compact audit tables. Mobile replaces those tables with event
cards so status, dates, Pixel, source, and processing details remain legible
without horizontal scrolling.

## Visual evidence

Desktop and mobile Playwright captures were reviewed locally and intentionally
not versioned to avoid publishing lead or workspace-identifying data.

The visual audit confirmed:

- no page-level horizontal overflow at `1440x1000` or `390x844`;
- no visible text overflow on mobile;
- desktop tables and mobile card lists switch at the intended breakpoint;
- advanced list filters remain collapsed by default;
- lead, conversion, and webhook information remains available in both modes.

## Verification

```bash
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Wave 2 result:

- 36 test files passed;
- 208 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps.

## Rollback

The pre-refactor production layout is recorded at
`layout-baseline-2026-07-18`. Wave 1 is recorded in commit
`63b4822d2ca58e3d804ebbb9474b0ea8da4a4668`.

For a selective rollback, compare the two Leads routes, their tests, and the
Wave 2 rules in `apps/web/src/styles/layout-system.css`. Do not reset the
repository or restore unrelated operational files.
