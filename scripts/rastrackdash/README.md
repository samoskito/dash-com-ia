# RastrackDash sanitize — F3 overview

This directory holds the **inventory and configuration** the future export
pipeline uses to turn this private monorepo (`dash-com-ia`, internal name
WppTrack) into the public RastrackDash student-edition template that lands in
[`nod-rastrackdash-wpp`](https://github.com/samoskito/nod-rastrackdash-wpp).

Nothing in this directory writes to the public repo. It only describes what
*would* be kept, stripped, or rewritten, and (starting in F3.2) validates that
description against the real tree.

## Files

- **`sanitize-allowdeny.yml`** — the structured allow/deny data: paths to
  remove, paths to keep, ambiguous modules deferred for a product decision,
  descriptive rewrite rules (branding, BYO-only), the secret-fail regex list,
  `.env.example` strip/allow lists, and the Prisma models / Nest module
  imports to drop.
- **`INVENTORY.md`** — human-readable table of every top-level
  `apps/api/src/*` module, `apps/web` area, and package, each with a
  KEEP / STRIP / REWRITE / DEFER(F4+) verdict and a one-line reason citing
  real file paths.
- **`sanitize-export.mjs`** — the real F3.2 dry-run exporter. Copies the
  monorepo minus `remove_paths`/`remove_path_patterns`, applies the Nest
  module/barrel registration codemods, the Meta OAuth broker removal
  codemod, and a handful of leftover license/Asaas/Uazapi-admin residue
  codemods (see "F3.2 status" below), strips the listed Prisma models,
  regenerates `.env.example`, then runs the `secret_fail_patterns` scan as a
  fail-closed gate. Writes `EXPORT_REPORT.md` into the output dir and
  `EXPORT_NOTES.md` (this directory) summarizing the last run. Never writes
  to the public repo or pushes anywhere — see gates below.

## Why this exists (F1–F3 context)

- F1 + F2 built a license server (activation, heartbeat, Guru webhook
  delivery, WhatsApp/email notify) that is **live in the private API**. It is
  how PalmUP sells and licenses RastrackDash. It must never reach the public
  template.
- F3 sanitizes the private monorepo into a public, license-free,
  BYO-everything (Uazapi instance, SMTP, Meta manual token) student edition.
- F3.1 (this slice) only produces the inventory/config above. F3.2 will
  implement the actual export script that reads this yml and writes a
  sanitized tree. F4+ builds the license *client* the public template talks
  to (out of scope here).

## Gates — read before running any future export

1. **No public push without Samuel's explicit `autorizado`.** The export
   script (F3.2+) must never push to `nod-rastrackdash-wpp` (or any public
   remote) as part of its own run. Export → local review → human approval →
   manual push, always in that order.
2. **Secret-fail-closed.** Any match against `secret_fail_patterns` in
   `sanitize-allowdeny.yml` anywhere in the exported output must abort the
   export with a non-zero exit and **no files written to the destination**.
   This includes both real secret shapes (PEM blocks, `sk_live_`, `AKIA`,
   Asaas key shape) and identifiers whose mere presence signals leftover
   PalmUP-only code (`UAZAPI_ADMIN_TOKEN`, `LICENSE_*`, `GURU_WEBHOOK_SECRET`,
   `ASAAS_*`).
3. **`defer_review` entries block, they don't auto-resolve.** If a future
   export run touches a path listed under `defer_review` in the yml, it must
   fail loudly and ask for a decision rather than guessing keep or strip.
4. **Never touch `nod-rastrackdash-wpp` product code from this repo.** That
   repo stays docs-only until an authorized export explicitly writes to it.

## What stays private, always

- `apps/api/src/licensing/**` — the entire license server.
- Asaas billing/payment integration (`apps/api/src/integrations/asaas/`,
  `apps/api/src/billing/asaas.adapter.ts`, `split.*`).
- Platform-owner / staff support tooling (`client-swap/`,
  `backoffice-platform-users.controller.ts`, the `(backoffice)` clients and
  billing web routes).
- The Meta OAuth **broker** (`meta/start`, `meta/callback`, `MetaOAuthState`)
  — the public template ships **manual** Meta connections only.
- Real `.env` values, production seeds, and any `UAZAPI_ADMIN_TOKEN` usage —
  the public template is BYO Uazapi instance + token only.
- Internal planning docs and sales artifacts (`Projeto.md`, `artifacts/`,
  the standalone marketing HTML files).

Full detail with file-level citations lives in `INVENTORY.md` and the
`remove_paths` / `defer_review` sections of `sanitize-allowdeny.yml`.

## Validating this slice

```bash
cd /home/ai-runner/worktrees/dash-com-ia-f3-export
python3 -c "import yaml; yaml.safe_load(open('scripts/rastrackdash/sanitize-allowdeny.yml')); print('yml_ok')"
node scripts/rastrackdash/sanitize-export.mjs --self-test   # unit-tests the scanner + yml gates
node scripts/rastrackdash/sanitize-export.mjs --out /tmp/rastrackdash-export --force
cat /tmp/rastrackdash-export/EXPORT_REPORT.md
```

## F3.2 status (Samuel-approved MVP defaults, applied)

F3.2 resolved every F3.1 `defer_review` item except `meta/oauth/advanced`
(still ambiguous, still deferred — see the yml). Applied MVP defaults:

1. **billing/** — the WhatsApp-seat concept turned out not cleanly isolable
   (BillingSeatModule/WhatsappSeatService are wired into inbound-webhooks,
   inbound-webhook-production and conversion-rules; BillingService/
   PackageBillingWebhookService/ExternalChannelBillingAccessService are
   *required* deps of webhooks.controller.ts and the production conversion
   services). Per the locked default, the **whole `billing/` module is
   stripped** for v1. The Nest module registrations pointing at it are
   removed by the exporter; the deeper service-level imports in those
   dependent files are **not** rewritten — the exporter's dangling-import
   scan reports them by file:line in `EXPORT_REPORT.md` instead of guessing
   a replacement. Re-adding a standalone BYO capacity-tracking concept is a
   follow-up slice, not invented here.
2. **Meta OAuth** — the broker (`meta/start`, `meta/callback`,
   `MetaOAuthState`, the web `MetaOAuthButton`) is removed by a real codemod
   (`applyMetaOAuthBrokerRemoval`). Manual connection stays. `meta/oauth/
   advanced` is untouched (separate, still-open ambiguity).
3. **Backoffice inbound recovery/replay** — the cross-workspace PalmUP staff
   controllers/services are stripped; the workspace-scoped registry/
   ingestion/channel-routes code stays.
4. **web subscription/** — stripped.
5. **design-system/ + wpptrack-design-system/** — excluded at copy time,
   never land in the export.
6. **platform-admin bootstrap** — the multi-client staff bootstrap/admin-mgmt
   surface (`platform-admin.service.ts`, `platform-admin-bootstrap.ts`,
   `create-platform-admin.ts`, `promote-platform-owner.ts`,
   `backoffice-workspaces.controller.ts`) is stripped. `create-user.ts`
   stays as the generic helper.
   **TODO (F3.3/F6):** design and implement a single-owner self-host
   bootstrap flow (the student becomes sole platform owner of their own
   deploy) — not invented in this slice. Several kept files
   (`diagnostics.controller.ts`, `platform-workspace-access.service.ts`,
   `external-data/backoffice-external-data.controller.ts`,
   `inbound-webhook-replay.service.ts`) still import the now-removed
   `platform-admin.service.ts`; the exporter's dangling-import scan reports
   these too.

Also resolved during the F3.2 real-run pass (secret-scan-driven, not in the
original MVP-default list but required for a passing dry run):
`docs/`, `apps/api/test/`, and this `scripts/rastrackdash/` tooling
directory itself are stripped wholesale (internal-only / test fixtures
naming secret identifiers / PalmUP-only export tooling); a few otherwise-kept
files (`integrations.service.ts`, `uazapi.adapter.ts`,
`webhooks.controller.ts`, `ops-alert.notifier.ts`) had small, self-contained
UAZAPI_ADMIN_TOKEN/Asaas/license-notify-fallback branches removed by
dedicated codemods (`applyResidueCodemods`). Full detail + exact counts are
in `EXPORT_REPORT.md` after each run; nothing here is invented without an
evidence trail back to a specific file.
