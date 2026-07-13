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

| Order | Block                                                  | Status                                                  | Exit condition                                                                                            |
| ----- | ------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 0     | Performance and critical regressions                   | Implemented locally; production review pending          | Navigation and critical actions meet the acceptance criteria below                                        |
| 0.5   | External MySQL/Kinbox data foundation                  | Implemented locally; deploy/shadow validation pending   | Standard event ledger, secure connector, historical backfill and shadow sync are validated with real data |
| 1     | Overview                                               | Pending                                                 | Product owner approves the complete Overview                                                              |
| 2     | Leads                                                  | Pending                                                 | Product owner approves list, filters and lead journey                                                     |
| 3     | Reports                                                | Pending                                                 | Product owner approves Campaigns, Ad Sets, Ads and Meta diagnostic                                        |
| 4     | Integrations, Settings and Meta Event Audit            | 4A/4C implemented; 4B approved for deploy on 2026-07-12 | Product owner approves operational setup and audit workflows                                              |
| 5     | External connector productization and native providers | Planned after Block 4                                   | Product owner approves self-service connectors and the first native provider beyond Uazapi                |

This order supersedes the older immediate next step of returning to the real Uazapi/CAPI payload test after the reporting engine. The real Uazapi/CAPI test remains recorded and mandatory, but stays deferred until the platform is sufficiently complete for end-to-end validation.

The data foundation portion of the external connector was promoted to Block 0.5 after real MySQL, Meta and Kinbox evidence showed that Overview, Leads and Reports need real WhatsApp data for reliable validation. The customer-facing productization and native-provider expansion remain Block 5 after the page-recovery blocks.

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

### Implementation status - 2026-07-10

Implemented and verified locally:

- The API now resolves a real seven-day `since`/`until` period whenever report dates are omitted.
- Report reads apply the period to conversion events and lead occurrence dates instead of loading all history.
- Campaigns, ad sets, ads and leads expose paginated reads; Reports loads only the active level and loads the technical Meta structure only on demand.
- Metric events and leads are loaded only for the entity IDs on the active report page.
- Database indexes were added in migration `20260710113000_report_read_indexes` for lead periods, active reporting accounts and Meta hierarchy filters.
- The product shell has a route loading boundary and keeps navigation visible while page data resolves.
- The current workspace read is request-deduplicated across layout, Reports, Integrations and Settings.
- Slow API requests, slow web-to-API reads and slow report reads now emit duration diagnostics with configurable thresholds.
- Uazapi instance status and label reads have a bounded wait in the web layer so a provider cannot freeze the whole route.
- Meta API failure, unavailable permissions and an actual denied role are distinct states. A temporary workspace-read failure no longer removes the Meta connect/reconnect action; the backend remains the final authorization authority.
- Local warm-route measurements with PostgreSQL and Redis running: Overview 93 ms, Reports 152 ms, Leads 106 ms and Integrations 165 ms in Next development mode. First requests included route compilation and are not production latency measurements.
- Verification passed: 522 automated tests, all package typechecks, forced uncached production build, Prisma validation and local migration deployment.

Still required before Block 1:

- Deploy this block and verify navigation/route durations against the real production dataset and infrastructure.
- Product owner reviews the loading feedback, Meta action states and production timings.

## 7. Block 0.5 - External MySQL/Kinbox Data Foundation

This block runs before Overview so the approved pages can be validated with real WhatsApp conversations and conversion events. It adds an alternative data source for customers who already operate WhatsApp through another provider or an official API workflow and persist the resulting data in MySQL. It does not replace Uazapi or the future WhatsApp Cloud API adapter.

### Objective

Allow a workspace to import leads, conversations, WhatsApp attribution and conversion events from a customer-owned MySQL database while preserving the same internal WppTrack models, formulas, dashboards and audit behavior used by native providers.

### Architecture constraints

1. MySQL is accessed only by the WppTrack backend. The browser never receives database credentials or opens a direct database connection.
2. Every connector belongs to a workspace and uses a dedicated read-only MySQL user. TLS and network allowlisting are required whenever the source supports them.
3. Credentials are encrypted at rest, redacted from logs and never stored in repository files.
4. Each external schema receives an explicit mapping adapter into the canonical WppTrack ingestion model. The product must not assume that every customer database has the same tables or column names.
5. Imported records enter the existing lead, attribution, conversion and diagnostic pipeline with a source identifier such as `external_mysql`; reports must not need provider-specific formulas.
6. Initial backfill and recurring incremental synchronization run asynchronously through queues. A stable cursor, such as `updated_at` plus primary key, must be defined from the real schema.
7. Imports are idempotent and resumable. Reprocessing the same source row cannot create duplicate leads, conversations or conversion events.
8. WppTrack never writes business data back to the customer database in this block.
9. Connector health exposes the last successful sync, current cursor, imported/rejected counts and safe error summaries for non-technical support and backoffice diagnosis.
10. Direct Meta OAuth/Graph API remains the source of truth for current campaign metrics. The external `facebook_ads_*` table is optional and can only be used for legacy backfill before an explicit cutover date or for controlled reconciliation.
11. External provider event names are audit metadata, not business logic. Each connector route or n8n workflow maps explicitly to the canonical WppTrack event type.
12. Values supplied from a workspace-configured average are snapshotted on ingestion and marked as estimated through a value-source field. Actual values, when available in future connectors, take precedence.
13. Kinbox `QualifiedLead` is accepted once per connector and lead identity. Kinbox `Purchase`, when no provider transaction ID exists, is accepted once per connector, lead identity and workspace-local calendar date.
14. A Kinbox purchase on a later local date is a new event and can be classified as a repurchase. Same-day repeats remain visible in ingestion audit but cannot create another business conversion.
15. Generated transaction/event IDs are derived from the persisted idempotency key and reused across retries. Calendar-day keys use the workspace timezone, never the API server timezone implicitly.
16. The current n8n Meta send is replaced only after a shadow-import reconciliation. No external report consumes the legacy Kinbox purchase snapshot, so the append-only event ledger can become authoritative without preserving a Looker-specific contract.
17. The legacy `whatsapp_anuncio_*` table remains a historical lead snapshot for initial backfill. New qualification and purchase history is sourced from the standard append-only event ledger.
18. The one-purchase-per-local-day rule belongs only to the Kinbox adapter for this payload contract. It is not a global `Purchase` rule. Other providers can accept multiple same-day purchases whenever a stable provider event ID or transaction ID distinguishes them.

### Discovery gate

The standard structure-only MySQL dump, official Meta/Kinbox payloads and the active n8n Purchase workflow were reviewed on 2026-07-11. No external automation or report consumes the current purchase snapshot. The discovery phase is complete and the consolidated design is approved. Credentials and production rows must never be requested in chat.

### Acceptance criteria

- A workspace can enable or disable its connector without affecting other workspaces or native Uazapi instances.
- A read-only connection test reports a clear success or actionable failure.
- Backfill and incremental sync complete without duplicates and resume safely after interruption.
- Phone identity, conversation dates, CTWA/Meta attribution, labels and conversion events are normalized whenever those values exist in the source.
- Overview, Leads, Reports and Meta Event Audit consume the imported data through the same contracts used by native ingestion.
- Missing optional source fields are shown as unavailable and are never invented.
- Secrets and raw customer data do not appear in frontend payloads, logs or diagnostics.

### Explicit non-goals for the first version

- Automatically understanding arbitrary MySQL schemas without an approved mapping.
- Writing statuses, labels or conversion results back into the customer's MySQL database.
- Replacing Uazapi, Meta OAuth or the planned official WhatsApp provider adapter.

## 8. Block 1 - Overview

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

## 9. Block 2 - Leads

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

## 10. Block 3 - Reports

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

## 11. Block 4 - Integrations, Settings and Meta Event Audit

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

Implementation status - 2026-07-12:

- Added a persisted workspace funnel configuration with human labels, visibility and explicit ordering per supported Meta event.
- Products/services, default values and currency can be configured both for the funnel event and for individual keyword/WhatsApp-label rules.
- Actual connector values keep priority; rule values come next; workspace event values are the final configured fallback and are snapshotted into new conversion events.
- Overview and Reports consume the configured visible stages in the same order. Campaign, ad set and ad tables no longer depend on fixed QualifiedLead/Purchase columns.
- Settings keeps event triggers separate from the funnel journey, shows no manual customer Meta token field and records configuration changes in the audit log.
- Desktop 1440 px and mobile 390 px renders were inspected with populated configuration. Settings and Reports have no page-level horizontal overflow, and the account/team cards were adjusted to two columns on desktop and one on mobile.
- 643 automated tests, monorepo lint, Prisma validation, shared/Nest compilation and the Next production build pass. This slice does not change n8n workflows, shadow mode or the CAPI cutover gate.

### 4C. Meta Event Audit

- Dedicated customer-facing audit using `GET /reports/conversions/audit`.
- Filters by period, event, status and source.
- Clear success, queued, blocked and failed states.
- Show safe error summaries, occurrence time, send time and related lead/campaign context.
- Never expose OAuth tokens, webhook secrets or raw sensitive payloads.

Implementation status - 2026-07-12:

- Added the dedicated authenticated `/events` customer route and `Eventos Meta` navigation entry.
- Extended `GET /reports/conversions/audit` with local-period, event, delivery-state, source and pagination filters.
- Added whole-filter delivery totals and batched lead/campaign/ad hierarchy enrichment without per-row reads.
- Raw provider messages are replaced by safe customer summaries; no token, hash or raw payload is rendered.
- Desktop 1440 px and mobile 390 px screenshots were inspected; the table remains horizontally contained and mobile pagination no longer clips its second action.
- 635 automated tests, monorepo lint, the Next production build and isolated Nest build pass. CAPI cutover remains separately gated by real QualifiedLead and Purchase samples.

### Acceptance criteria

- Provider or API failure does not remove valid actions.
- Saving and refreshing always give immediate feedback.
- Event configuration controls which dynamic funnel stages appear.
- Audit allows a non-technical operator to understand what worked and what failed.

## 12. Block 4.5 - Full Platform Layout Review

Before starting Block 5, review and refine every existing customer and platform-admin surface. This is an explicit product gate, not a cosmetic pass performed in parallel with connector expansion.

### Scope

- Authentication, access recovery and support-access states.
- Shared shell: sidebar, top bar, workspace context, navigation and responsive behavior.
- Overview, Leads, Reports at every hierarchy level, Meta Events, Integrations and Settings.
- Existing platform backoffice pages, including workspaces, connectors, diagnostics and audit views.
- Loading, empty, error, permission, populated and long-content states for every reviewed route.

### Review method

1. Inventory every existing route and its relevant UI states before changing components.
2. Capture a baseline at 1440 px desktop and 390 px mobile with real or representative data.
3. Record findings by severity: broken workflow, misleading information, responsive/overflow defect or visual consistency issue.
4. Refine one page group at a time using the established WppTrack design system and existing shared components.
5. Preserve reporting formulas, permissions, provider contracts and operational behavior unless a verified product defect requires a scoped correction.
6. Re-run focused tests, lint/build and desktop/mobile visual inspection after each page group.
7. Present each page group for product-owner review before marking the layout review complete.

### Design and product rules

- Operational pages remain compact, readable and optimized for repeated work; no marketing-style composition or decorative card stacking.
- Alignment, spacing, typography, labels, control dimensions and action hierarchy are consistent across the platform.
- Customer pages expose only customer-relevant information; connector credentials, technical diagnostics and cutover controls remain in platform backoffice.
- Long names, email addresses, campaign hierarchy and status labels do not overlap, clip or create page-level horizontal overflow.
- Mobile layouts preserve every primary action and comparison workflow without depending on desktop-only tables.
- This block does not enable WppTrack CAPI, disable legacy n8n sends or change the reconciliation gate.

### Acceptance criteria

- Every current route has an approved desktop and mobile render.
- No critical or high-severity layout finding remains open.
- Navigation, forms, filters, tables, feedback states and role boundaries are visually and functionally consistent.
- The existing workflows remain covered by automated tests and pass the monorepo quality gates.
- Block 5 starts only after explicit product-owner approval of this full-platform review.

Operational note - 2026-07-12:

- Real Barbieri funnel labels, products and average values are being configured while this review is prepared.
- The CAPI gate continues collecting automatic real QualifiedLead and Purchase samples in shadow mode during the layout review.

Implementation status - shared shell - 2026-07-12:

- Removed the obsolete `Telemetry OS` brand subtitle from desktop and mobile navigation.
- Replaced the clipped collapsed-sidebar logout label with a complete Lucide logout icon and tooltip while retaining the visible `Sair` label in the expanded menu.
- Mobile navigation now uses a sticky compact header and hamburger-controlled off-canvas drawer. The drawer closes from its close button, uncovered backdrop, route navigation or `Escape`, and locks background scrolling while open.
- Automated browser inspection covered desktop expanded/collapsed at 1440 x 1000 and mobile closed/open at 390 x 844. Every state matched viewport width, the logout action remained inside the sidebar and the old subtitle was absent.
- All 112 web tests, web typecheck and the Next production build pass. The next page group after product-owner shell approval is Overview.

Implementation status - Overview - 2026-07-13:

- Replaced the compact stage-card row with a recognizable conversion funnel based on the approved Renato reference: desktop uses proportional curved segments and mobile uses a dedicated vertical progression without horizontal scrolling.
- The funnel remains dynamic, follows the report-provided stage order and labels, and shows the conversion rate from each previous stage without changing reporting formulas.
- `ROAS com recompra` is rendered only when the period contains a repurchase count or repurchase revenue. The purchase KPI also omits the misleading `0 recompra` suffix when only first purchases exist.
- Added a compact global filter band for period, configured Business Manager and configured ad account. BM/account selectors appear only when the workspace has more than one available option, and the selected scope is applied to KPIs, chart, funnel and report links.
- Added the daily `Conversas Meta x conversas reais` comparison. Meta Insights are now synchronized with `time_increment=1` into `MetaCampaignDailyInsight`; real conversations are grouped by their first lead/event occurrence in the local reporting date. Missing daily Meta history is shown as a synchronization requirement instead of fabricated zeroes.
- Daily Meta synchronization stores a dense campaign/date series, including confirmed zero days. The chart is released only when every campaign in the selected scope covers every day in the requested interval, preventing partial history from looking complete.
- Automated inspection covered 1440 x 1000 and 390 x 844 with populated representative data. Both layouts matched viewport width; the desktop SVG contained one segment per stage and the mobile alternative replaced it without clipped labels.
- The new filter/chart state was also inspected at 1440 x 1000 and 390 x 844: no browser errors or page overflow, all four filters remained usable, desktop displayed the complete seven-day chart and mobile contained the wider chart inside its own horizontal scroll region.
- The complete automated suite currently passes with 56 shared-contract tests, 482 API tests and 114 web tests. API and web production builds also pass. The Overview page now awaits product-owner visual approval before the review advances to Leads.

## 13. Block 5 - External Connector Productization and Native Providers

After Blocks 1 through 4.5, evolve the approved data foundation into a customer-facing connector platform:

- Self-service connector configuration and health inside Integrations.
- Versioned provider adapters using the same canonical event contract.
- Native Meta WhatsApp/Cloud API ingestion with raw-body signature verification.
- Native Kinbox ingestion when its webhook contract and authentication are production-ready.
- Additional WhatsApp provider adapters without changing dashboards or reporting formulas.
- Provider-specific idempotency policies; no global daily Purchase restriction.
- Removal of n8n as a required runtime dependency for customers using native adapters.

## 14. Delivery Protocol Per Block

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

## 15. Current Next Action

Present the completed **Overview** review for product-owner approval and, once approved, start the **Leads** page audit. Continue **Block 4.5 - Full Platform Layout Review** page by page with desktop/mobile evidence. Keep the CAPI gate collecting automatic real QualifiedLead and Purchase samples without changing n8n or enabling duplicate sends. Start **Block 5 - External Connector Productization and Native Providers** only after the full-platform layout review is approved.
