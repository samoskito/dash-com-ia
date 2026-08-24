# NOD API license broker

Private-API-only module. Lets a licensed student instance (the public
`nod-rastrackdash-wpp` template, via its future `nod_api` client adapter —
**not implemented in this slice**) create and manage a PalmUP-hosted Uazapi
WhatsApp instance **without ever holding** `UAZAPI_ADMIN_TOKEN`. The broker
holds that token server-side and proxies `UazapiAdapter` on the client's
behalf, after validating the caller's license.

## Auth (every request, fail-closed)

Send the raw license key and a device fingerprint on **every** broker
request, either as headers (preferred) or as JSON body fields — both are
accepted, headers win if both are present:

| Concept          | Header                         | Body field        | Required |
|------------------|---------------------------------|--------------------|----------|
| License key      | `x-license-key`                 | `licenseKey`       | yes      |
| Fingerprint       | `x-license-fingerprint`         | `fingerprint`      | yes      |
| Account identity  | `x-license-account-identity`    | `accountIdentity`  | optional |

Server-side checks, in order:

1. Missing key or fingerprint → `400 nod_api_invalid_request`.
2. Resolve the license by `sha256(key)` (`hashLicenseKey`, same helper as
   `/license/activate`). No match → `401 nod_api_invalid_license`.
3. License revoked / refunded / chargeback / hard-expired
   (`LicensingService.deriveRuntimeState(...).usable === false`) →
   `403 nod_api_license_blocked`.
4. `nodApiEnabled !== true` → `403 nod_api_disabled` (skipped on
   `GET /nod-api/health`, see below).
5. `nodApiExpiresAt` set and in the past → `403 nod_api_expired` (skipped on
   `GET /nod-api/health`).
6. If an account identity was supplied **and** the license is already bound
   to an account, the normalized identity must match the bound one →
   `403 nod_api_account_mismatch`. Unbound licenses skip this check (there is
   nothing to compare against yet).
7. Rate limit: 30 requests / 5 minutes per `(route, IP)` and per
   `(route, key-hash-prefix)` — same algorithm as `LicenseRateLimitService`,
   but a broker-local instance (see `nod-api.module.ts`) → `429
   license_rate_limited`.

`GET /nod-api/health` uses a lighter gate (`NodApiHealthAuthGuard`): steps
1–3 and 6–7 apply, but 4–5 are skipped, so a licensed client whose `nodApi`
flag isn't enabled yet (or has expired) can still call health and see why.

Every error response is `{ statusCode, code, message }` — branch on `code`,
not `message` (message text may change / be localized).

## Endpoints

All under `/nod-api`.

### `GET /nod-api/health`

Auth: `NodApiHealthAuthGuard` (see above).

```json
{
  "ok": true,
  "upstreamConfigured": true,
  "nodApiEnabled": true,
  "nodApiExpiresAt": null
}
```

`upstreamConfigured` reflects whether `UAZAPI_BASE_URL` /
`UAZAPI_ADMIN_TOKEN` are set on this API instance — never the secret values
themselves. `ok` mirrors `upstreamConfigured` today.

### `POST /nod-api/instances`

Auth: `NodApiAuthGuard` (full gate, `nodApiEnabled` must be true and not
expired).

Body: `{ "name"?: string }` — optional display name; defaults to
`nod-api-<license keyPrefix>`.

Calls `UazapiAdapter.createInstance` with the server-side admin token
(`admintoken` header, never seen by the client) and `localInstanceId` /
`workspaceId` both scoped to `nod-api:<license.id>` (there is no dashboard
workspace behind a NOD API license, so the license id stands in for both
correlation fields Uazapi expects).

Success (`200`):

```json
{ "instanceId": "string", "instanceToken": "string", "status": "created" }
```

`instanceToken` is the **per-instance** Uazapi token — the client is
responsible for storing it and sending it back on subsequent status calls.
It is not the admin token and only grants access to this one instance.

Failure:
- Upstream not configured (missing env) → `503
  nod_api_upstream_not_configured`.
- Upstream call failed / malformed response → `502 nod_api_upstream_error`.

### `POST /nod-api/instances/status`

Auth: `NodApiAuthGuard` (full gate). Uses the **instance token the client
already has from `POST /instances`** — never the admin token — to check
connection state.

Body: `{ "instanceId": string, "instanceToken": string }` (both required,
`400 nod_api_invalid_request` if missing).

```json
{
  "instanceId": "string",
  "status": "not_configured" | "pending" | "qr_required" | "connected" | "disconnected" | "error",
  "qrCode": "string | null",
  "connectedPhone": "string | null",
  "message": "string | null"
}
```

## Secret hygiene

- `UAZAPI_ADMIN_TOKEN` never leaves this module: it is read from env inside
  `UazapiAdapter` and only ever sent as the `admintoken` header to Uazapi.
- Response DTOs are hand-built (never a raw upstream passthrough) and every
  response additionally passes through `scrubSecrets` (`nod-api-scrub.util.ts`),
  an explicit deny-list that drops any key matching `/admin[-_]?token/i` —
  defense in depth if a future change ever puts a secret-looking key on a
  response object.
- Logs only ever include `license.keyPrefix` (e.g. `PALMUP-AB12`), never the
  raw key, never any token. See `NodApiService`'s `Logger.warn` calls.

## Env

No new environment variables. Reuses `UAZAPI_BASE_URL` +
`UAZAPI_ADMIN_TOKEN` (already required by `UazapiAdapter`). If either is
unset, `POST /nod-api/instances` returns `503
nod_api_upstream_not_configured` and `GET /nod-api/health` reports
`upstreamConfigured: false`.

## Billing / enablement

`nodApiEnabled` / `nodApiExpiresAt` are set by ops via the existing admin
endpoint (`LicensingService.setNodApi`, `PATCH
/backoffice/licenses/:id/nod-api`). There is no self-serve or automated
billing flow in this slice — enabling NOD API for a license is a manual ops
action.

## Out of scope (this slice)

- The public template's `nod_api` client adapter that will call this broker
  (`nod-rastrackdash-wpp`, next slice — F5.3b).
- Asaas charging automation for NOD API seats.
- WAHA / Z-API providers.
