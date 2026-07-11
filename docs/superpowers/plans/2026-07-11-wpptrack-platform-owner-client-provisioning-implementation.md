# WppTrack Platform Owner and Client Provisioning Implementation Plan

Date: 2026-07-11
Status: Implemented and validated locally
Spec: `docs/superpowers/specs/2026-07-11-wpptrack-platform-owner-client-provisioning-design.md`

## Execution Order

1. Add persistent platform roles and per-session support workspace state to Prisma.
2. Preserve the current email allowlist as bootstrap compatibility.
3. Extend authentication session resolution with an audited platform support context.
4. Add owner-only endpoints to enter/exit a customer workspace and manage platform operators.
5. Add atomic customer workspace + first owner provisioning.
6. Add backoffice contracts and API endpoints for customer provisioning/listing.
7. Add connector management to the private backoffice using the existing encrypted API endpoints.
8. Add the support-workspace selector and active-context banner to the web shell.
9. Add focused API, shared-contract and web tests.
10. Run Prisma validation, migrations locally, tests, typechecks and production builds.
11. Update `Projeto.md`, commit, push and guide production migration/deploy one action at a time.

## Implemented Result

- Persistent `platform_owner` and `platform_operator` roles in PostgreSQL.
- Per-session support workspace with explicit banner and audited entry/exit.
- Atomic customer workspace + first owner provisioning without exposing the initial password.
- Platform team management isolated from customer memberships.
- Private MySQL connector creation, connection test, shadow activation and manual sync by workspace.
- Activation is rejected until the latest connection test succeeds.
- Existing users can be promoted without resetting their password through `platform-owner:promote`.
- Desktop and mobile backoffice verified without horizontal overflow; password controls remain inside their fields.

## Local Validation

- Shared contracts: 54 tests passed.
- API: 427 tests passed.
- Web: 86 tests passed.
- Shared, API and web TypeScript checks passed.
- API and Next.js production builds passed.
- Prisma schema validated and all 26 local migrations are applied.
- Authenticated HTTP verification returned 200 for login and `/backoffice/clients`.
- Credential redaction check confirmed that plaintext passwords and encrypted credential fields are absent from rendered HTML.

## Production Sequence

1. Deploy API migration and code.
2. Promote the existing master account without changing its password:
   `pnpm --filter @wpptrack/api platform-owner:promote -- --email suporte@palmup.com.br`
3. Deploy the web backoffice.
4. Provision the Barbieri workspace and customer owner.
5. Register the Barbieri read-only MySQL connector in shadow mode.
6. Test the connector and reconcile the initial lead sync.
7. Enable periodic sync only after parity is accepted.
8. Rotate the principal MySQL credential that was exposed during setup, updating n8n in the same maintenance action.
