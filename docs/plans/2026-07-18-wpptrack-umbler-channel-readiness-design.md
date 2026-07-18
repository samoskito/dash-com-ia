# Umbler channel readiness

## Goal

Make the Monday routing session deterministic without enabling replay or
changing any existing integration. Each discovered Umbler channel must show
what is ready, what is blocked and which retained CTWA events can be reviewed
after an exact Meta route is configured.

## Scope

The existing tenant-scoped channel endpoint gains a computed `readiness`
summary. No database column or migration is required. The summary contains
only counts, timestamps and fixed blocker codes:

- active and valid route counts;
- observed, routed and unresolved CTWA counts;
- routed events whose encrypted payload is still retained;
- events already materialized by a previous replay;
- observed CTWA events whose payload is unavailable;
- the nearest retained payload expiry;
- a readiness state and ordered blocker list.

It never returns raw payloads, CTWA identifiers, contact hashes, lead
identities, ad IDs, credentials or tokens.

## States

- `waiting`: the channel has not observed a CTWA event yet;
- `blocked`: CTWA exists, but no retained routed candidate can proceed;
- `partial`: at least one retained routed candidate exists, while other events
  or route conditions still need attention;
- `ready`: every unmaterialized observed CTWA is routed and retained;
- `complete`: all observed CTWA events are already materialized.

The state is informational. Replay eligibility remains owned by the existing
platform-only replay preview and worker, which revalidate the parser, gate,
payload, route and Meta resources at execution time.

## Blockers

The API emits only stable codes:

- `connection_paused`;
- `channel_paused`;
- `route_not_configured`;
- `route_not_valid`;
- `ctwa_not_observed`;
- `ctwa_unresolved`;
- `payload_unavailable`;
- `payload_expiring_soon`.

The web owns the Portuguese operator labels. Expiry is considered near when it
is within 48 hours.

## Data flow

The channel route service first loads the tenant-scoped connection and its
channels. It then performs one tenant- and connection-scoped event metadata
query for all returned channel IDs and one scoped delivery-availability query.
The endpoint never loads encrypted payload content. Events are grouped in
memory by channel and reduced to the redacted readiness summary.

This avoids per-channel database queries while keeping route metadata and
readiness in one response. Existing route replacement continues to re-evaluate
unresolved events, so refreshing the page after a route update immediately
refreshes the readiness state.

## Interface

The Integrations screen keeps the existing dense operational layout. The
channel status column becomes a readiness signal, while the expanded channel
shows:

- a readiness heading and status chip;
- four compact metrics;
- the nearest payload expiry when present;
- human-readable blockers;
- the existing route editor and lifecycle controls.

No production action is added. The panel remains safe for workspace members
and respects presentation privacy mode.

## Security and verification

- Every connection, channel and event query includes the active workspace.
- A foreign connection returns the same not-found response as a missing one.
- Readiness serialization is tested for payload, CTWA, lead and credential
  leakage.
- Existing manager-only mutations and member read-only behavior remain
  unchanged.
- API, web and shared tests cover ready, partial, blocked, waiting and complete
  states plus responsive rendering.
- Replay and observation gates remain unchanged.
