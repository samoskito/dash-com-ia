# WppTrack Access, Transactional Email and Meta Connections Design

Date: 2026-07-13
Status: Approved for implementation planning

## 1. Objective

Evolve WppTrack in three coordinated areas without interrupting the production account that is already operating:

1. secure multi-workspace access, invitations and delegated team management;
2. transactional email for invitations, password recovery and email verification;
3. a guided Meta connection model that supports the current OAuth flow and manual permanent tokens, from a simple setup to multi-BM structures.

This document records the product and architecture decisions approved during brainstorming. It does not authorize a production cutover by itself.

## 2. Non-Negotiable Guarantees

### 2.1 Barbieri remains untouched

The current Barbieri Meta OAuth connection is already active and working. During the initial implementation:

- do not ask the operator to reconnect Meta;
- do not replace or rotate its token;
- do not change its selected BM, ad accounts, Pixel/Dataset or Page;
- do not change its CAPI destination;
- do not move its reporting or CAPI execution to a new runtime path;
- do not interrupt the active conversation_started cutover;
- do not require any action in the Barbieri workspace.

The new connection model must be introduced beside the legacy-compatible path. New manual connections may use the new model first. Barbieri can only be migrated after compatibility has been proven in shadow comparison and a separate explicit checkpoint is approved.

### 2.2 Tenant confidentiality

A user who does not belong to a workspace must not:

- see it in a selector, list, search result or API response;
- infer that it exists from different error messages;
- access its IDs, data, exports, files, jobs or cached results;
- activate it by changing a URL, cookie, body field or request header.

The backend is the authority for workspace context. The frontend is never trusted to establish tenancy.

### 2.3 Closed registration

There is no public signup flow. Accounts enter the platform only through:

- private platform-owner provisioning; or
- a valid workspace invitation.

Google login must not create a public account or a workspace.

### 2.4 One manual Meta token, two uses

For a manual Meta connection, the permanent system-user token is the same credential used for:

- Marketing API access, including BMs, ad accounts, campaigns and reporting;
- Conversion API delivery to the selected Pixel/Dataset.

There is no separate manual CAPI token field. A client may have several permanent tokens, commonly one token per advertiser BM, to isolate structures and rotations.

## 3. Current State and Gaps

The repository already contains useful foundations:

- password reset and verification tokens are hashed and persisted;
- workspace invitation tokens are hashed and expire after seven days;
- Google OAuth routes and UI exist;
- a user can have several WorkspaceMember rows;
- Meta OAuth, reporting, asset selection and CAPI are already operational;
- platform-owner support context is stored per session and audited;
- BullMQ, AuditLog, IntegrationLog and JobAttempt are available.

The missing or incomplete behavior is:

- EMAIL_PROVIDER only changes the response label; no email is actually delivered;
- the invitation UI discards the usable invitation link;
- a person without an account cannot complete invite onboarding;
- invite resend, revoke, member removal and role changes are absent;
- owner and admin permissions are too close to each other;
- the session resolves the first membership instead of an explicit active workspace;
- there is no workspace selector for a normal multi-workspace user;
- Google login is always presented instead of being edition-configurable;
- Meta assumes a single OAuth-oriented integration and a single conversion destination per workspace;
- the current standalone CAPI token field conflicts with the approved manual-token contract.

## 4. Identity and Workspace Model

### 4.1 Global identity, local authority

User is a global identity. WorkspaceMember is the complete source of customer-workspace authority.

A single user may:

- own company A;
- administer company B;
- be an analyst in company C.

Roles and capabilities never leak from one membership to another.

### 4.2 Canonical roles

Each workspace has exactly one canonical owner at a time.

**Owner**

- full workspace authority;
- manages billing and ownership transfer;
- manages integrations and operational settings;
- manages all ordinary members;
- can grant or revoke delegated team management;
- is the only role allowed to affect another delegated team manager.

**Admin**

- manages Meta, WhatsApp, external sources and operational settings;
- can run syncs and operational actions;
- can view reports, leads, events and exports;
- cannot manage billing or ownership;
- cannot manage members unless delegated team management is explicitly enabled on that membership.

**Analyst**

- reads reports, leads, event audit and allowed exports;
- may use non-destructive filters and views;
- cannot change integrations, workspace settings, team, billing or ownership.

The existing member role becomes the product-facing Analyst role. Database enum renaming is optional and should be avoided if it creates unnecessary migration risk; the contract can map member to analyst.

### 4.3 Delegated team manager

Team management is a capability on an Admin membership, not another owner and not a new global role.

An Admin with canManageMembers may:

- invite regular admins and analysts;
- resend or revoke invitations it is allowed to manage;
- remove or change the role of ordinary admins and analysts.

It may not:

- invite or promote an owner;
- transfer ownership;
- grant or revoke canManageMembers;
- modify or remove the owner;
- modify or remove another delegated team manager;
- access billing or platform-owner functions.

Only the owner can grant or revoke canManageMembers.

### 4.4 Active workspace

AuthSession receives activeWorkspaceId. After login, the server selects:

1. the last valid workspace used by that session/user;
2. otherwise the first valid membership by a deterministic rule;
3. otherwise no customer workspace.

Accepting an invitation activates the invited workspace. Removing a membership invalidates that workspace in affected sessions and forces a safe re-resolution.

The existing platform support workspace remains a separate concept. It must not create hidden customer memberships and must continue to show an explicit support banner and audit entry.

### 4.5 Workspace selector

The application shell lists only workspaces returned from the authenticated user's active memberships. It displays the current role for clarity.

Switching workspace:

- submits only a target ID;
- verifies active membership server-side;
- updates activeWorkspaceId server-side;
- refreshes the app from server state;
- records an audit event;
- returns a generic not-found response when unauthorized.

The target workspace must never be accepted merely because the ID exists.

## 5. Tenant Isolation Architecture

A central WorkspaceContextService resolves the effective workspace for every customer request. Customer services must receive the resolved context or use a guard/decorator that guarantees it.

Required controls:

- every Prisma customer-data query includes workspaceId;
- route parameters are subordinate resources, never tenancy authorities;
- caches include workspaceId and relevant permission context in their key;
- BullMQ payloads carry the exact workspace and connection IDs selected by the server;
- workers revalidate ownership before side effects;
- exports and temporary files are namespaced by workspace;
- logs avoid full phones, credentials, tokens and customer payloads;
- unauthorized and nonexistent cross-tenant resources share the same 404 behavior;
- support access stays on its audited platform path.

Automated tests must use at least two users and two workspaces and attempt ID swapping across reads, writes, exports, invitations, jobs and Meta resources.

## 6. Invitation and Team Lifecycle

### 6.1 Invitation flow

1. An authorized owner or delegated team manager enters email and allowed role.
2. The API normalizes the email and creates a one-time, hashed invitation token.
3. A transactional email is queued.
4. The recipient opens the public invite route.
5. The server validates token hash, expiry, revocation, workspace and email binding.
6. Existing users authenticate without creating a duplicate identity.
7. New users set name and password; their verified invitation email becomes verified.
8. Membership creation and invitation acceptance happen atomically.
9. The invited workspace becomes active.

The public invite inspection response exposes only the minimum information required for onboarding. Invalid, expired or revoked tokens use a generic terminal state.

### 6.2 Invitation states

The product exposes:

- Pending;
- Sent;
- Failed;
- Accepted;
- Revoked;
- Expired.

Resend rotates the token and invalidates the prior link. Revocation is immediate. Invitation links expire after seven days.

### 6.3 Member management

Settings must support:

- list members and pending invitations;
- invite;
- resend;
- revoke;
- change allowed role;
- grant/revoke delegated team management, owner only;
- remove member;
- display permission-aware disabled states.

Owner transfer is a separate high-risk operation and not required in the first delivery wave. The database must still preserve the invariant that a workspace cannot be left without an owner.

## 7. Transactional Email

### 7.1 Provider

Use Brevo through SMTP:

- host: smtp-relay.brevo.com;
- port: 587;
- security: STARTTLS;
- sender: noreply@rastrack.app;
- reply-to: suporte@rastrack.app.

The SMTP credential must be a Brevo SMTP key, not an API key.

### 7.2 Configuration

Expected environment variables:

- EMAIL_PROVIDER=smtp;
- SMTP_HOST;
- SMTP_PORT;
- SMTP_SECURE;
- SMTP_USER;
- SMTP_PASSWORD;
- EMAIL_FROM_NAME;
- EMAIL_FROM_ADDRESS;
- EMAIL_REPLY_TO;
- WEB_ORIGIN.

Secrets remain server-side and outside logs, audit metadata and API responses.

### 7.3 Delivery architecture

A shared EmailModule renders and queues transactional messages. A worker sends them with retry and exponential backoff.

Initial templates:

- workspace invitation;
- password reset;
- email verification.

Delivery status may be audited, but the token, link query string, SMTP credential and full rendered sensitive content may not be stored in logs.

### 7.4 Anti-enumeration

Forgot-password always returns a generic success response whether or not the email exists. Rate limits apply by IP and normalized email fingerprint.

Reset links expire after 30 minutes and are one-time. Verification links expire after 24 hours. Successful use revokes other active tokens of the same purpose where appropriate.

## 8. Google Login

Google remains in the codebase but is edition-configurable.

Current SaaS:

- AUTH_GOOGLE_ENABLED=false;
- button hidden;
- start and callback routes reject use when disabled;
- no behavioral change for existing email/password users.

Student edition:

- Google can be enabled with the student's own Google Cloud credentials;
- official setup documentation explains consent screen, allowed origins, callback URL, environment variables and test mode;
- a verified Google email may authenticate an existing or invited identity;
- Google never creates a workspace or enables public registration;
- an unverified Google email is rejected.

## 9. Guided Meta Connection Experience

### 9.1 First decision: connection method

The integration flow starts with:

**Connect with Meta OAuth**

- highlighted and recommended in the current SaaS;
- preserves the existing flow used by approximately 90 percent of current clients;
- remains the only path that can reuse the current OAuth connection without manual credentials.

**Connect with permanent token**

- secondary path for selected clients;
- primary path in the student edition, where OAuth is hidden;
- starts with guided validation before anything is persisted as active.

This is one connection platform with two credential sources, not two independent Meta systems.

### 9.2 Second decision for manual token: setup depth

**Quick setup**

For simple structures:

- one permanent system-user token;
- one advertiser BM;
- one or more ad accounts;
- one Pixel/Dataset and one Facebook Page destination;
- validation and connection test;
- clear summary before activation.

**Advanced setup**

For multi-BM or rotating structures:

- several credentials, commonly one per advertiser BM;
- multiple advertiser BMs and ad accounts;
- reusable shared destinations owned by a matrix BM;
- dedicated destinations per BM where needed;
- account-level destination overrides;
- token health, validation and rotation;
- isolated failures and explicit routing.

Progressive disclosure keeps the common setup simple while preserving the full model underneath.

### 9.3 Edition profile

Use an edition-level capability such as META_CONNECTION_MODES:

- current SaaS: oauth,manual;
- student edition: manual.

The backend enforces enabled modes. Hiding a UI card alone is insufficient.

## 10. Normalized Meta Domain Model

### 10.1 MetaCredential

Stores an encrypted credential and its health metadata:

- workspaceId;
- source: oauth or manual;
- encrypted token;
- token fingerprint for safe identification;
- status and validation timestamps;
- known scopes and expiry, when available;
- createdBy and rotatedAt.

The plaintext token is accepted once and never returned after save.

### 10.2 MetaBusinessConnection

Represents one advertiser BM connection:

- workspaceId;
- credentialId;
- businessManagerId and display name;
- status;
- defaultConversionDestinationId;
- validation and sync metadata.

A workspace may have several active business connections. A manual token normally belongs to the BM it was created for. OAuth may discover several accessible businesses while retaining explicit per-business connections.

### 10.3 MetaConversionDestination

Represents the reusable conversion pair:

- workspaceId;
- Pixel/Dataset ID;
- Facebook Page ID;
- display names;
- optional owner/matrix BM ID;
- validation status.

The product contract treats Pixel/Dataset plus Page as one destination. Several advertiser BMs may reference the same shared destination when Meta access validation succeeds.

### 10.4 MetaReportingAccount

Represents an ad account:

- workspaceId;
- businessConnectionId;
- adAccountId and display name;
- active/reporting status;
- optional conversionDestinationId override.

Without an override, the account uses its business connection's default destination.

### 10.5 Routing rule

For each reporting or conversion operation:

1. resolve workspace from the authenticated server session or trusted queued job;
2. resolve the ad account and exact business connection;
3. select account destination override or business default;
4. use that business connection's credential;
5. validate that the credential can access the required account and destination;
6. execute or block with an actionable error.

Missing or ambiguous mappings must block. The system must never guess a token, BM, account, Pixel or Page.

Jobs carry exact connection IDs. A failed or expired token pauses only its own connection and related jobs.

## 11. Meta Credential and Asset Security

- encrypt tokens at rest with authenticated encryption and key versioning;
- never expose plaintext after creation;
- never log access tokens or Graph URLs containing tokens;
- redact Graph errors before audit storage;
- validate scopes and asset access before activation;
- record creator, validation, rotation and revocation events;
- rate limit validation and asset-discovery calls;
- require owner/admin integration permission for connection changes;
- use confirmation for destructive disconnect or rotation actions;
- block deletion while a connection owns active reporting or CAPI work unless safely reassigned.

## 12. Compatibility and Migration

The current models remain operational while the normalized model is added.

Safe sequence:

1. add new tables and nullable references;
2. add adapters that can read legacy or normalized configuration;
3. create a compatibility record for existing OAuth metadata without changing the secret or destination;
4. keep legacy execution as the source of truth for Barbieri;
5. route new manual connections through the normalized model;
6. shadow-compare OAuth reporting, asset resolution and CAPI routing;
7. prove parity with no token or destination change;
8. schedule a separate, reversible Barbieri checkpoint only after explicit approval.

The current capiAccessTokenEncrypted field is legacy. It may not be deleted until every active workspace has a verified normalized route and rollback coverage.

Where this design conflicts with the single-connection assumptions in docs/superpowers/specs/2026-07-09-wpptrack-meta-multi-account-whatsapp-campaigns-design.md, this document supersedes only those connection, credential and destination assumptions. Existing campaign classification, reporting formulas and event semantics remain unchanged.

## 13. Observability and Failure Handling

The product should display health per Meta business connection:

- Connected;
- Validation required;
- Token expired/revoked;
- Missing permission;
- Destination invalid;
- Paused.

Operational logs use IDs and redacted summaries. Alerts must identify the affected workspace and connection internally without exposing one tenant to another.

Email and Meta operations are idempotent. Retries must not duplicate invitations, memberships, conversion events or destructive changes.

## 14. Delivery Order

The approved order is:

1. tenant isolation and active-workspace foundation;
2. workspace selector and multi-workspace provisioning;
3. role matrix and delegated team management;
4. SMTP and transactional email;
5. password reset, verification and full invitation onboarding;
6. Google feature flag and student guide;
7. normalized Meta schema beside the current connection;
8. guided manual quick setup;
9. advanced multi-BM, multi-token and shared-destination setup;
10. exact reporting/CAPI routing and shadow comparison;
11. edition profiles and complete student documentation;
12. final security review and controlled production rollout.

Barbieri's no-touch guarantee is a gate on every Meta wave.

## 15. Acceptance Criteria

- A user sees only workspaces where it has an active membership.
- Unauthorized workspace IDs return the same generic 404 as nonexistent IDs.
- Login reopens the last valid workspace, and an invite activates the invited workspace.
- Owner, regular Admin, delegated team manager and Analyst match the approved matrix.
- Brevo sends invitation, reset and verification emails from noreply@rastrack.app with reply-to suporte@rastrack.app.
- Invite links support new and existing users, are one-time and can be resent/revoked.
- Public registration remains closed.
- Google is fully rejected when disabled and never auto-provisions a workspace.
- OAuth remains highlighted and unchanged for the current SaaS.
- Manual quick setup supports one token/BM/destination.
- Advanced setup supports multiple tokens/BMs and both shared matrix destinations and dedicated destinations.
- The same permanent manual token is used for allowed Marketing API and CAPI operations.
- Routing never guesses among connections or destinations.
- Tokens never reappear in API/UI/logs after submission.
- Barbieri keeps operating without reconnection or configuration changes.
- Cross-tenant automated tests cover reads, writes, jobs, exports and integrations.

## 16. Final Security Review

After implementation and before broad rollout, perform a dedicated review of:

- Prisma tenant filters and direct database access;
- authentication sessions, cookies and workspace switching;
- authorization policy coverage;
- invitation, reset and verification token lifecycle;
- SMTP and Meta credential storage;
- queues, caches, exports, files and logs;
- rate limits and account/workspace enumeration;
- platform support access and audit trails;
- production headers, TLS and secret management;
- dependency and container exposure.

Security findings block release until resolved or explicitly accepted with a documented mitigation.

## 17. External References

- Brevo SMTP relay: https://developers.brevo.com/docs/smtp-integration
- Meta Marketing API official Postman collection: https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi
