# WppTrack Integrations visual refactor

## Scope

Wave 5 reorganizes the customer Integrations route without changing OAuth,
permanent-token setup, Meta asset discovery, reporting-account selection,
inbound webhook observation, WhatsApp billing, or signal-pipeline contracts.

The route remains an operational configuration surface. The change is limited
to information hierarchy, progressive disclosure, responsive layout, and
human-readable navigation between existing tools.

## Problem

The current route renders every integration tool as a large panel in one
continuous stack. A configured manual Meta structure exposes all BMs, accounts,
destinations, and account overrides before the user reaches WhatsApp sources.
A single inbound webhook also expands automatically. The result is technically
complete but difficult to scan, especially on mobile.

The recorded fixture measured approximately:

- `2812px` of page height at `1440x1000`;
- `5647px` of page height at `390x844`;
- no horizontal overflow, but excessive vertical navigation and weak domain
  separation.

The baseline was captured locally before implementation. Screenshots remain
outside version control because integration views can contain account and asset
identifiers; the recoverable code baseline is preserved by the
`layout-baseline-2026-07-18` Git tag.

## Direction

The route becomes a connection control center organized around three domains:

1. **Meta Ads:** authentication, BMs, accounts, Pixels, Pages, and reporting
   destinations.
2. **WhatsApp sources:** inbound platform webhooks, external MySQL, or native
   WhatsApp instances.
3. **Signal flow:** the observed path from CTWA to Meta acknowledgement.

A compact operational rail exposes the state of these domains immediately.
Anchor navigation lets the operator jump to the relevant configuration area
without searching through the full page.

## Progressive disclosure

Saved Meta structures remain available in the HTML and keep every edit, sync,
pause, rotate, and remove action, but their detailed list starts collapsed.
The summary exposes the number of BMs, active reporting accounts, and configured
destinations.

Inbound webhook connections also start collapsed. Their summary keeps the
channel count, latest delivery, routed CTWA, and pending CTWA visible. Expanding
the connection reveals counters, commands, channels, readiness, and exact Meta
routes.

No connection, token, identifier, payload, or customer data is moved to the
client beyond what the current route already renders.

## Responsive behavior

- Desktop uses a four-column operational rail and compact horizontal domain
  navigation.
- Tablet uses two columns for the operational rail.
- Mobile uses one status row per domain, horizontally scrollable anchor
  navigation, full-width commands, and collapsed technical structures.
- All configuration forms preserve their existing responsive behavior when
  expanded.
- The page must not introduce page-level horizontal scrolling at `390px`.

## Verification

Wave 5 requires:

```bash
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Desktop and mobile Playwright screenshots must confirm:

- the three domains are visible and navigable;
- saved Meta and inbound webhook details remain expandable;
- actions and form controls remain reachable;
- no text, table, dialog, or control escapes the viewport.

## Result

Wave 5 is complete. The route now opens with a connection map and direct
navigation to Meta Ads, WhatsApp sources, and signal flow. Saved Meta
structures and inbound webhook operations remain fully available, but start
collapsed with their essential health signals visible.

Measured fixture result:

- desktop height changed from `2812px` to `2617px` at `1440x1000`;
- mobile height changed from `5647px` to `4012px` at `390x844`;
- opening saved Meta structures adds the expected `505px` operational body;
- opening the Umbler connection adds the expected `273px` operational body;
- page-level `scrollWidth` remains equal to `clientWidth` on desktop and mobile;
- expanded controls stay inside the `390px` mobile viewport.

Desktop, mobile, and expanded-state Playwright captures were reviewed locally
and intentionally not versioned to avoid publishing account or asset
identifiers.

Final verification:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps;
- desktop, mobile, and expanded-state Playwright audits passed.
