# Guimo CRM

The backend supports the first Guimo CRM slice: an owner provisions a
workspace-scoped integration, Guimo sends a stage-movement webhook, and the
worker can record a `QualifiedLead` or `Purchase` conversion for an existing
workspace lead.

## Provisioning

`POST /workspaces/:workspaceId/guimo/integrations` is owner-protected. It
accepts configured qualified/purchase stage IDs or names and only the CRM
credential headers `authorization` and `x-api-key`. Credentials are encrypted
at rest with AES-256-GCM; the returned webhook token is shown once and only its
hash is stored.

Set `GUIMO_CRM_ENCRYPTION_KEY` to a Base64-encoded 32-byte key before
provisioning credentials. Missing or invalid key material leaves the
integration `blocked`; credentials are never logged.

## Webhook contract

Guimo's webhook integration only lets a user configure a target URL — it
cannot send a custom header, CRM `Authorization`/`X-API-Key`, or any other
out-of-band secret. So Guimo calls `POST /webhooks/guimo/v1/:integrationId`
with the one-time webhook token as a `token` query-string parameter on that
same URL (`?token=...`), which the response's `webhookUrl`/`webhookPath`
already embeds — there is no separate value to configure or send. Version 1
accepts only the observed movement fields:

- `id_negociacao`
- `id_contato`
- `estagio_novo.id` and `estagio_novo.nome`
- optional `estagio_anterior.id` and `estagio_anterior.nome`

The public endpoint returns `404` for an unknown integration, bad token, or a
rate-limited bad-token path. Bad-token attempts are durably limited per
workspace/integration. Accepted events are persisted before queueing; a retry
repairs an accepted or failed event that was not queued, while a processed or
successfully queued duplicate is not re-enqueued.

**Security tradeoff.** The token is a 256-bit random value (32 bytes,
base64url) hashed with SHA-256 at rest and compared with a constant-time
check — the same strength as the previous header-based token, just carried
in the URL instead. Moving it into the query string is a deliberate,
user-confirmed tradeoff to match what Guimo can actually send (URL only, no
headers): query strings are more likely than headers to be captured by
proxy/access logs, browser history, or `Referer` headers than a header would
be. The webhook path itself does not log the URL, and the token must be
treated as a bearer secret end-to-end (HTTPS only, never pasted into
non-secure notes/tickets). This mirrors the existing `?token=` pattern
already used by this codebase's other URL-only inbound webhooks
(`/webhooks/inbound/:connectionId`).

The provisional idempotency key includes workspace, integration, negotiation,
contact, and destination stage. Guimo v1 does not expose a native movement ID,
so a legitimate later re-entry into the same stage for the same integration is
still indistinguishable from a duplicate.

## Processing and boundaries

The worker decrypts CRM headers, obtains the contact and (for purchase) the
negotiation value, resolves the normalized phone only inside the workspace, and
records the conversion through the existing conversion-event flow. Operational
records use redacted summaries. Guimo configuration, webhook events, and
bad-token limiter state are included in Client Swap cleanup; authentication,
billing, and audit records are retained.
