# Umbler controlled replay implementation

Status: implemented and locally verified on 2026-07-18. The production gate
remains disabled by default.

## Wave 1 - Contracts and persistence

- [x] Add the replay deployment gate.
- [x] Add shared certification, preview and replay DTOs.
- [x] Add replay batch/item enums and models.
- [x] Add the Prisma migration and regenerate the client.

## Wave 2 - Isolated replay backend

- [x] Export the parser registry from the observation module.
- [x] Add a dedicated replay module and BullMQ queue.
- [x] Implement platform-owner certification.
- [x] Implement a redacted connection preview.
- [x] Create replay batches transactionally with one item per eligible event.
- [x] Materialize items through existing lead and conversion services.
- [x] Record bounded audit entries and aggregate batch status.

## Wave 3 - Backoffice

- [x] Add a dedicated connection replay page.
- [x] Link resolved CTWA deliveries to the replay preview.
- [x] Show parser certification and deployment-gate state.
- [x] Require exact connection-name confirmation.
- [x] Show the latest batch without exposing payload identity data.

## Wave 4 - Verification

- [x] Deployment-config tests.
- [x] Preview and authorization policy tests.
- [x] Replay idempotency and payload-expiry tests.
- [x] Existing observation boundary tests.
- [x] API/shared/web typechecks.
- [x] Full API and web test suites.
- [x] API and web production builds.
- [x] Security review for workspace scoping, privilege checks and redaction.

## Verification evidence

- API: 116 test files and 904 tests passed.
- Web: 36 test files and 205 tests passed.
- Shared, API and web typechecks passed.
- Prisma schema validation passed.
- API and web production builds passed.
- The authenticated replay route rendered locally with HTTP 200.
- A browser screenshot was not produced because no browser backend was
  available in the local runtime.

## Production activation checkpoint

1. Commit and deploy the migration, API and web.
2. Confirm the inbound observation flow remains healthy.
3. Set `INBOUND_WEBHOOK_REPLAY_ENABLED=true` only in the API environment and
   redeploy the API.
4. Certify the exact Umbler parser release with a real retained CTWA payload.
5. Configure the active Meta BM, reporting account and conversion destination
   for every channel that will be replayed.
6. Review the redacted preview and confirm the exact connection name.
7. Authorize a bounded batch from the platform-owner backoffice.

Observation never activates replay automatically. Existing OAuth, Barbieri and
external MySQL flows are not migrated or changed by this feature.
