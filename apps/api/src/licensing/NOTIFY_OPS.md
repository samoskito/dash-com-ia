# License notify — ops checklist

Short runbook for when a license issue/resend shows `email: skipped` or
`whatsapp: skipped` (or `failed`) in logs or the admin resend response.

No secret values belong in this file or in any log line — only status and
reason codes.

## Where to look

- Guru issue path logs `guru_webhook_notify_result license=<id> email=<status>
  emailReason=<reason|none> whatsapp=<status> whatsappReason=<reason|none>`
  in `GuruLicenseWebhookService`.
- Admin resend (`POST .../licenses/:id/resend`) returns the same
  `{ email, emailReason, whatsapp, whatsappReason }` shape in the response
  body.

## Email

| `emailReason`     | Meaning                                   | Fix |
|--------------------|--------------------------------------------|-----|
| `missing_email`    | License has no `buyerEmail` on file        | Nothing to send to; confirm the buyer email captured at purchase |
| `queue_disabled`   | `EmailQueueService.isEnabled()` is false   | Configure email delivery — set `EMAIL_PROVIDER` (and SMTP_HOST/PORT/USER/PASSWORD or the provider's required vars) so the queue reports enabled |
| `channel_excluded` | Caller asked for `channel: "whatsapp"` only | Expected; not an error |
| `zod_envelope`     | Envelope failed validation before enqueue  | Check `LICENSE_NOTIFY_REPO_URL` / `LICENSE_NOTIFY_SUPPORT_EMAIL` / `LICENSE_NOTIFY_PRODUCT_NAME` are well-formed (invalid values are sanitized to safe defaults, so this should be rare) |
| `enqueue_failed`   | Queue threw enqueuing the job              | Check email provider / queue backend health |

## WhatsApp

| `whatsappReason`   | Meaning                                    | Fix |
|--------------------|----------------------------------------------|-----|
| `empty_phone`      | No `phoneE164` was supplied                 | Pass a phone number on resend, or confirm the buyer phone was captured at purchase |
| `not_configured`   | `LicenseWhatsappNotifier.isConfigured()` is false | Set `LICENSE_NOTIFY_UAZAPI_BASE_URL` and `LICENSE_NOTIFY_UAZAPI_TOKEN` |
| `channel_excluded` | Caller asked for `channel: "email"` only    | Expected; not an error |
| `send_failed`      | Uazapi call completed but reported failure  | Check the Uazapi fleet/session status |
| `network`          | Sending threw (timeout, DNS, etc.)          | Check network egress / Uazapi availability |

## Student license claim

Claim logs use two structured prefixes. Search for
`license_claim_request_result` when a code was requested and
`license_claim_confirm_result` when a submitted code was confirmed.

Request results:

| `result` | Meaning | Operator action |
|---|---|---|
| `eligible` | An eligible purchase was found and the code was queued | No action |
| `not_eligible` | No paid purchase for an eligible product matched the normalized email | No action; do not disclose eligibility to the requester |
| `invalid_email` | The submitted email failed normalization or validation | No action; the public response remains generic |
| `cooldown` | A code was sent less than 60 seconds ago | Wait for the cooldown |
| `max_sends` | The claim reached five codes in its 24-hour window | Wait for the window to reset |
| `captcha_failed` | Turnstile rejected the request or could not be verified | Check the Turnstile configuration and service availability if sustained |
| `mysql_unavailable:not_configured` | Required MySQL connection settings are absent | Check the Dokploy claim MySQL env names; keep the feature disabled until configured |
| `mysql_unavailable:timeout` | MySQL connection or query timed out | Check network reachability, database load, and timeout settings |
| `mysql_unavailable:connection` | DNS, network, or authentication prevented a connection | Check reachability and the dedicated read-only user's access |
| `mysql_unavailable:query` | The lookup query or surrounding request processing failed | Check the schema, read-only grants, and adjacent error logs |
| `email_enqueue_failed` | The purchase was eligible, but the verification-code email could not be queued | Check `EMAIL_PROVIDER`, SMTP settings, Redis, and the transactional email worker |
| `internal_error` | Claim persistence or another internal request step failed | Check PostgreSQL and adjacent API errors; do not ask for or log buyer data |

Confirm results:

| `result` | Meaning | Operator action |
|---|---|---|
| `issued` | A license was issued and linked to the claim | No action |
| `reveal_existing` | The already-issued key was recovered from its unexpired delivery artifact | No action |
| `already_issued_contact_support` | A license exists, but its raw key can no longer be recovered automatically | Use the authenticated license support workflow |
| `code_invalid` | The code is absent, malformed, wrong, expired, or exhausted | The requester must obtain or submit a valid code; do not distinguish the cause |
| `in_progress` | Another confirmation or issuance is already processing the claim | Retry after the in-progress operation settles |
| `notify_failed` | The license was issued, but post-issue notification threw | Check the email and WhatsApp delivery paths; the license remains issued |

The request log may contain only a 12-character email hash. The confirmation
log may contain claim/license ids and `keyPrefix`. Never add the full email,
verification code, raw license key, buyer name, phone, or MySQL credentials.

## Notes

- `LicenseNotificationService` is a required DI provider on both the Guru
  webhook path and the admin resend path — if either fails to resolve it,
  the module fails to boot instead of silently no-op'ing notify.
- These reason codes are the whole contract: don't add ad-hoc log lines with
  raw keys, tokens, or full buyer payloads. If a new skip/fail case is added,
  give it a reason code and add it to this table.
