# WppTrack Access, Email and Meta Connections Implementation Plan

Date: 2026-07-13
Status: Waves 0-6 implemented and validated locally; outbound SMTP accepted in production; Waves 5-6 deploy pending
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

- [x] Add an architecture note for the current client product:
  - OAuth and manual Meta are supported;
  - OAuth remains highlighted and recommended;
  - Google is disabled by default;
  - no student profile is created in this repository.
- [x] Add and parse backend flags:
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
- [x] Add safe defaults to .env.example without credentials.
- [x] Add startup validation:
  - SMTP fields required only when EMAIL_PROVIDER=smtp;
  - allowed Meta modes are oauth and manual;
  - disabled Google routes cannot start OAuth;
  - WEB_ORIGIN must be an allowed absolute HTTPS origin outside development.
- [x] Capture current Barbieri-compatible Meta behavior in regression tests before adding the normalized model.

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

- [x] Add AuthSession.activeWorkspaceId as an optional workspace reference.
- [x] Preserve supportWorkspaceId as a separate platform-support context.
- [x] Add indexes needed to resolve active sessions by user and workspace.
- [x] Decide whether a user-level lastWorkspaceId is needed. Prefer session state first; only add a user preference when product behavior requires persistence across all sessions.

### API

- [x] Create WorkspaceContextService to resolve:
  - authenticated user;
  - active customer membership;
  - active workspace;
  - role and membership capabilities;
  - separate platform support context.
- [x] Replace getCurrentWorkspace behavior that selects authenticated.workspaces[0].
- [x] Add GET /workspaces returning only active memberships for the authenticated user.
- [x] Add POST /workspaces/active:
  - normalize target ID;
  - verify active membership;
  - update only the current session;
  - audit success;
  - return generic 404 on unauthorized/nonexistent targets.
- [x] Re-resolve a safe active workspace when membership is removed or suspended.
- [x] Ensure logout and session revocation clear all active context.
- [x] Require services to use resolved workspace context instead of arbitrary workspace parameters where possible.

### Isolation sweep

- [x] Inventory all Prisma reads/writes for customer-owned models.
- [x] Inventory BullMQ payloads and workers.
- [x] Inventory cache keys, export routes, file paths and server actions.
- [x] Add workspace scope where missing.
- [x] Ensure workers revalidate workspace ownership for referenced connection/resource IDs.

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

- [x] User A cannot list workspace B.
- [x] User A cannot activate workspace B by ID.
- [x] Nonexistent and unauthorized IDs have the same status/body shape.
- [x] User with memberships A and B can switch between only those two.
- [x] Two sessions for the same user can hold different active workspaces.
- [x] Removing membership B clears B from affected sessions.
- [x] Support context does not create membership or appear in the normal selector.
- [x] ID swapping is blocked for leads, reports, integrations, exports and queued jobs.

### Acceptance

- No request silently chooses the first membership.
- Tenant context is resolved server-side.
- Existing single-workspace users land in the same workspace as before.
- Barbieri behavior and data remain unchanged.

### Deploy checkpoint

Deploy migration and API first. Backfill current sessions with their only valid membership when deterministic. Deploy web afterward. Monitor 404/403 rates and workspace-resolution logs without customer payloads.

### Rollback

Keep activeWorkspaceId nullable. The old single-membership fallback may remain temporarily behind a compatibility branch only for sessions with exactly one membership.

### Implementation checkpoint - 2026-07-14

- Waves 0 and 1 are complete in code; no production deploy was performed.
- Session state remains authoritative and a multi-workspace session never guesses the first membership.
- Existing live sessions are backfilled only when unrevoked, unexpired and linked to exactly one membership.
- BullMQ producers carry workspaceId and workers revalidate resource ownership; legacy jobs receive a one-time compatibility resolution.
- Uazapi and Asaas webhooks fail closed and derive tenant context from verified resources.
- Direct Meta webhooks require X-Hub-Signature-256 and resolve a unique workspace from the Page ID.
- Meta OAuth state is hashed, expires after ten minutes, is one-time and revalidates membership plus integration permission.
- Local validation: 58 shared tests, 586 API tests and 124 web tests passed; shared/API/web typechecks, Prisma validate, Nest build, Next build and git diff --check passed.
- Normal Prisma engine generation was blocked only by the known Windows DLL lock; generation with --no-engine succeeded.
- Required deployment order remains migration/API first and web second. Confirm UAZAPI_WEBHOOK_AUTH_TOKEN, ASAAS_WEBHOOK_AUTH_TOKEN, META_APP_SECRET, AUTH_GOOGLE_ENABLED=false and META_CONNECTION_MODES=oauth before release.

## 5. Wave 2 - Multi-Workspace Product Experience and Provisioning

Purpose: expose the secure foundation to users and allow one identity to participate in several companies.

### API and provisioning

- [x] Update private platform provisioning so an existing email can become owner of a new workspace without password reset or duplicate user creation.
- [x] Make workspace + owner membership creation atomic.
- [x] Reject creating a second owner membership in the same workspace.
- [x] Return the current role/capabilities with workspace list entries.

### Web

- [x] Add a compact workspace selector to apps/web/src/components/app-shell.tsx.
- [x] Show only memberships returned by the API.
- [x] Show role label without exposing internal enum names.
- [x] Keep stable dimensions in expanded and collapsed sidebar states.
- [x] Switch via a server action or same-origin route that calls POST /workspaces/active.
- [x] Refresh navigation and page data after switching.
- [x] Preserve the explicit platform-support banner and exit action.
- [x] On login, open the last valid session workspace.
- [x] On invite acceptance, activate the invited workspace.

### Tests

- [x] Selector HTML contains only authorized workspaces.
- [x] Switch updates active context and subsequent API calls.
- [x] Invalid target does not disclose a workspace name or existence.
- [x] Existing platform user can own multiple customer workspaces.
- [x] Responsive screenshots show no overlap in expanded/collapsed/mobile shell.

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

### Deploy checkpoint

No deployment was performed in this checkpoint. When release is explicitly authorized, deploy the nullable preference migration and API first, verify workspace listing/switching with two internal companies, and deploy the web selector afterward. Monitor generic workspace-switch 404s and session resolution without logging tenant names or customer payloads. Barbieri remains untouched.

### Rollback

The selector can be rolled back independently from the API. User.lastWorkspaceId is nullable and only a convenience preference; AuthSession.activeWorkspaceId remains authoritative and every preference is revalidated against a live membership before use. A rollback may stop reading/writing the preference without dropping the column immediately.

### Implementation checkpoint - 2026-07-14

- Private provisioning reuses an existing identity by normalized email without changing its password, name or authentication provider; new identities still require an initial password.
- Workspace and owner membership creation are atomic, and the provisioning path rejects an existing owner before adding another.
- Workspace list entries now carry the role-derived capability set used by the product shell.
- New sessions select only a valid session target, a valid saved preference or a deterministic single membership; multiple memberships never fall back to the first row.
- Switching updates the current session and user preference atomically after membership validation. Unauthorized and nonexistent targets retain the same generic response.
- The web selector renders only the authenticated API list, stays hidden in support mode, refreshes server data after switching and returns a generic client error without tenant disclosure.
- Chrome visual QA passed at 1440 x 1000 and 390 x 844 with expanded, open, collapsed and mobile selector states, including long company names and no horizontal overflow.
- Local validation: 60 shared tests, 592 API tests and 128 web tests passed; all package typechecks, Prisma validate, normal Prisma Client generation, direct Nest build, Next production build and git diff --check passed.
- The root Turbo build retriggered Prisma generation and encountered the known Windows DLL rename lock after generation had already succeeded; the API and web production builds both passed independently with the validated client.
- Commit `05c2a43` was pushed and the disabled-email deployment succeeded. The first SMTP-enabled rollout exposed a Nodemailer default-import incompatibility in the production CommonJS build; the API exited before serving traffic and Docker Swarm completed its automatic rollback. No email was sent, and the active Barbieri OAuth, assets, reporting, CAPI and n8n runtime remained unchanged.
- The transport hotfix uses the CommonJS-safe named `createTransport` import and adds a subprocess regression test through `ts-node/register/transpile-only`, matching the production module format that Vitest previously masked. The complete API suite, direct TypeScript check, Nest build and a smoke test against the compiled `dist` transport passed locally.

## 6. Wave 3 - Role Matrix and Delegated Team Management

Purpose: separate owner, operational admin, delegated team manager and analyst authority.

### Schema

- [x] Add WorkspaceMember.canManageMembers with default false.
- [x] Preserve owner/admin/member enum compatibility; expose member as Analyst in product copy.
- [x] Add constraints/service invariants for exactly one effective owner.

### Authorization

- [x] Centralize workspace permissions in one policy service.
- [x] Define capabilities:
  - viewReports;
  - exportReports;
  - manageIntegrations;
  - manageWorkspaceSettings;
  - manageMembers;
  - grantMemberManager;
  - manageBilling;
  - transferOwnership.
- [x] Replace checks that infer permission only from role.
- [x] Ensure regular Admin cannot invite or change members.
- [x] Ensure delegated Admin cannot affect owner or another delegated Admin.

### API

- [x] Add member role update endpoint.
- [x] Add member removal endpoint.
- [x] Add owner-only delegated management toggle.
- [x] Add invitation resend and revoke endpoints.
- [x] Prevent self-removal when it would leave no owner.
- [x] Audit invitation, role, capability and removal changes.
- [x] Revoke affected active sessions immediately after membership removal.

### Web

- [x] Rebuild Settings > Team around members and invitations.
- [x] Use permission-aware actions and confirmations.
- [x] Label roles Owner, Administrador and Analista.
- [x] Expose Gerenciar equipe as an owner-controlled Admin toggle.
- [x] Keep billing and ownership controls out of non-owner HTML.

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

- [x] Owner: all workspace/team/billing capabilities.
- [x] Regular Admin: operations/integrations, no team/billing/ownership.
- [x] Delegated Admin: allowed team actions only.
- [x] Analyst: read-only product access.
- [x] Delegated Admin cannot grant canManageMembers.
- [x] Delegated Admin cannot alter owner or peer team manager.
- [x] Role is isolated per workspace for the same user.

### Acceptance

The approved matrix is enforced by API tests, not only by hidden buttons.

### Deploy checkpoint

No deployment was performed in this checkpoint. When release is explicitly authorized, deploy the delegated-team migration and API before the web interface, verify the canonical owner and role matrix in an internal workspace, and only then expose team actions to customer owners. Barbieri remains untouched.

### Rollback

The web controls and API endpoints can be rolled back without dropping the backward-compatible capability field. The new column defaults to false, while Owner authority continues to derive from the canonical role. Keep the column and owner uniqueness guard in place during an application rollback to avoid losing the security invariant.

### Implementation checkpoint - 2026-07-14

- WorkspaceMember now carries a per-workspace delegated-management flag restricted to Admin memberships; the migration fails closed if historical workspaces do not have exactly one Owner and prevents a second Owner.
- WorkspaceAccessPolicyService derives reporting, export, integration, workspace, team, billing and ownership capabilities from the current membership. Customer controllers no longer infer mutable authority directly from role.
- Owner can delegate team management to an Admin. Regular Admin cannot mutate the team, and delegated Admin cannot grant delegation or affect the Owner or another delegated manager.
- Member role updates, member removal, invitation resend and invitation revocation are workspace-scoped, audited and return generic not-found results for cross-workspace identifiers.
- Removing a membership revokes sessions active in that workspace and clears a matching last-workspace preference without affecting the user's other companies.
- Settings > Team renders Owner, Administrador and Analista labels, permission-aware role/delegation/removal actions, confirmations and invitation lifecycle controls. Unauthorized controls are absent from the HTML.
- Chrome/Playwright visual QA passed at 1440 x 1000 and 390 x 844 with long emails, delegated-management controls and invitation states. Both viewports had zero horizontal overflow.
- Local validation: 60 shared tests, 610 API tests and 130 web tests passed; all package typechecks, Prisma validate, direct Nest build, Next production build and git diff --check passed.
- The normal API package build retriggered Prisma generation and encountered the known Windows DLL rename lock while local servers held the generated engine. Prisma validation, API typecheck and direct Nest production compilation all passed with the already-generated client.
- No push or production deploy was performed. The active Barbieri OAuth, assets, reporting, CAPI and n8n runtime were not changed.

## 7. Wave 4 - SMTP Infrastructure with Brevo

Purpose: implement a reusable, observable transactional email delivery path.

### Dependencies and module

- [x] Add nodemailer and its TypeScript types to apps/api.
- [x] Create EmailModule with:
  - transport factory;
  - message renderer;
  - queue producer;
  - BullMQ processor;
  - redacted delivery audit.
- [x] Use smtp-relay.brevo.com, port 587 and STARTTLS in production configuration.
- [x] Configure sender noreply@rastrack.app and reply-to suporte@rastrack.app.
- [x] Add a fake/in-memory transport for tests.

### Queue behavior

- [x] Assign deterministic idempotency keys per email action token/version.
- [x] Retry transient failures with bounded exponential backoff.
- [x] Do not retry permanent recipient/configuration failures forever.
- [x] Record queued, sent and failed states without tokenized links or message bodies.
- [x] Add a health check that verifies configuration shape without sending email.

### Templates

- [x] Shared responsive HTML/text shell.
- [x] Workspace invitation.
- [x] Password reset.
- [x] Email verification.
- [x] Safe absolute links derived from validated WEB_ORIGIN.

### Tests

- [x] Correct sender and reply-to.
- [x] HTML and text alternatives.
- [x] No secret or raw token in logs/jobs/audit assertions.
- [x] Retry classification.
- [x] Invalid production URL/config fails startup.

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

### Implementation checkpoint - 2026-07-14

- Wave 4 code is complete locally. No SMTP credential was added, no message was sent and `EMAIL_PROVIDER` remains disabled by default.
- `EmailModule` now owns configuration, responsive HTML/text rendering, encrypted BullMQ envelopes, deterministic delivery IDs, the Brevo/Nodemailer transport, bounded retries, permanent-failure handling, redacted audit records and configuration-only health reporting.
- The three templates are workspace invitation, password reset and email verification. Links are built only from the validated `WEB_ORIGIN` and fixed application paths.
- Recipient, tokenized URL, template data and rendered content are AES-256-GCM encrypted before entering Redis. Workspace scope, template and recipient hash are authenticated as associated data. A tampered job is rejected without trusting its workspace for audit scope.
- The envelope key is derived with HKDF from the Brevo SMTP key. `SMTP_PASSWORD` rotation must happen only after the `transactional-email` queue is drained; the deploy runbook records this rule.
- Production SMTP configuration is pinned to `smtp-relay.brevo.com:587`, mandatory STARTTLS, `noreply@rastrack.app` and reply-to `suporte@rastrack.app`. The SMTP password must be a Brevo SMTP key, not an API key.
- `/health/ready` now reports `email: disabled`, `email: ok` or `email: error` without opening an SMTP connection or exposing credentials. Disabled email does not degrade readiness.
- Focused email/configuration/health tests passed. Full local validation passed with 60 shared tests, 633 API tests and 130 web tests; shared/API/web typechecks, Prisma validate, direct Nest production build and `git diff --check` passed.
- The existing auth and workspace flows are intentionally not wired to the queue in this wave. Password reset and verification delivery belong to Wave 5; invitation delivery and onboarding belong to Wave 6.
- Production SMTP verification and a controlled external delivery were completed on 2026-07-14. Brevo authentication returned `SMTP_VERIFY_OK`; the compiled WppTrack transport reported one accepted and zero rejected recipients, and receipt was confirmed in the destination mailbox.
- Outbound transactional email infrastructure is accepted. Public invitation/reset/verification rollout remains blocked until the inbound mailbox for `suporte@rastrack.app` is configured so the production reply-to address can receive responses.
- No push or production deploy was performed. The active Barbieri OAuth, assets, reporting, CAPI and n8n runtime were not changed.

## 8. Wave 5 - Password Reset and Email Verification Delivery

Purpose: connect the existing secure action-token foundation to real email.

### Password reset

- [x] Queue a reset email only when the normalized email maps to an eligible user.
- [x] Always return the same generic response.
- [x] Apply IP and email-fingerprint rate limits.
- [x] Preserve 30-minute expiry and one-time consumption.
- [x] Revoke other reset tokens after a successful password change.
- [x] Revoke active sessions according to the selected security policy, keeping the completing session behavior explicit.

### Verification

- [x] Queue verification email when required.
- [x] Preserve 24-hour expiry.
- [x] Resend with token rotation and rate limits.
- [x] Mark invitation email as verified when invitation onboarding succeeds.

### Tests

- [x] Known and unknown email responses are indistinguishable.
- [x] Expired, used and rotated links fail generically.
- [x] No token is exposed unless the existing explicit development-only flag is enabled outside production.
- [x] Successful reset invalidates the expected sessions/tokens.

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

### Implementation checkpoint - 2026-07-14

- Password reset and verification now enqueue encrypted transactional email envelopes through the accepted Brevo transport. The raw action token exists only before envelope encryption and is never returned in production, logged or persisted in audit data.
- Password reset responses are identical for eligible and unknown emails in production. Limits use source IP plus a hash of the normalized email, without storing the raw attempted address.
- Reset tokens expire after 30 minutes, verification tokens after 24 hours, both are one-time, and issuing a replacement invalidates the previous active token.
- A successful password reset atomically consumes the token, rotates all other reset tokens and revokes every active session for the identity. The public reset flow has no completing authenticated session to preserve.
- Verification resend is rate-limited and rotates the token. Invitation onboarding sets `emailVerifiedAt` because possession of the delivered invitation token verifies the invited address.
- The web always presents a generic forgot-password response and generic invalid/expired/used link states.
- No production deploy of Wave 5 was performed. Deploy the API before the web, then test forgot-password and verification with an internal identity. The inbound mailbox for `suporte@rastrack.app` remains an operational follow-up for customer replies, not an outbound SMTP code dependency.

## 9. Wave 6 - Complete Invitation Onboarding

Purpose: turn current invitation records into a complete closed-registration flow.

### API

- [x] Add minimal public invitation inspection by raw token.
- [x] Return generic invalid state for expired/revoked/unknown tokens.
- [x] Preserve only minimum display data for a valid token.
- [x] Add new-user invite acceptance:
  - validate token and email;
  - hash password;
  - create user;
  - mark email verified;
  - create membership;
  - accept invite;
  - create/authenticate session;
  - activate invited workspace;
  - commit atomically.
- [x] Add existing-user acceptance after authentication with matching normalized email.
- [x] Rotate token on resend and invalidate prior token.
- [x] Update status for queued/sent/failed/accepted/revoked/expired.

### Web

- [x] Make invite route accessible before app authentication.
- [x] Show login continuation for existing users.
- [x] Show name/password form for new users.
- [x] Handle expired/revoked links with a generic support-oriented state.
- [x] Land accepted users in the invited workspace.

### Tests

- [x] New user acceptance.
- [x] Existing user acceptance.
- [x] Email mismatch.
- [x] Expired, used, revoked and superseded tokens.
- [x] Concurrent acceptance creates one membership.
- [x] Invite cannot grant owner or delegated manager through a crafted payload.
- [x] Accepting workspace B does not leak workspace A.

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

### Implementation checkpoint - 2026-07-14

- Invitations no longer expose raw acceptance tokens in API responses. Creation and resend enqueue the token only inside the encrypted email envelope; resend replaces the stored hash and invalidates the old link.
- Public inspection returns only a generic invalid state or the workspace name, masked email, invited role, required account path and expiry. It never returns user IDs, workspace IDs, full email or membership data.
- Existing identities must authenticate with the normalized invited email. Login preserves a validated same-origin `redirectTo` and returns the user to the invitation.
- New-user acceptance is closed-registration only: the valid invitation token supplies the immutable email, and one transaction claims the invite, hashes the password, creates or completes the identity, verifies the email, creates the membership, creates the session and activates the invited workspace.
- Conditional `updateMany` claims make token and invitation consumption one-time under concurrent requests. Owner and delegated-manager grants are rejected by both shared contracts and service validation.
- Delivery lifecycle now distinguishes pending, sent, failed, accepted, revoked and expired. Authenticated email job metadata is versioned by invite expiry so an old delivery job cannot update a resent invitation.
- The public `/invite/accept` route and legacy redirect were validated at 1440 x 1000 and 390 x 844. Invalid, login and account-creation states had no horizontal overflow and did not disclose protected tenant data.
- Final local validation passed with 60 shared tests, 643 API tests and 132 web tests; all package typechecks, Prisma format/validate, direct Nest production build, Next production build, Prettier and `git diff --check` passed.
- No production deploy of Wave 6 was performed. Deploy the enum migration first, then API/email processor, then web. Verify create, sent, resend, existing-user acceptance and new-user acceptance with an internal workspace before inviting a customer.
- For application rollback to code that does not understand `sent` and `failed`, first normalize active rows back to `pending`; keep the additive PostgreSQL enum values in place because enum value removal is destructive.

## 9.1 Wave 6B - Secure Client Owner Activation

Purpose: complete private client provisioning without creating or emailing a
plaintext initial password.

### API and data

- [x] Add a one-time `account_activation` action token scoped to the provisioned workspace.
- [x] Provision a new responsible owner without a password and without marking the email verified.
- [x] Queue a seven-day activation email after the workspace transaction succeeds.
- [x] Preserve credentials for an existing identity and send a workspace-access notice instead.
- [x] Activate password, email verification, token consumption, session and active workspace atomically.
- [x] Add an audited resend endpoint that rotates outstanding activation links.
- [x] Return delivery state to the backoffice without exposing token or password.

### Web

- [x] Remove the initial-password field from private client provisioning.
- [x] Add a public create-password activation route with generic invalid-link handling.
- [x] Add resend-access action and delivery feedback to the client backoffice.

### Tests and security

- [x] New owner receives activation rather than a password.
- [x] Existing identity keeps its password and receives only an access notice.
- [x] Used, expired, superseded and unauthorized activation links fail generically.
- [x] Concurrent activation creates one session and consumes the token once.
- [x] Activation lands only in the workspace bound to the token.
- [x] No API response, audit record or log contains a usable token or plaintext password.

### Rollout

Deploy the additive migration and API first, then the web. An older web may
still send `ownerPassword`; the API schema strips it and never persists it.
Email failure leaves a valid owner membership so the platform operator can use
the resend action after delivery recovers.

### Implementation checkpoint - 2026-07-14

- New client owners now receive a seven-day, one-time activation link and create
  their own password. Existing identities keep their credentials and receive an
  access notice for the new workspace.
- Provisioning and resend return only delivery state. Tokens are encrypted in
  queued email payloads, stored only as hashes and excluded from API responses,
  logs and audits.
- Activation revalidates the owner membership before password hashing and again
  inside the transaction. Password creation, email verification, token claim,
  audit, session creation and active-workspace selection are atomic.
- Validation passed with 60 shared tests, 655 API tests and 134 web tests, all
  package typechecks, Prisma schema validation, direct Nest production build,
  Next production build and `git diff --check`.
- The activation page was visually checked at desktop and 390 x 844 mobile. The
  mobile document width remained 390 pixels with no horizontal overflow.
- Production rollout remains pending. Apply the additive migration and deploy
  the API/email processor first, then deploy the web application.

## 10. Wave 7 - Google Feature Gate

Purpose: keep Google available in code while disabled in the current SaaS.

### Tasks

- [x] Hide the Google button when AUTH_GOOGLE_ENABLED=false.
- [x] Reject both OAuth start and callback server-side when disabled.
- [x] Require verified Google email.
- [ ] Permit login only for an existing user or a valid invited identity according to the invitation flow.
- [ ] Never create a workspace from Google OAuth.

### Tests

- [x] Button absent and routes blocked when disabled.
- [x] Existing user login when enabled.
- [x] Unverified email rejected.
- [ ] Unknown, uninvited email rejected.
- [ ] No workspace auto-provisioning.

### Acceptance

The current SaaS remains email/password-first. The frontend and backend both reject Google while the flag is disabled.

## 11. Wave 8 - Normalized Meta Schema Beside Legacy

Purpose: introduce the new connection model without moving existing production execution.

### Schema

- [x] Add MetaCredential.
- [x] Add MetaBusinessConnection.
- [x] Add MetaConversionDestination.
- [x] Add/normalize MetaReportingAccount linked to business connection.
- [x] Add default destination on business connection.
- [x] Add optional destination override on reporting account.
- [x] Add status, validation, creator, rotation and timestamps.
- [x] Add unique constraints scoped by workspace.
- [x] Add indexes for workspace, business connection, ad account and destination resolution.
- [x] Keep legacy MetaIntegration and capiAccessTokenEncrypted fields intact.

### Encryption

- [x] Reuse or evolve MetaTokenEncryptionService with key versioning and authenticated encryption.
- [x] Add token fingerprint that cannot recover the token.
- [x] Refuse plaintext readback.
- [x] Redact validation errors and Graph request metadata.

### Compatibility adapter

- [x] Add a MetaConnectionResolver that can resolve legacy or normalized configuration.
- [x] Legacy remains first for existing OAuth workspaces.
- [x] New manual connections use normalized tables.
- [x] Build a no-write compatibility projection for Barbieri metadata.
- [x] Do not copy, decrypt/re-encrypt, rotate or replace the Barbieri token in this wave.

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

- [x] Workspace-scoped uniqueness and isolation.
- [x] Token cannot be read after save.
- [x] New manual connection resolves normalized path.
- [x] Existing OAuth fixture resolves legacy path exactly as before.
- [x] Barbieri-compatible fixture produces identical reporting/CAPI inputs without writes.

### Acceptance

The schema is deployed with no runtime cutover and no change to existing workspaces.

### Deploy checkpoint

Migration first, then API with feature path disabled for normal users. Verify current Meta sync and CAPI health before exposing manual setup.

## 12. Wave 9 - Guided Manual Quick Setup

Purpose: support the common one-token, one-BM, one-destination structure.

### API

- [x] Add owner/admin-only endpoint to submit one permanent system-user token.
- [x] Encrypt immediately and discard plaintext request state.
- [x] Validate token identity, scopes and accessible businesses.
- [x] Select one advertiser BM.
- [x] Discover and select allowed ad accounts.
- [x] Discover/validate one Pixel/Dataset and one Facebook Page.
- [x] Validate that the token can access required assets.
- [x] Persist one MetaCredential, MetaBusinessConnection, destination and account mappings atomically.
- [x] Use the same credential for Marketing API and CAPI.
- [x] Add a non-destructive connection test.

### Web

- [x] Keep OAuth card first and marked recommended.
- [x] Add permanent-token alternative.
- [x] After token selection, offer Quick and Advanced.
- [x] Implement Quick guided steps:
  - token;
  - BM;
  - accounts;
  - Pixel/Dataset and Page;
  - review;
  - validate/activate.
- [x] Explain that the token is stored encrypted and cannot be displayed later.
- [x] Do not expose backend/internal terminology when a user-facing label is clearer.

### Tests

- [x] Invalid/revoked token.
- [x] Missing required permissions.
- [x] Token cannot access selected BM/account/destination.
- [x] Pixel without Page is rejected.
- [x] Secret redaction in API, HTML and logs.
- [x] Analyst cannot create connection.
- [x] OAuth remains first and unchanged.

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

- [x] Allow several MetaCredentials per workspace.
- [x] Associate each advertiser BM connection with its exact credential.
- [x] Allow one reusable destination to be referenced by several business connections.
- [x] Support owner/matrix BM metadata for shared destinations.
- [x] Support dedicated destination per BM.
- [x] Support account-level destination override.
- [x] Validate the active connection credential's access to shared assets before association.
- [x] Add rotate-token operation:
  - accept replacement once;
  - validate before activation;
  - atomically swap encrypted credential;
  - preserve prior encrypted version only for bounded rollback if security policy permits;
  - audit rotation without secret.
- [x] Add pause rules that protect active jobs and CAPI routing.
- [x] Keep destructive disconnect unavailable in this rollout; pause/reactivate preserves mappings and audit history.
- [x] Add per-connection health and last successful validation/sync.

### Web

- [x] Advanced connection list by BM.
- [x] Add token/BM connection.
- [x] Manage default destination.
- [x] Reuse an existing validated shared destination.
- [x] Override destination per account.
- [x] Show health and affected accounts.
- [x] Require explicit confirmation for rotate and pause.
- [x] Keep the quick setup concise; advanced controls appear only after choosing Advanced.

### Tests

- [x] Two BMs with two tokens and one shared destination.
- [x] Two BMs with dedicated destinations.
- [x] Account override supersedes BM default.
- [x] Credential from BM A cannot operate inaccessible BM B assets.
- [x] Token failure isolates only its business connection.
- [x] Ambiguous or missing mapping blocks.
- [x] Cross-workspace destination/credential IDs are rejected generically.

### Acceptance

Both approved client patterns work:

1. matrix BM owns Pixel/Page shared to rotating advertiser BMs;
2. each BM has its own Pixel/Page.

## 14. Wave 11 - Exact Reporting and CAPI Routing

Purpose: make the normalized model operational without guessing and without disturbing current production.

### Reporting

- [x] Every reporting sync job carries workspaceId, businessConnectionId and reportingAccountId.
- [x] Resolve the exact credential from the business connection.
- [x] Validate all referenced IDs again in the worker.
- [x] Scope snapshots and retries by connection.
- [x] Mark only affected accounts when a token fails.

### CAPI

- [x] Resolve event attribution to reporting account/business connection.
- [x] Resolve account override or connection default destination.
- [x] Use the same connection credential for the CAPI call.
- [x] Block missing or ambiguous attribution with an actionable audit status.
- [x] Persist selected connection/destination IDs with the event delivery audit.
- [x] Preserve current event_id and cutover semantics.
- [x] Never replay historical shadow/not_eligible events.

### Shadow comparison

- [x] For existing OAuth workspaces, compute normalized routing in shadow without changing the actual request.
- [x] Compare selected account, credential identity fingerprint, Pixel/Dataset and Page.
- [x] Record only redacted parity results.
- [x] Require a sustained parity window before any migration proposal.
- [x] Keep Barbieri actual execution on legacy-compatible path.

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
