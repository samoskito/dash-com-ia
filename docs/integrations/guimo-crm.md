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

Guimo calls `POST /webhooks/guimo/v1/:integrationId` with
`x-wpptrack-webhook-token`. Version 1 accepts only the observed movement
fields:

- `id_negociacao`
- `id_contato`
- `estagio_novo.id` and `estagio_novo.nome`
- optional `estagio_anterior.id` and `estagio_anterior.nome`

The public endpoint returns `404` for an unknown integration, bad token, or a
rate-limited bad-token path. Bad-token attempts are durably limited per
workspace/integration. Accepted events are persisted before queueing; a retry
repairs an accepted or failed event that was not queued, while a processed or
successfully queued duplicate is not re-enqueued.

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
