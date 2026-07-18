# Umbler channel readiness implementation

Status: complete locally. This wave is additive and does not enable replay.

## Wave 1 - Contracts

- [x] Add readiness states, blocker codes and the redacted channel summary.
- [x] Extend the channel DTO without exposing event identities.

## Wave 2 - API

- [x] Load CTWA metadata and payload availability in two bounded queries.
- [x] Compute route, retention and materialization counters per channel.
- [x] Keep foreign and missing resources indistinguishable.
- [x] Add leakage and state-transition tests.

## Wave 3 - Web

- [x] Add a readiness signal to each channel row.
- [x] Add compact metrics, blockers and expiry inside the expanded channel.
- [x] Preserve read-only roles and presentation privacy mode.
- [x] Add desktop and responsive render tests.

## Wave 4 - Targeted security review

- [x] Review tenant scope across the new read path.
- [x] Review raw payload, CTWA, identity and credential exposure.
- [x] Re-run inbound webhook authorization and observation boundary tests.
- [x] Run shared/API/web typechecks, focused tests and production builds.
- [x] Keep `INBOUND_WEBHOOK_REPLAY_ENABLED=false`.

## Verification

- `pnpm test`: 1,192 tests passed across shared, API and web.
- `pnpm typecheck`: all three packages passed.
- `pnpm lint`: all three packages passed.
- `pnpm build`: shared, API and web production builds passed.
- Focused authorization, payload, encryption, observation and replay suites:
  45 tests passed.
- No Prisma migration or environment change is part of this wave.

The security review above is limited to the new readiness read path and the
existing inbound payload/replay boundaries it touches. It does not replace the
full application and database security review planned for project closure.
