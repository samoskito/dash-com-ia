# WppTrack Access, Email and Meta Connections Implementation Plan

Date: 2026-07-13
Status: Approved, not started
Design: docs/plans/2026-07-13-wpptrack-access-email-meta-connections-design.md

## 1. Goal

Implement secure multi-workspace access, delegated team management, Brevo transactional email, closed invitation onboarding, feature-gated Google login and guided OAuth/manual Meta connections for the current client SaaS.

The work must be incremental and reversible. The active Barbieri OAuth connection, assets, CAPI destination and current production runtime remain unchanged until a later explicit cutover checkpoint.

This repository is exclusively the client product. The course/student application will be created only after this product is complete by cloning it into a different Git repository, deployment environment and secret set. Student-specific modes, copy, onboarding and teaching documentation are outside this plan.

## 2. Global Gates

These gates apply to every wave.

### Tenant gate

- No customer endpoint may trust a client-provided workspace ID without membership validation.
- Unauthorized and nonexistent tenant resources return the same generic 404.
- New queries, jobs, caches, exports and files carry an explicit workspace scope.
- Cross-tenant tests must fail before the fix and pass afterward.

### Secret gate

- SMTP passwords and Meta tokens stay server-side.
- Plaintext secrets are never returned, logged, audited or serialized into jobs.
- Error messages are redacted before persistence.

### Barbieri no-touch gate

- No reconnect.
- No token replacement or rotation.
- No asset or destination change.
- No migration of reporting/CAPI execution.
- No change to the active conversation_started cutover.
- No operator action required.

Any task that cannot prove those conditions stops before deployment.

### Release gate

Each wave requires:

- focused tests;
- shared/API/web typechecks for affected packages;
- Prisma validate when schema changes;
- production builds for affected applications;
- git diff --check;
- a deploy checkpoint and rollback note.

## 3. Wave 0 - Baseline and Feature Flags

Purpose: establish explicit configuration and regression coverage before behavior changes.

### Tasks

- [ ] Add an architecture note for the current client product:
  - OAuth and manual Meta are supported;
  - OAuth remains highlighted and recommended;
  - Google is disabled by default;
  - no student profile is created in this repository.
- [ ] Add and parse backend flags:
  - AUTH_GOOGLE_ENABLED;
  - META_CONNECTION_MODES;
  - EMAIL_PROVIDER;
  - SMTP_HOST;
  - SMTP_PORT;
  - SMTP_SECURE;
  - SMTP_USER;
  - SMTP_PASSWORD;
  - EMAIL_FROM_NAME;
  - EMAIL_FROM_ADDRESS;
  - EMAIL_REPLY_TO;
  - WEB_ORIGIN.
- [ ] Add safe defaults to .env.example without credentials.
- [ ] Add startup validation:
  - SMTP fields required only when EMAIL_PROVIDER=smtp;
  - allowed Meta modes are oauth and manual;
  - disabled Google routes cannot start OAuth;
  - WEB_ORIGIN must be an allowed absolute HTTPS origin outside development.
- [ ] Capture current Barbieri-compatible Meta behavior in regression tests before adding the normalized model.

### Likely files

- .env.example
- apps/api/src/config or existing environment-loading module
- apps/api/src/auth/auth.controller.ts
- apps/api/src/integrations/meta/meta-connections.service.ts
- apps/api/test/load-env.test.ts
- apps/api/test/google-oauth-service.test.ts
- apps/api/test/meta-connections-service.test.ts
- apps/web/tests/google-login-route.test.ts
- apps/web/tests/integrations-route.test.ts

### Acceptance

- Invalid configuration fails fast without printing secrets.
- Existing OAuth behavior remains unchanged when oauth is enabled.
- Manual mode is not yet visible or active.
- Barbieri regression tests pass.

### Deploy checkpoint

This wave may deploy with current production values only. Set AUTH_GOOGLE_ENABLED=false and META_CONNECTION_MODES=oauth. No product behavior should change.

## 4. Wave 1 - Active Workspace and Tenant Security Foundation

Purpose: make the server-side active workspace authoritative before exposing multi-workspace navigation.

### Schema

- [ ] Add AuthSession.activeWorkspaceId as an optional workspace reference.
- [ ] Preserve supportWorkspaceId as a separate platform-support context.
- [ ] Add indexes needed to resolve active sessions by user and workspace.
- [ ] Decide whether a user-level lastWorkspaceId is needed. Prefer session state first; only add a user preference when product behavior requires persistence across all sessions.

### API

- [ ] Create WorkspaceContextService to resolve:
  - authenticated user;
  - active customer membership;
  - active workspace;
  - role and membership capabilities;
  - separate platform support context.
- [ ] Replace getCurrentWorkspace behavior that selects authenticated.workspaces[0].
- [ ] Add GET /workspaces returning only active memberships for the authenticated user.
- [ ] Add POST /workspaces/active:
  - normalize target ID;
  - verify active membership;
  - update only the current session;
  - audit success;
  - return generic 404 on unauthorized/nonexistent targets.
- [ ] Re-resolve a safe active workspace when membership is removed or suspended.
- [ ] Ensure logout and session revocation clear all active context.
- [ ] Require services to use resolved workspace context instead of arbitrary workspace parameters where possible.

### Isolation sweep

- [ ] Inventory all Prisma reads/writes for customer-owned models.
- [ ] Inventory BullMQ payloads and workers.
- [ ] Inventory cache keys, export routes, file paths and server actions.
- [ ] Add workspace scope where missing.
- [ ] Ensure workers revalidate workspace ownership for referenced connection/resource IDs.

### Likely files

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/<timestamp>_active_workspace_context/migration.sql
- apps/api/src/auth/session.types.ts
- apps/api/src/auth/auth.service.ts
- apps/api/src/workspaces/workspaces.service.ts
- apps/api/src/workspaces/workspaces.controller.ts
- apps/api/src/workspaces/platform-workspace-access.service.ts
- apps/web/src/lib/current-workspace.ts
- packages/shared/src/schemas/auth.ts
- packages/shared/src/schemas/workspace.ts

### Tests

- [ ] User A cannot list workspace B.
- [ ] User A cannot activate workspace B by ID.
- [ ] Nonexistent and unauthorized IDs have the same status/body shape.
- [ ] User with memberships A and B can switch between only those two.
- [ ] Two sessions for the same user can hold different active workspaces.
- [ ] Removing membership B clears B from affected sessions.
- [ ] Support context does not create membership or appear in the normal selector.
- [ ] ID swapping is blocked for leads, reports, integrations, exports and queued jobs.

### Acceptance

- No request silently chooses the first membership.
- Tenant context is resolved server-side.
- Existing single-workspace users land in the same workspace as before.
- Barbieri behavior and data remain unchanged.

### Deploy checkpoint

Deploy migration and API first. Backfill current sessions with their only valid membership when deterministic. Deploy web afterward. Monitor 404/403 rates and workspace-resolution logs without customer payloads.

### Rollback

Keep activeWorkspaceId nullable. The old single-membership fallback may remain temporarily behind a compatibility branch only for sessions with exactly one membership.

## 5. Wave 2 - Multi-Workspace Product Experience and Provisioning

Purpose: expose the secure foundation to users and allow one identity to participate in several companies.

### API and provisioning

- [ ] Update private platform provisioning so an existing email can become owner of a new workspace without password reset or duplicate user creation.
- [ ] Make workspace + owner membership creation atomic.
- [ ] Reject creating a second owner membership in the same workspace.
- [ ] Return the current role/capabilities with workspace list entries.

### Web

- [ ] Add a compact workspace selector to apps/web/src/components/app-shell.tsx.
- [ ] Show only memberships returned by the API.
- [ ] Show role label without exposing internal enum names.
- [ ] Keep stable dimensions in expanded and collapsed sidebar states.
- [ ] Switch via a server action or same-origin route that calls POST /workspaces/active.
- [ ] Refresh navigation and page data after switching.
- [ ] Preserve the explicit platform-support banner and exit action.
- [ ] On login, open the last valid session workspace.
- [ ] On invite acceptance, activate the invited workspace.

### Tests

- [ ] Selector HTML contains only authorized workspaces.
- [ ] Switch updates active context and subsequent API calls.
- [ ] Invalid target does not disclose a workspace name or existence.
- [ ] Existing platform user can own multiple customer workspaces.
- [ ] Responsive screenshots show no overlap in expanded/collapsed/mobile shell.

### Likely files

- apps/api/src/workspaces/backoffice-workspaces.controller.ts
- apps/api/src/workspaces/workspaces.service.ts
- apps/api/test/client-workspace-provisioning.test.ts
- apps/api/test/workspaces-controller.test.ts
- apps/web/src/components/app-shell.tsx
- apps/web/src/lib/current-workspace.ts
- apps/web/tests/app-layout.test.ts
- apps/web/tests/backoffice-clients-route.test.ts

### Acceptance

- A person can access several companies with a different role in each.
- It cannot learn about any other workspace.
- The last active workspace reopens predictably.

## 6. Wave 3 - Role Matrix and Delegated Team Management

Purpose: separate owner, operational admin, delegated team manager and analyst authority.

### Schema

- [ ] Add WorkspaceMember.canManageMembers with default false.
- [ ] Preserve owner/admin/member enum compatibility; expose member as Analyst in product copy.
- [ ] Add constraints/service invariants for exactly one effective owner.

### Authorization

- [ ] Centralize workspace permissions in one policy service.
- [ ] Define capabilities:
  - viewReports;
  - exportReports;
  - manageIntegrations;
  - manageWorkspaceSettings;
  - manageMembers;
  - grantMemberManager;
  - manageBilling;
  - transferOwnership.
- [ ] Replace checks that infer permission only from role.
- [ ] Ensure regular Admin cannot invite or change members.
- [ ] Ensure delegated Admin cannot affect owner or another delegated Admin.

### API

- [ ] Add member role update endpoint.
- [ ] Add member removal endpoint.
- [ ] Add owner-only delegated management toggle.
- [ ] Add invitation resend and revoke endpoints.
- [ ] Prevent self-removal when it would leave no owner.
- [ ] Audit invitation, role, capability and removal changes.
- [ ] Revoke affected active sessions immediately after membership removal.

### Web

- [ ] Rebuild Settings > Team around members and invitations.
- [ ] Use permission-aware actions and confirmations.
- [ ] Label roles Owner, Administrador and Analista.
- [ ] Expose Gerenciar equipe as an owner-controlled Admin toggle.
- [ ] Keep billing and ownership controls out of non-owner HTML.

### Likely files

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/<timestamp>_delegated_team_management/migration.sql
- apps/api/src/workspaces/workspaces.service.ts
- apps/api/src/workspaces/workspaces.controller.ts
- packages/shared/src/schemas/workspace.ts
- apps/web/src/app/(app)/settings/page.tsx
- apps/api/test/workspace-invites-service.test.ts
- apps/api/test/workspaces-controller.test.ts
- apps/web/tests/settings-route.test.ts

### Test matrix

- [ ] Owner: all workspace/team/billing capabilities.
- [ ] Regular Admin: operations/integrations, no team/billing/ownership.
- [ ] Delegated Admin: allowed team actions only.
- [ ] Analyst: read-only product access.
- [ ] Delegated Admin cannot grant canManageMembers.
- [ ] Delegated Admin cannot alter owner or peer team manager.
- [ ] Role is isolated per workspace for the same user.

### Acceptance

The approved matrix is enforced by API tests, not only by hidden buttons.

## 7. Wave 4 - SMTP Infrastructure with Brevo

Purpose: implement a reusable, observable transactional email delivery path.

### Dependencies and module

- [ ] Add nodemailer and its TypeScript types to apps/api.
- [ ] Create EmailModule with:
  - transport factory;
  - message renderer;
  - queue producer;
  - BullMQ processor;
  - redacted delivery audit.
- [ ] Use smtp-relay.brevo.com, port 587 and STARTTLS in production configuration.
- [ ] Configure sender noreply@rastrack.app and reply-to suporte@rastrack.app.
- [ ] Add a fake/in-memory transport for tests.

### Queue behavior

- [ ] Assign deterministic idempotency keys per email action token/version.
- [ ] Retry transient failures with bounded exponential backoff.
- [ ] Do not retry permanent recipient/configuration failures forever.
- [ ] Record queued, sent and failed states without tokenized links or message bodies.
- [ ] Add a health check that verifies configuration shape without sending email.

### Templates

- [ ] Shared responsive HTML/text shell.
- [ ] Workspace invitation.
- [ ] Password reset.
- [ ] Email verification.
- [ ] Safe absolute links derived from validated WEB_ORIGIN.

### Tests

- [ ] Correct sender and reply-to.
- [ ] HTML and text alternatives.
- [ ] No secret or raw token in logs/jobs/audit assertions.
- [ ] Retry classification.
- [ ] Invalid production URL/config fails startup.

### Likely files

- apps/api/package.json
- pnpm-lock.yaml
- apps/api/src/email/*
- apps/api/src/app.module.ts
- apps/api/test/email-service.test.ts
- apps/api/test/email-processor.test.ts
- .env.example

### Acceptance

Brevo can deliver a test email in a staging environment. Production SMTP keys are configured only in the deployment secret store.

### Deploy checkpoint

Deploy with EMAIL_PROVIDER disabled first, validate health, then enable SMTP in staging. Do not test by inviting a real customer until sender-domain authentication and reply-to are confirmed.

## 8. Wave 5 - Password Reset and Email Verification Delivery

Purpose: connect the existing secure action-token foundation to real email.

### Password reset

- [ ] Queue a reset email only when the normalized email maps to an eligible user.
- [ ] Always return the same generic response.
- [ ] Apply IP and email-fingerprint rate limits.
- [ ] Preserve 30-minute expiry and one-time consumption.
- [ ] Revoke other reset tokens after a successful password change.
- [ ] Revoke active sessions according to the selected security policy, keeping the completing session behavior explicit.

### Verification

- [ ] Queue verification email when required.
- [ ] Preserve 24-hour expiry.
- [ ] Resend with token rotation and rate limits.
- [ ] Mark invitation email as verified when invitation onboarding succeeds.

### Tests

- [ ] Known and unknown email responses are indistinguishable.
- [ ] Expired, used and rotated links fail generically.
- [ ] No token is exposed unless the existing explicit development-only flag is enabled outside production.
- [ ] Successful reset invalidates the expected sessions/tokens.

### Likely files

- apps/api/src/auth/auth.service.ts
- apps/api/src/auth/auth.controller.ts
- apps/api/test/auth-action-tokens-service.test.ts
- apps/api/test/auth-service.test.ts
- apps/web/src/app/login/password-reset-forms.tsx
- apps/web/tests/password-reset-route.test.ts
- apps/web/src/app/login/email-verification-form.tsx
- apps/web/tests/email-verification-route.test.ts

### Acceptance

Forgot-password and verification work end to end through Brevo without account enumeration.

## 9. Wave 6 - Complete Invitation Onboarding

Purpose: turn current invitation records into a complete closed-registration flow.

### API

- [ ] Add minimal public invitation inspection by raw token.
- [ ] Return generic invalid state for expired/revoked/unknown tokens.
- [ ] Preserve only minimum display data for a valid token.
- [ ] Add new-user invite acceptance:
  - validate token and email;
  - hash password;
  - create user;
  - mark email verified;
  - create membership;
  - accept invite;
  - create/authenticate session;
  - activate invited workspace;
  - commit atomically.
- [ ] Add existing-user acceptance after authentication with matching normalized email.
- [ ] Rotate token on resend and invalidate prior token.
- [ ] Update status for queued/sent/failed/accepted/revoked/expired.

### Web

- [ ] Make invite route accessible before app authentication.
- [ ] Show login continuation for existing users.
- [ ] Show name/password form for new users.
- [ ] Handle expired/revoked links with a generic support-oriented state.
- [ ] Land accepted users in the invited workspace.

### Tests

- [ ] New user acceptance.
- [ ] Existing user acceptance.
- [ ] Email mismatch.
- [ ] Expired, used, revoked and superseded tokens.
- [ ] Concurrent acceptance creates one membership.
- [ ] Invite cannot grant owner or delegated manager through a crafted payload.
- [ ] Accepting workspace B does not leak workspace A.

### Likely files

- apps/api/src/workspaces/workspaces.controller.ts
- apps/api/src/workspaces/workspaces.service.ts
- apps/api/src/auth/auth.service.ts
- packages/shared/src/schemas/workspace.ts
- apps/web/src/app/(app)/settings/invites/accept/page.tsx
- apps/web/tests/workspace-invite-accept-route.test.ts
- apps/api/test/workspace-invites-service.test.ts

### Acceptance

The platform owner can provision the responsible owner, and that owner or delegated team manager can invite its team without public signup.

## 10. Wave 7 - Google Feature Gate

Purpose: keep Google available in code while disabled in the current SaaS.

### Tasks

- [ ] Hide the Google button when AUTH_GOOGLE_ENABLED=false.
- [ ] Reject both OAuth start and callback server-side when disabled.
- [ ] Require verified Google email.
- [ ] Permit login only for an existing user or a valid invited identity according to the invitation flow.
- [ ] Never create a workspace from Google OAuth.

### Tests

- [ ] Button absent and routes blocked when disabled.
- [ ] Existing user login when enabled.
- [ ] Unverified email rejected.
- [ ] Unknown, uninvited email rejected.
- [ ] No workspace auto-provisioning.

### Acceptance

The current SaaS remains email/password-first. The frontend and backend both reject Google while the flag is disabled.

## 11. Wave 8 - Normalized Meta Schema Beside Legacy

Purpose: introduce the new connection model without moving existing production execution.

### Schema

- [ ] Add MetaCredential.
- [ ] Add MetaBusinessConnection.
- [ ] Add MetaConversionDestination.
- [ ] Add/normalize MetaReportingAccount linked to business connection.
- [ ] Add default destination on business connection.
- [ ] Add optional destination override on reporting account.
- [ ] Add status, validation, creator, rotation and timestamps.
- [ ] Add unique constraints scoped by workspace.
- [ ] Add indexes for workspace, business connection, ad account and destination resolution.
- [ ] Keep legacy MetaIntegration and capiAccessTokenEncrypted fields intact.

### Encryption

- [ ] Reuse or evolve MetaTokenEncryptionService with key versioning and authenticated encryption.
- [ ] Add token fingerprint that cannot recover the token.
- [ ] Refuse plaintext readback.
- [ ] Redact validation errors and Graph request metadata.

### Compatibility adapter

- [ ] Add a MetaConnectionResolver that can resolve legacy or normalized configuration.
- [ ] Legacy remains first for existing OAuth workspaces.
- [ ] New manual connections use normalized tables.
- [ ] Build a no-write compatibility projection for Barbieri metadata.
- [ ] Do not copy, decrypt/re-encrypt, rotate or replace the Barbieri token in this wave.

### Likely files

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/<timestamp>_meta_normalized_connections/migration.sql
- apps/api/src/integrations/meta/meta-token-encryption.service.ts
- apps/api/src/integrations/meta/meta-connections.service.ts
- apps/api/src/integrations/meta/meta-connection-resolver.service.ts
- apps/api/src/integrations/integration.types.ts
- packages/shared/src/schemas/integrations.ts
- apps/api/test/meta-token-encryption-service.test.ts
- apps/api/test/meta-connections-service.test.ts

### Tests

- [ ] Workspace-scoped uniqueness and isolation.
- [ ] Token cannot be read after save.
- [ ] New manual connection resolves normalized path.
- [ ] Existing OAuth fixture resolves legacy path exactly as before.
- [ ] Barbieri-compatible fixture produces identical reporting/CAPI inputs without writes.

### Acceptance

The schema is deployed with no runtime cutover and no change to existing workspaces.

### Deploy checkpoint

Migration first, then API with feature path disabled for normal users. Verify current Meta sync and CAPI health before exposing manual setup.

## 12. Wave 9 - Guided Manual Quick Setup

Purpose: support the common one-token, one-BM, one-destination structure.

### API

- [ ] Add owner/admin-only endpoint to submit one permanent system-user token.
- [ ] Encrypt immediately and discard plaintext request state.
- [ ] Validate token identity, scopes and accessible businesses.
- [ ] Select one advertiser BM.
- [ ] Discover and select allowed ad accounts.
- [ ] Discover/validate one Pixel/Dataset and one Facebook Page.
- [ ] Validate that the token can access required assets.
- [ ] Persist one MetaCredential, MetaBusinessConnection, destination and account mappings atomically.
- [ ] Use the same credential for Marketing API and CAPI.
- [ ] Add a non-destructive connection test.

### Web

- [ ] Keep OAuth card first and marked recommended.
- [ ] Add permanent-token alternative.
- [ ] After token selection, offer Quick and Advanced.
- [ ] Implement Quick guided steps:
  - token;
  - BM;
  - accounts;
  - Pixel/Dataset and Page;
  - review;
  - validate/activate.
- [ ] Explain that the token is stored encrypted and cannot be displayed later.
- [ ] Do not expose backend/internal terminology when a user-facing label is clearer.

### Tests

- [ ] Invalid/revoked token.
- [ ] Missing required permissions.
- [ ] Token cannot access selected BM/account/destination.
- [ ] Pixel without Page is rejected.
- [ ] Secret redaction in API, HTML and logs.
- [ ] Analyst cannot create connection.
- [ ] OAuth remains first and unchanged.

### Likely files

- apps/api/src/integrations/meta/meta.adapter.ts
- apps/api/src/integrations/meta/meta-assets.service.ts
- apps/api/src/integrations/meta/meta-connections.service.ts
- apps/api/src/integrations/integrations.controller.ts
- apps/web/src/app/(app)/integrations/page.tsx
- apps/web/src/app/(app)/integrations/meta-*
- apps/api/test/meta-adapter.test.ts
- apps/api/test/meta-assets-service.test.ts
- apps/web/tests/integrations-route.test.ts

### Acceptance

A simple manual customer can connect one permanent token, BM, accounts and destination without OAuth. Existing OAuth cards and Barbieri remain untouched.

## 13. Wave 10 - Advanced Multi-BM and Shared Destinations

Purpose: support rotating advertiser BMs and matrix-owned shared conversion assets.

### API

- [ ] Allow several MetaCredentials per workspace.
- [ ] Associate each advertiser BM connection with its exact credential.
- [ ] Allow one reusable destination to be referenced by several business connections.
- [ ] Support owner/matrix BM metadata for shared destinations.
- [ ] Support dedicated destination per BM.
- [ ] Support account-level destination override.
- [ ] Validate the active connection credential's access to shared assets before association.
- [ ] Add rotate-token operation:
  - accept replacement once;
  - validate before activation;
  - atomically swap encrypted credential;
  - preserve prior encrypted version only for bounded rollback if security policy permits;
  - audit rotation without secret.
- [ ] Add pause/disconnect rules that protect active jobs and CAPI routing.
- [ ] Add per-connection health and last successful validation/sync.

### Web

- [ ] Advanced connection list by BM.
- [ ] Add token/BM connection.
- [ ] Manage default destination.
- [ ] Reuse an existing validated shared destination.
- [ ] Override destination per account.
- [ ] Show health and affected accounts.
- [ ] Require explicit confirmation for rotate, pause and disconnect.
- [ ] Keep the quick setup concise; advanced controls appear only after choosing Advanced.

### Tests

- [ ] Two BMs with two tokens and one shared destination.
- [ ] Two BMs with dedicated destinations.
- [ ] Account override supersedes BM default.
- [ ] Credential from BM A cannot operate inaccessible BM B assets.
- [ ] Token failure isolates only its business connection.
- [ ] Ambiguous or missing mapping blocks.
- [ ] Cross-workspace destination/credential IDs are rejected generically.

### Acceptance

Both approved client patterns work:

1. matrix BM owns Pixel/Page shared to rotating advertiser BMs;
2. each BM has its own Pixel/Page.

## 14. Wave 11 - Exact Reporting and CAPI Routing

Purpose: make the normalized model operational without guessing and without disturbing current production.

### Reporting

- [ ] Every reporting sync job carries workspaceId, businessConnectionId and reportingAccountId.
- [ ] Resolve the exact credential from the business connection.
- [ ] Validate all referenced IDs again in the worker.
- [ ] Scope snapshots and retries by connection.
- [ ] Pause only affected accounts when a token fails.

### CAPI

- [ ] Resolve event attribution to reporting account/business connection.
- [ ] Resolve account override or connection default destination.
- [ ] Use the same connection credential for the CAPI call.
- [ ] Block missing or ambiguous attribution with an actionable audit status.
- [ ] Persist selected connection/destination IDs with the event delivery audit.
- [ ] Preserve current event_id and cutover semantics.
- [ ] Never replay historical shadow/not_eligible events.

### Shadow comparison

- [ ] For existing OAuth workspaces, compute normalized routing in shadow without changing the actual request.
- [ ] Compare selected account, credential identity fingerprint, Pixel/Dataset and Page.
- [ ] Record only redacted parity results.
- [ ] Require a sustained parity window before any migration proposal.
- [ ] Keep Barbieri actual execution on legacy-compatible path.

### Likely files

- apps/api/src/reporting/meta-reporting.service.ts
- apps/api/src/reporting/meta-report-sync-queue.service.ts
- apps/api/src/reporting/meta-report-sync.processor.ts
- apps/api/src/conversion-events/meta-capi.adapter.ts
- apps/api/src/conversion-events/conversion-event-processor.ts
- apps/api/src/integrations/meta/meta-connection-resolver.service.ts
- apps/api/test/meta-report-sync-processor.test.ts
- apps/api/test/meta-capi-adapter.test.ts
- apps/api/test/conversion-event-processor.test.ts

### Acceptance

New manual connections can report and send CAPI through exact mappings. Existing OAuth execution remains unchanged. No event can select an arbitrary first token or destination.

## 15. Wave 12 - Final Security Audit and Controlled Rollout

Purpose: validate the complete system before broad production enablement.

### Security review

- [ ] Search every Prisma access for tenant scope.
- [ ] Review raw SQL and external connectors.
- [ ] Review session creation, renewal, cookies, active workspace and support context.
- [ ] Review role/capability checks route by route.
- [ ] Review invite/reset/verification token hashing, rotation, expiry and one-time behavior.
- [ ] Review SMTP and Meta encryption/key management.
- [ ] Review BullMQ payloads and worker revalidation.
- [ ] Review cache keys.
- [ ] Review exports, temporary files and object storage paths.
- [ ] Review logs, audit records and error reporting for secrets/PII.
- [ ] Review rate limits and enumeration behavior.
- [ ] Review dependency vulnerabilities and production headers/TLS.
- [ ] Run cross-tenant penetration-style automated tests.

### Production rollout

- [ ] Enable SMTP and send controlled internal tests.
- [ ] Enable team invitations for an internal/test workspace.
- [ ] Validate multi-workspace behavior with two test companies and distinct roles.
- [ ] Enable manual Quick for one non-Barbieri test workspace.
- [ ] Validate reporting and a controlled CAPI event.
- [ ] Enable Advanced for a test matrix/shared-destination structure.
- [ ] Observe health, audit and rollback behavior.
- [ ] Expand to selected manual-token clients.

### Barbieri checkpoint

Barbieri is not automatically migrated at the end of this plan. A separate proposal must show:

- shadow parity period and evidence;
- exact before/after credential and destination identities;
- zero required reconnection;
- rollback path;
- no duplicate CAPI risk;
- explicit operator approval.

Without that approval, Barbieri remains on the legacy-compatible OAuth path indefinitely.

## 16. Validation Commands

Run focused tests during each wave and the full suite before release:

- pnpm --filter @wpptrack/shared test
- pnpm --filter @wpptrack/api test
- pnpm --filter @wpptrack/web test
- pnpm typecheck
- pnpm --filter @wpptrack/api prisma:generate
- pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
- pnpm --filter @wpptrack/api build
- pnpm --filter @wpptrack/web build
- git diff --check

When a Windows Prisma DLL is locked by a running dev process, stop that process or use the repository's established isolated TypeScript/build verification. Do not treat unrelated generated-file churn as part of the feature.

## 17. Definition of Done

The initiative is done only when:

- multi-workspace access is server-authoritative and cross-tenant tested;
- roles and delegated team management match the approved matrix;
- Brevo delivers all three transactional email types;
- invitation onboarding works for new and existing users without public signup;
- Google is safely feature-gated;
- Meta OAuth remains the default current-SaaS path;
- manual Quick and Advanced support the approved token/BM/destination structures;
- reporting and CAPI route through explicit connections without guessing;
- secrets remain encrypted and redacted;
- the final security audit passes;
- Barbieri remains uninterrupted unless separately approved for migration.
