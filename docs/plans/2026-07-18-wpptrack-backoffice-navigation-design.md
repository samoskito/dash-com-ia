# WppTrack Backoffice Navigation Design

Date: 2026-07-18
Status: Approved for implementation

## Problem

The platform-owner backoffice currently combines billing, WhatsApp instances,
workspace data, webhook logs, jobs, integration calls, CAPI deliveries and audit
records on one long page. The inbound webhook audit also places technical IDs
and a large filter form before the recent deliveries.

This makes the primary Umbler validation task difficult: find the newest
delivery, identify whether it contains CTWA and open its raw payload.

## Decision

Keep the existing operational page available, but stop using it as the
backoffice entry point.

The new backoffice entry experience has:

- a persistent navigation for Home, Clients, WhatsApp Webhooks and Internal
  Operations;
- a quiet home page with a short command list instead of live tables;
- the current combined operational page behind an explicit Internal Operations
  entry;
- a webhook page that prioritizes recent deliveries and human-readable
  classifications;
- quick filters for all deliveries, unresolved CTWA, routed CTWA, no CTWA and
  failures;
- technical filters inside a collapsed Advanced filters disclosure;
- one clear `View payload` action per delivery.

## Safety Boundary

This change is web-only. It does not change:

- public webhook URLs or secrets;
- payload ingestion, encryption, retention or queue processing;
- Umbler parsing or event classification;
- channel-to-Meta routing;
- lead, ledger or CAPI behavior;
- any Barbieri integration path.

Raw payload access remains restricted to the platform owner and remains
audited by the API.

## Responsive Behavior

The navigation remains a stable horizontal control on desktop and becomes a
horizontally scrollable strip on narrow screens. Delivery rows use a fixed
operational grid on desktop and stack into labeled blocks on mobile. Advanced
filters never occupy the first viewport unless explicitly opened.

## Validation

- The default `/backoffice` route performs no operational data fetch.
- Internal operations remain available at `/backoffice?view=operations`.
- Existing backoffice actions and diagnostics continue to work in that view.
- Quick webhook filters generate the existing supported API query parameters.
- Raw payload links remain platform-owner-only.
- Tests cover the home navigation, quick filters, collapsed advanced filters,
  simplified delivery rows and payload links.
