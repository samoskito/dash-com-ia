# WppTrack Meta Events visual refactor

Wave 4 of the progressive visual refactor was implemented on 2026-07-18. It
improves the customer-facing Meta delivery audit without changing API calls,
event classification, retry authorization, payload retention, permissions, or
conversion processing.

## Baseline findings

The previous page exposed eight summary counters, two dates, three filters, and
the delivery table at the same visual level. The information was complete but
the operator had to interpret classification states before understanding the
health of the delivery pipeline.

On mobile, the `1180px` audit table remained inside a narrow scroll container.
Only the event and lead columns were visible initially; delivery status,
timestamps, inspection, and retry actions existed outside the viewport.

The baseline was captured locally before implementation. Screenshots remain
outside version control because event audits can contain client and lead data;
the recoverable code baseline is preserved by the
`layout-baseline-2026-07-18` Git tag.

## Operational hierarchy

Meta Events now follows the order in which an operator investigates delivery:

1. Page identity and overall attention state.
2. Period selection.
3. Optional event, delivery-state, and source filters.
4. Primary delivery health.
5. Secondary classifications outside the active send queue.
6. Delivery history and event-level audit.

Period controls remain immediately visible. Event type, delivery state, and
source are grouped under an optional disclosure. Active filters automatically
open that disclosure and preserve the existing query-string contract.

## Delivery health

The health surface separates four operational states:

- sent;
- queued;
- blocked by configuration;
- failed during delivery.

Not eligible, shadow, historical, and discarded events remain visible in a
secondary strip. They no longer compete visually with failures and blocks that
require action.

The retry command remains available only when the API marks an event as
retryable. Inspection still exposes the same summary, source payload, Meta
request, and Meta response tabs.

## Delivery history

Desktop uses a five-column comparison table. Lead and campaign context share
one structured column, which keeps status, timestamps, inspection, and retry
actions visible within the normal content width.

At mobile widths, the desktop table is removed from the layout and each event
becomes a dedicated audit card. Every card exposes:

- event and origin;
- delivery state;
- lead and phone;
- occurred and sent timestamps;
- campaign, ad set, and ad;
- delivery detail and safe error copy;
- inspect and authorized retry actions.

No page-level horizontal scrolling is required.

## Visual evidence

Desktop and mobile Playwright captures were reviewed locally and intentionally
not versioned to avoid publishing event or lead-identifying data.

The visual audit confirmed:

- no page-level horizontal overflow at `1440x1000` or `390x844`;
- all desktop table columns remain inside the content surface;
- all mobile event cards fit the viewport at `362px`;
- desktop and mobile inspection dialogs load and remain fully framed;
- retry remains visible only on the transient failure scenario.

## Verification

```bash
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Wave 4 result:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps.

## Rollback

The original production layout remains recorded at
`layout-baseline-2026-07-18`. Wave 1 is recorded in commit
`63b4822d2ca58e3d804ebbb9474b0ea8da4a4668`.

For a selective rollback, compare the Events route, event audit details
component, route tests, and the Wave 4 rules in
`apps/web/src/styles/layout-system.css`. Do not reset the repository or restore
unrelated operational files.
