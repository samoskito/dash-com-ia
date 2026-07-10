# WppTrack Product Recovery - Page-by-Page Execution Plan

**Date:** 2026-07-10
**Status:** Approved by the product owner
**Execution rule:** Follow the blocks in this document in order. Do not skip a block or start the next page before the current block has passed its acceptance criteria and product review.

## 1. Goal

Recover product quality after the reporting metrics engine reached the backend but the user experience did not receive the approved redesign.

The work must solve two problems together:

1. Navigation and data loading are too slow for a SaaS product.
2. Overview and Reports do not present the approved metrics with enough hierarchy, readability or visual quality.

The backend metrics engine, CAPI implementation and persisted Meta data remain valid foundations. This plan does not roll them back. It reorganizes delivery so the user can validate one complete page at a time.

## 2. Canonical References

- Product memory and confirmed decisions: `Projeto.md`.
- Reporting formulas: `docs/superpowers/specs/2026-07-10-wpptrack-reporting-metrics-formulas-design.md`.
- CAPI rules: `docs/superpowers/specs/2026-07-09-wpptrack-capi-conversion-events-design.md`.
- WppTrack design system: `wpptrack-design-system/` and `design-system/`.
- Renato visual reference: `renatodomiciano/rastrack-dash`, reviewed at commit `790aba7`.
- R100 WPP behavior reference: `C:/Users/samue/Documents/r100-wpp`, limited to dashboard, tracking and Meta conversion behavior.

Use the references as follows:

- Renato: compact visual hierarchy, persistent topbar, filtered overview, charts, recent leads and readable operational density.
- R100 WPP: Meta versus real conversations, paid versus organic health, configurable events, BM/account filters and dynamic funnel behavior.
- WppTrack: product rules, formulas, multi-account Meta model, Uazapi, CAPI audit and visual identity.

## 3. Guardrails

- Do not add agency/client management to the customer product.
- Do not bring chat, CRM, Kanban or attendance workflows from R100 WPP.
- Do not reintroduce manual Meta/CAPI token input for the customer.
- Do not list every campaign in Overview. Campaign detail belongs in Reports.
- Do not show organic metrics in campaign, ad set or ad rows. Organic belongs to aggregate business-health views.
- Do not map API failure to lack of permission.
- Do not display zero as if it were confirmed data when the source is unavailable or not connected.
- Keep the Meta synchronization diagnostic collapsed and secondary. It is a support tool, not the main report.
- Use the WppTrack design tokens and a quiet, dense B2B SaaS composition.
- Verify desktop and mobile layouts before each block is considered complete.

## 4. Confirmed Diagnosis

The recovery starts from these verified defects:

1. The default report label says `Ultimos 7 dias`, but the API does not pass `since` and `until`, causing all historical leads and events to be loaded.
2. Reports performs separate requests for campaigns, ad sets, ads, Meta structure, workspace, comparison and assets.
3. Campaign, ad set and ad endpoints repeatedly load the same leads, conversion events and funnel rules.
4. Every server fetch uses `cache: no-store`, and route rendering waits for data before showing useful content.
5. The product layout fetches the current workspace again on every navigation.
6. Reports renders sixteen columns in each table, including aggregate organic fields, making entity names unreadable.
7. Integration workspace-loading failures are rendered as `sem permissao`, hiding the Meta OAuth action even for authorized users.
8. Overview received metric substitutions but not the approved visual redesign. Its campaign-chip dump and simple cards are not an acceptable funnel.

## 5. Locked Execution Order

| Order | Block | Status | Exit condition |
| --- | --- | --- | --- |
| 0 | Performance and critical regressions | Next | Navigation and critical actions meet the acceptance criteria below |
| 1 | Overview | Pending | Product owner approves the complete Overview |
| 2 | Leads | Pending | Product owner approves list, filters and lead journey |
| 3 | Reports | Pending | Product owner approves Campaigns, Ad Sets, Ads and Meta diagnostic |
| 4 | Integrations, Settings and Meta Event Audit | Pending | Product owner approves operational setup and audit workflows |

This order supersedes the older immediate next step of returning to the real Uazapi/CAPI payload test after the reporting engine. The real Uazapi/CAPI test remains recorded and mandatory, but stays deferred until the platform is sufficiently complete for end-to-end validation.

## 6. Block 0 - Performance and Critical Regressions

### Scope

1. Correct the default period so `Ultimos 7 dias` always sends real dates to database queries.
2. Add or review indexes for report period and workspace filters, especially lead occurrence dates.
3. Replace duplicated Reports requests with an aggregated read model or shared backend query context.
4. Add server-side pagination for campaigns, ad sets, ads and leads.
5. Stop loading all report levels when only one level is visible.
6. Keep the application shell visible immediately and load page content with route skeletons or section-level Suspense.
7. Avoid repeated workspace/session reads across layout and page data.
8. Introduce safe caching/deduplication for read-only snapshots while preserving explicit refresh actions.
9. Add request-duration diagnostics for web-to-API and important database operations.
10. Fix the Meta action state so API failure, loading, disconnected and denied are distinct states.
11. Restore the Meta connect/reconnect button for authorized users.

### Acceptance criteria

- A navigation click gives visible feedback immediately; the shell never appears frozen.
- Normal critical page content should load in up to about two seconds under the current production infrastructure.
- No route should wait close to one minute without a loading state or diagnostic.
- Reports must not query all historical events when the interface says seven days.
- Opening Reports must not load Campaigns, Ad Sets and Ads in full at the same time.
- API errors must never be presented as permission errors.
- The Meta connect/reconnect action is visible whenever the role allows integration management.
- Automated tests cover period defaults, permission/error state and aggregated report loading.
- Production diagnostics make a future slow endpoint identifiable without guessing whether the VPS is at fault.

## 7. Block 1 - Overview

### Information architecture

The page uses one global filter context: period, configured BM and configured ad account. A manual refresh action remains available without blocking automatic synchronization.

Metrics are organized by category instead of one undifferentiated card wall:

1. **Traffic:** investment, Meta conversations when returned by Meta, and cost per Meta conversation.
2. **Conversations:** real conversations, organic leads, total received, tracking rate and cost per real conversation.
3. **Funnel:** real conversations, qualified leads when configured, purchases when configured, first purchases and repurchases where relevant.
4. **Revenue:** paid revenue, organic revenue, total revenue, acquisition ROAS and ROAS with repurchase.

### Required visual blocks

- Compact KPI groups with restrained typography and icons.
- A real dynamic funnel with stage counts and conversion rates between stages.
- A time-series chart comparing the available Meta, real and organic signals without inventing unavailable Meta data.
- A clear paid/organic/total business-health section.
- A compact Meta event-delivery health summary with a link to audit.
- Recent leads, limited to a short list with a `Ver todos` action.
- Empty states that explain `Aguardando dados do WhatsApp` separately from a confirmed value of zero.

### Remove from Overview

- The full list of campaign names.
- Campaign-level operational controls.
- Raw technical scopes, IDs and diagnostic payloads.
- Duplicate `LeadSubmitted` metric; it is represented as real conversations.

### Acceptance criteria

- Overview communicates the account health in one viewport plus a controlled continuation below.
- The funnel is visually recognizable and follows only configured/used events.
- Campaign names do not create vertical noise.
- Typography, spacing and color hierarchy match the WppTrack design system.
- Paid and organic revenue are visible without contaminating media cost or ROAS.
- The product owner approves desktop and mobile screenshots before Block 2 starts.

## 8. Block 2 - Leads

### Scope

- Search by name or phone using `contains` behavior.
- Filters for period, paid/organic source, tracked state, status, campaign, ad set, ad and conversion event.
- Server-side pagination with selectable page size.
- Readable table with lead identity, source, campaign hierarchy, current event/status and received date.
- Lead detail with tracking journey, CTWA/UTM context and Meta event history.
- Manual refresh action with feedback.

### Explicit exclusions

- No chat interface.
- No CRM pipeline or Kanban.
- No attendance assignment workflow.

### Acceptance criteria

- The list remains usable with large lead volumes.
- Filters preserve URL state and can be shared/reopened.
- Lead detail explains attribution and event delivery without exposing secrets.
- Empty, loading, error and no-results states are different.

## 9. Block 3 - Reports

### Structure

- One segmented view or tab set: `Campanhas`, `Conjuntos` and `Anuncios`.
- Only the active level is loaded and rendered.
- Server-side pagination, defaulting to a compact page size.
- Sticky header, sticky readable name column and sticky summary row where appropriate.
- Filters for period, configured BM/account, name scope, name contains, Meta status and WhatsApp classification.
- Comparison mode remains optional and must not dominate the default view.

### Metric organization

Use controlled metric groups rather than forcing every field into the default table:

- Traffic.
- Conversations.
- Funnel.
- Revenue/ROAS.

The default view should prioritize the essential paid-performance columns. Additional groups may be selected without shrinking the entity name into unreadable text.

Aggregate organic health may appear above the tables, but organic fields must not appear in campaign, ad set or ad rows.

### Keep

- Manual Meta sync with progress and completion feedback.
- WhatsApp automatic/manual campaign classification.
- Summary totals calculated from totals, not averages.
- CSV export and planned PDF export.
- Collapsed `Diagnostico da sincronizacao Meta` with its own filters and internal scroll.

### Acceptance criteria

- Campaign, ad set and ad names are readable without one-character wrapping.
- The page does not stack three enormous tables vertically.
- No page-level horizontal overflow exists.
- Summary values follow the approved formulas.
- The Meta diagnostic remains secondary and visually stable.

## 10. Block 4 - Integrations, Settings and Meta Event Audit

Execute Block 4 in this internal order:

### 4A. Integrations

- Separate Meta and WhatsApp into independent operational sections.
- Meta OAuth connect/reconnect action always reflects the real connection and permission state.
- Meta asset refresh is explicit and does not block normal page opening.
- WhatsApp instances show payment, provisioning, connection and webhook state.
- Each section loads independently so a slow provider cannot freeze the entire page.

### 4B. Settings

- Workspace/profile and team management.
- Products/services and values used by conversion events.
- Keyword and WhatsApp-label event rules.
- Event-to-Meta mapping with human labels.
- Ordered funnel journey based on configured events.
- No customer-facing manual Meta token field.

### 4C. Meta Event Audit

- Dedicated customer-facing audit using `GET /reports/conversions/audit`.
- Filters by period, event, status and source.
- Clear success, queued, blocked and failed states.
- Show safe error summaries, occurrence time, send time and related lead/campaign context.
- Never expose OAuth tokens, webhook secrets or raw sensitive payloads.

### Acceptance criteria

- Provider or API failure does not remove valid actions.
- Saving and refreshing always give immediate feedback.
- Event configuration controls which dynamic funnel stages appear.
- Audit allows a non-technical operator to understand what worked and what failed.

## 11. Delivery Protocol Per Block

For every block:

1. Confirm the detailed page design before broad implementation.
2. Add or update focused automated tests.
3. Implement the backend/read model needed by that page.
4. Implement the page using shared components and design tokens.
5. Verify loading, empty, error, permission and populated states.
6. Capture desktop and mobile screenshots and inspect overflow/typography.
7. Run typechecks and the relevant test suites.
8. Update this plan and `Projeto.md` with real status.
9. Present the block for product-owner review.
10. Commit and deploy only the reviewed block before advancing.

## 12. Current Next Action

Start **Block 0 - Performance and Critical Regressions**. Do not begin the Overview redesign until Block 0 is verified and its regressions are closed.
