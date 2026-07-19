# WppTrack report delivery and selection filters

**Status:** Approved for implementation on 2026-07-19.

## Goal

Add two report filters at campaign, ad set and ad level:

1. `Teve veiculacao`: show entities with at least one Meta impression inside
   the selected report period, regardless of their current configured status.
2. `Somente selecionados`: show only entities explicitly selected by the
   operator in the active report level.

Both filters must affect rows, totals, pagination and CSV export. Existing
workspace, account, name, status and WhatsApp filters remain intersected with
the new filters.

## Delivery semantics

Delivery is defined as `impressions > 0` in the selected local-date range.
Current entity status and lifetime/last-sync spend are not valid substitutes.

Campaign daily insights already exist. Add equivalent daily insight storage
for ad sets and ads and populate it during the existing Meta reporting sync.
The sync remains additive and keeps the aggregate snapshots used by current
reports.

When `delivery=had_delivery` is requested, each report endpoint resolves the
entity IDs that have positive daily impressions in the requested period and
applies that ID set before pagination and metric aggregation.

## Selection semantics

Selections are temporary and isolated by workspace and report level:

- campaign, ad set and ad selections never share IDs;
- selection survives report pagination and filter changes in the current
  browser session;
- selection is cleared when the browser session ends;
- selecting all affects the rows visible on the current page;
- `Somente selecionados` is disabled when no IDs are selected;
- when enabled, selected IDs are sent to the API and intersect with every
  other active filter;
- clearing the filter does not clear the stored selection;
- totals, pagination and CSV export use the selected scope.

The URL carries selected IDs only while the selected-only filter is active so
server-rendered reports, pagination and exports remain deterministic.

## Interface

Keep the existing compact report control hierarchy:

- add `Teve veiculacao` as a compact switch in advanced filters;
- add a selection checkbox as the first table column;
- add a page-level checkbox in the table header;
- show a compact selected-count control beside the report entity count;
- use `Somente selecionados` as a toggle command, not a large filter panel.

The controls use the existing dark operational design system and remain
keyboard accessible.

## Safety and verification

- Use a forward-only Prisma migration.
- Keep all queries scoped by `workspaceId`.
- Bound and deduplicate selected IDs before database access.
- Add parser/controller/service tests for every report level.
- Add sync tests for daily ad set and ad insight replacement.
- Add web tests for session isolation, selection filtering and query
  preservation.
- Run shared, API and web tests, typechecks, Prisma validation/generation and
  production builds.
