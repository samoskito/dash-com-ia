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

## Notes

- `LicenseNotificationService` is a required DI provider on both the Guru
  webhook path and the admin resend path — if either fails to resolve it,
  the module fails to boot instead of silently no-op'ing notify.
- These reason codes are the whole contract: don't add ad-hoc log lines with
  raw keys, tokens, or full buyer payloads. If a new skip/fail case is added,
  give it a reason code and add it to this table.
