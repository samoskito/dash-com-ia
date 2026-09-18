# Guimo CRM backend slice — operational notes

The public ingress is `POST /webhooks/guimo/v1/:integrationId`, authenticated
only with a `token` query-string parameter on that same URL — Guimo's webhook
integration can only be configured with a target URL, not a custom header,
so the URL itself (as returned in `webhookUrl`/`webhookPath`) is the whole
credential; there is no separate header or out-of-band secret to configure.
The token is generated when the workspace-owned integration is provisioned,
returned once (embedded in the URL and as a standalone value for display),
and retained only as a SHA-256 hash. It is intentionally independent from
CRM credentials.

CRM credentials are accepted only as server-side request headers and encrypted
with AES-256-GCM and fixed Guimo AAD using `GUIMO_CRM_ENCRYPTION_KEY`, which
must be a Base64-encoded 32-byte key; they are never returned, logged, or copied to
conversion payloads. The non-empty allowlist is limited to `Authorization`
and `X-API-Key`; transport headers (`Accept`, `Content-Type`, `Host`, and
`Origin`) cannot be configured. A configuration without an encryption key,
valid credentials, or at least one target stage remains `blocked`.

Stage routing compares configured ID first. If no ID is configured it uses an
exact Unicode/whitespace/case-normalized name; partial matching is forbidden.
The prior stage must not already be the target. The provisional uniqueness key
is `guimo + workspace + integration + negotiation + contact + new-stage-id`; until Guimo
supplies a movement/event identifier, a legitimate later re-entry can be
deduplicated.

Purchase is blocked unless the CRM value is positive and workspace config
explicitly declares both currency and whether the observed `valor` is `major`
or `cents`. A persisted event is queued durably or marked recoverably failed;
the same delivery repairs an unqueued record. Bad-token attempts are durably
limited per integration and always return the same 404 response. The source
contract does not define unit, currency, sandbox, or Guimo-account mapping.
Those remain deployment/product blockers; this slice does not guess them.
