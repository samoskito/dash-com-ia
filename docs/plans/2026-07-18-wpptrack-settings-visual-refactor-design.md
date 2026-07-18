# WppTrack Settings visual refactor

## Scope

Wave 6 reorganizes the customer Settings route without changing workspace
permissions, platform-support access, member roles, delegated team management,
invites, owner-access resend, funnel configuration, conversion rules, or email
actions.

The change is limited to information hierarchy, progressive disclosure,
responsive layout, and scan-friendly operational summaries.

## Baseline

The current page is a continuous stack of four large panels:

1. workspace and account identity;
2. members and invitations;
3. funnel configuration;
4. WhatsApp conversion triggers.

The recorded comprehensive fixture measured:

- `2820px` of page height at `1440x1000`;
- `5956px` of page height at `390x844`;
- no page-level horizontal overflow;
- more than half of the mobile height dedicated to technical configuration
  that is edited infrequently.

The baseline was captured locally before implementation. Screenshots remain
outside version control because settings views can contain workspace and member
data; the recoverable code baseline is preserved by the
`layout-baseline-2026-07-18` Git tag.

## Approaches considered

### Interactive tabs

Tabs would reduce initial height, but introduce client state around server
actions and hide the relationship between identity, access, and automation.

### Separate routes

Dedicated account, team, and automation routes provide maximum isolation, but
increase navigation and expand the behavioral scope of a visual-only wave.

### Operational domains with progressive disclosure

This is the selected direction. The page remains one server-rendered route,
adds direct anchors for Account, Team, and Conversions, and keeps frequent
identity and member workflows visible. Funnel and trigger configuration start
collapsed with useful counts and health signals in their summaries.

## Hierarchy

The page becomes a settings control center:

1. a compact map shows workspace access, active members, pending invites, and
   active conversion automations;
2. Account contains workspace identity and signed-in account state;
3. Team contains the member directory, role controls, invitations, resend, and
   revoke actions;
4. Conversions contains two independent expandable tools: funnel stages and
   WhatsApp triggers.

Errors automatically keep the affected technical tool open so failure context
is not hidden.

## Responsive behavior

- Desktop uses a four-column settings map and two-column team management.
- Mobile uses one status row per setting domain.
- The domain navigation scrolls inside its own container.
- The invitation workflow appears before the member directory on mobile.
- Technical details expand to full-width forms without page-level overflow.
- Existing private-data masks and sensitive-action markers remain unchanged.

## Verification

Wave 6 requires:

```bash
pnpm --filter @wpptrack/web test
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web build
```

Playwright must verify initial and expanded states at `1440x1000` and
`390x844`, including controls for member management, funnel editing, and
conversion rules.

## Result

Wave 6 was completed with the selected operational-domain structure.

- The initial desktop height fell from `2820px` to `2305px`.
- The initial mobile height fell from `5956px` to `3991px`.
- Account, Team, and Conversions remain addressable by direct anchors.
- Invitations precede the member directory on mobile.
- Both technical tools remain closed in healthy states and open automatically
  when their data cannot be loaded.
- Funnel and conversion-rule forms were verified in their expanded states.
- The nested commercial-value editor now remains absent from layout while
  closed and uses a full-width action row on mobile when open.
- No page-level horizontal overflow was found at `1440x1000` or `390x844`.

Desktop, mobile, and expanded-state Playwright captures were reviewed locally
and intentionally not versioned to avoid publishing workspace or member data.

Verification result:

- 36 test files passed;
- 210 tests passed;
- TypeScript validation passed;
- Next.js production build passed for all 22 static-generation steps.
