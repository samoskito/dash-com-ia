# WppTrack Backoffice Visual Refactor

Date: 2026-07-18
Status: Implemented and verified locally

## Context

The platform-owner Backoffice contains three different kinds of work:

- client provisioning, internal access, and external connectors;
- inbound WhatsApp webhook observation and replay preparation;
- platform operations across WhatsApp, finance, diagnostics, and audit.

The task-first Backoffice navigation and the separated operations datasets are
already working. The final visual wave must preserve that behavior while
reducing the remaining density in `Clientes e acessos` and making operational
status easier to scan.

## Approaches Considered

### Styling only

Keep every section visible and adjust spacing, borders, and typography. This is
the lowest-risk option, but it does not solve the long client-administration
page or the competition between provisioning, platform users, workspaces, and
connectors.

### Task areas inside the current routes

Keep the current routes and server actions, but expose one client-management
domain at a time. Continue using the existing task areas in Internal
Operations, and refine their summaries and table framing. This reduces visual
load without changing API contracts or authorization boundaries.

### Split every domain into a new route

Create dedicated URLs and route files for workspaces, platform users,
connectors, billing, and diagnostics. This offers maximum isolation but creates
unnecessary routing and action-redirect changes for a visual refactor.

## Decision

Use task areas inside the current routes.

### Backoffice shell

- Preserve the Home, Clients, WhatsApp Webhooks, and Internal Operations
  navigation.
- Keep the navigation compact, sticky, and horizontally scrollable only when
  the viewport requires it.
- Use the same editorial operations language as the client application:
  graphite surfaces, mint active states, compact mono labels, and restrained
  semantic color.

### Clients and access

Divide the existing page into three visible domains:

1. Workspaces: platform summary, client provisioning, workspace status, access
   email, and audited support access.
2. Internal team: platform-owner user creation and the current operator list.
3. MySQL connectors: encrypted connector creation, health, reconciliation, and
   cutover controls.

Only the active domain is rendered. Client provisioning uses progressive
disclosure when workspaces already exist, so the workspace list remains the
primary repeated workflow.

### Internal operations

- Preserve WhatsApp, Finance, and Health task areas and their existing query
  parameters.
- Replace verbose overview cards with a compact operational metric strip.
- Keep each filter immediately above the table it controls.
- Present diagnostic counters as a flat health strip instead of nested cards.
- Keep dense desktop tables inside a stable, padded table region with a themed
  local scrollbar on narrow viewports.

### WhatsApp webhooks

The current webhook page remains functionally unchanged. Its quick filters,
recent-delivery list, payload access, and replay preparation are already the
validated operator flow.

## Safety Boundary

This wave is web-only. It does not change:

- platform-owner authorization;
- workspace isolation or support-access auditing;
- email invitation or access-reset behavior;
- connector credentials, synchronization, or CAPI cutover behavior;
- inbound webhook ingestion, retention, routing, or replay;
- billing, diagnostic, retry, or audit API contracts.

## Responsive Verification

Validate Home, Clients, Webhooks, and Internal Operations at desktop and mobile
widths. The page itself must not overflow horizontally. Dense operational
tables may scroll inside their own framed region, while navigation, forms,
headings, and actions must remain fully visible.

## Implementation Result

- Clients and access now opens one domain at a time: Workspaces, Internal Team,
  or MySQL Connectors.
- Workspace provisioning is secondary to the current workspace list and uses
  progressive disclosure when clients already exist.
- Mobile workspace cards replace the dense desktop comparison table without
  removing owner, connector, access-email, or support-access commands.
- Internal Operations keeps WhatsApp, Finance, and Health separated, with a
  compact platform metric strip and table-scoped filters.
- Diagnostic health counters are presented as a flat summary instead of nested
  cards.
- Backoffice navigation fits all four destinations on mobile, and the webhook
  empty states remain readable without overlap.

Verification after Wave 8:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps;
- Home, Clients, Webhooks, and Internal Operations passed desktop and mobile
  visual audits without page-level overflow;
- dense operational filters and tables scroll only inside their own framed
  regions.
