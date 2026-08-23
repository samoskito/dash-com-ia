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
- **`sanitize-export.mjs`** — a stub only (see below). It loads and validates
  the yml and prints counts. It does **not** perform any export.

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
cd /home/ai-runner/worktrees/dash-com-ia-f3-sanitize
python3 -c "import yaml; yaml.safe_load(open('scripts/rastrackdash/sanitize-allowdeny.yml')); print('yml_ok')"
node scripts/rastrackdash/sanitize-export.mjs   # loads yml, prints counts, exits 0
```

## Next step (F3.2)

Implement the real `sanitize-export.mjs`: copy `keep_paths`, delete
`remove_paths` + `remove_path_patterns`, apply `rewrite_rules` as codemods,
drop the listed Prisma models and `app.module.ts` imports, generate a trimmed
`.env.example` from `env_allow`, and run the `secret_fail_patterns` scan as a
hard gate before writing anything — with `defer_review` entries resolved (or
explicitly failing the run) first. See `INVENTORY.md` § "Open questions" for
what needs a decision before F3.2 starts.
