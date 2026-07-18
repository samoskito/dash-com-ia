# Backoffice Operations Redesign

## Context

The inbound webhook client screen uses database-wide counters, while the
backoffice delivery page previously derived its counters from the latest 50
rows loaded for display. This made a connection with 50 pending CTWA events
appear as `Todos: 50` and `CTWA pendente: 0` in the backoffice.

The internal operations page also placed unrelated WhatsApp, billing, split,
workspace, diagnostics, webhook, job, integration, conversion, and audit
controls in one continuous page. A single diagnostic form exposed every filter
for every table at once.

## Decisions

1. Add a platform-owner-only delivery summary endpoint. It applies the same
   workspace, connection, and provider scope as the delivery list. CTWA totals
   count normalized events, matching the customer connection screen, while
   technical failures continue to count failed deliveries.
2. Keep the delivery list paginated at 50 rows. Tabs use the summary endpoint,
   while the visible-results badge makes the page limit explicit.
3. Divide internal operations into three task areas:
   - WhatsApp: platform instances.
   - Finance: charges, plans, workspace customers, and split receivers.
   - Health: incidents, webhooks, CAPI events, external calls, jobs, and audit.
4. Show one finance or health dataset at a time. Subnavigation changes the
   selected dataset through query parameters without creating a second system.
5. Each health dataset gets only its related primary filters. Dates and narrow
   technical identifiers remain available under an advanced-filter disclosure.
6. Give every operational panel an explicit header, body spacing, and framed
   table region. Navigation remains horizontally scrollable on narrow screens.

## Safety And Verification

The summary endpoint remains restricted to platform owners and returns counts
only. Existing payload access auditing is unchanged. No customer workspace,
Meta connection, billing state, or inbound payload is mutated by this redesign.

Focused shared, API, and web tests cover summary parsing, authorization,
database-wide counting, scoped queries, and rendering. The operations page must
also pass type checking, route tests, a production build, and desktop/mobile
visual inspection.
