# WppTrack Platform Owner and Client Provisioning Design

Date: 2026-07-11
Status: Approved

## 1. Objective

Allow the WppTrack owner to provision isolated customer accounts from the private backoffice while retaining global, audited support access. Customer administrators must only see their own workspace. Platform operators must not appear as customer team members.

The first real customer workspace will be Barbieri. Its external MySQL connector and imported leads must never share scope with Workspace Teste.

## 2. Platform Roles

Platform authority is persistent in PostgreSQL and independent from workspace membership:

- `platform_owner`: system owner with full platform administration and authority to manage other platform operators.
- `platform_operator`: internal operator with delegated backoffice access.
- `null`: customer user with access controlled exclusively by workspace membership.

The existing environment allowlist remains a backward-compatible bootstrap path. The existing master account is promoted to `platform_owner` during the controlled production bootstrap.

## 3. Customer Provisioning

The private backoffice provisions a customer atomically:

1. Create a workspace with a unique slug.
2. Create the first customer user with email/password authentication.
3. Add that user as the workspace `owner`.
4. Record an audit trail without storing the plaintext password.

An email already registered in WppTrack is rejected during this first slice to avoid accidental account takeover or password replacement. Team members continue to be invited by the customer owner/admin from Settings.

## 4. Global Support Access

Platform operators do not receive hidden or visible workspace memberships. Instead, a platform operator can start an audited support context for one workspace in the current authentication session.

While active:

- the normal customer dashboard resolves the selected workspace first;
- API authorization still validates the operator's persistent platform role;
- the shell clearly identifies that support access is active;
- leaving support mode restores the operator's own workspace;
- the customer member list remains unchanged.

The selected workspace is stored per authentication session, so parallel browser sessions can inspect different customers without changing global user state.

## 5. External Connector Operations

The backoffice lists, creates, tests and synchronizes external MySQL connectors by workspace. Passwords are submitted only over HTTPS to the API, encrypted with AES-256-GCM, omitted from responses and never rendered again.

Initial connector defaults:

- provider `kinbox_mysql`;
- SSL mode `required`;
- shadow mode enabled;
- automatic synchronization disabled until the connection test succeeds;
- CAPI sending disabled until reconciliation is approved.

The Barbieri connector uses the dedicated read-only MySQL user and the network allowlist already configured for the WppTrack API server.

## 6. Security and Audit

- Only `platform_owner` and authorized platform admins can use provisioning and connector endpoints.
- Only `platform_owner` can grant or revoke platform roles.
- Customer passwords and MySQL passwords never appear in audit summaries, API responses or logs.
- Provisioning, support entry/exit, connector creation, connection tests and sync requests are audited.
- Workspace status and tenancy checks remain enforced while support mode is active.
- Public self-registration remains disabled.

## 7. Acceptance Criteria

- The existing master user has persistent `platform_owner` authority.
- A Barbieri workspace and its first owner can be created from the private backoffice.
- Barbieri's owner sees only Barbieri data and can invite their own team.
- The platform owner can enter and exit Barbieri support context without appearing as a member.
- The MySQL connector can be saved, tested and synchronized without exposing credentials.
- Automated tests cover tenant isolation, role restrictions, support-session scope, atomic provisioning and secret redaction.
