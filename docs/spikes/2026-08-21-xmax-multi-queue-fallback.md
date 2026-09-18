# XMAX multi-queue fallback resolve (2026-08-21)

## Problem

After the X3 multi-queue global ingress shipped (`feat/x3-xmax-global-ingress-queue-routing`),
`ingestGlobal` required `Queue_id` in the webhook body to match an active
`XmaxAccount` under the ingress before doing anything else — no match, no
`lastWebhookAt`, discard. In production this meant:

- Global ingress `lastWebhookAt` went stale (~42h) the moment `Queue_id`
  stopped arriving/matching, even though XMAX was still POSTing.
- Only the account whose `queueId` happened to match kept working (Bento);
  every other queue (Foz, Caxias, Chapecó, Xanxerê, Canoas, Farroupilha, Nova
  Prata) never received a routed delivery, `lastWebhookAt: null`.
- Before the multi-queue change, the single Bento-only webhook worked fine —
  so the regression is specifically in the "resolve which of the ~9 accounts
  owns this contact" step, not in getContact/tag-mapping itself.

## Root cause (confirmed in code)

`ingestGlobal`, pre-fix:

1. Auth ingress token → uniform 404.
2. Parse body.
3. If `Queue_id` missing → discard `queue_id_absent`. **No `lastWebhookAt`
   touch.**
4. Single indexed lookup `(ingressId, queueId, active)`. If no match →
   discard `queue_unresolved`. **No `lastWebhookAt` touch.**
5. Only on step 4 success: `ingress.lastWebhookAt` updated, then
   `processResolvedAccount`.

So any XMAX-side change to how `Queue_id` is sent (wrong field, dropped,
wrong value) silently breaks *all* routing and *simultaneously* hides the
break from the ops stale-ingress detector, because the same condition that
fails to route also fails to update the freshness timestamp.

## Fix

### 1. `lastWebhookAt` moves earlier

`ingress.lastWebhookAt` is now updated as soon as **auth + parse(contactId)**
succeed — before any queue resolution is attempted. A guard failure
(oversized/empty/invalid-JSON body) or a parse failure (no contact id field
at all) still does not touch it, since those mean XMAX isn't sending a
usable webhook at all. But once we have a valid `contactId`, the ingress is
provably alive regardless of what happens to `Queue_id` next.

### 2. Bounded getContact fan-out fallback

When `Queue_id` is absent, or present but doesn't resolve to an active
account under the ingress, we no longer discard immediately. Instead:

1. Load active `XmaxAccount` rows for this `ingressId` only (capped at 12,
   realistically ~9 — Dr. Hernia's unit count). Never a scan across
   workspaces/tenants, never a DB `Lead` lookup.
2. Fan out `getContact({ baseUrl, queueId: account.queueId, apiKey, id: contactId })`
   to those accounts:
   - Concurrency 3 (not a 9-wide hammer).
   - Per-call timeout 4s (existing adapter default), further capped by
     remaining budget.
   - Hard overall budget 9s.
   - Stops dispatching new accounts as soon as one returns a contact — first
     HTTP 200 with a parseable contact wins the race; in-flight losers are
     discarded, never retried.
3. If exactly one account claims the contact, that account is used for the
   rest of the pipeline (tag mapping → paid-only gate → dedup → shadow event
   → production emit), same as the fast path. The contact already fetched
   during the fan-out is reused — `processResolvedAccount` does **not** call
   `getContact` a second time for the winner.
4. If no account claims the contact anywhere in the tenant, discard:
   - `queue_unresolved` — a `Queue_id` was present but wrong/unknown, and no
     account owns the contact either.
   - `contact_not_found_in_tenant` — no `Queue_id` at all, and no account
     owns the contact.
5. A structured log line `xmax_ingress.queue_resolved_via_fallback` records
   which `accountId`/`queueId` won (no secrets, no full contact id).

Why not a DB `Lead` lookup instead (the original idea)? XMAX (getContact) is
the source of truth for tags; a contact may not have a `Lead` row yet
(organic contact, or CTWA dead-on-unit); the webhook may not carry a usable
phone at all — only the XMAX `contactId` is guaranteed. Scanning ~9
workspaces' `Lead` tables by normalized phone is also the "wrong source of
truth, phone normalization hell" Samuel explicitly ruled out. A phone-hash
`Lead` lookup scoped to ingress workspaces remains a possible **phase 2**
last-resort if fan-out misses become common — not implemented here.

## Parser / "Dados-only body" risk — confirmed, ops issue not a parser bug

Investigated: `xmax-contact.parser.ts`'s schema is `.passthrough()` and
extracts `contactId` independently of `Queue_id`/`Queue_name` — the parser
does not require queue fields to find the contact id, and vice versa.

**But**: if XMAX's webhook "Dados" section *replaces* the default body
instead of merging with it, and the configured Dados only contains
`Queue_name`/`Queue_id`, then the actual POST body received by our ingress
will contain **only those two fields** — no `Contact_Id`/`id`/`Telefone`/etc.
In that case parsing fails at `missing_contact_id` (confirmed by a new test:
"discards a body with no contact id field, without touching lastWebhookAt")
and — correctly — `lastWebhookAt` does **not** move, since there is no proof
XMAX sent anything usable.

This is not something the parser can route around: if the contact id truly
isn't in the payload, there's nothing to resolve. It has to be fixed on the
XMAX side (see ops note below).

## Test coverage added/updated

`apps/api/test/xmax-ingest.service.test.ts` (24 tests in the global-ingress
`describe` block, up from 17):

- Fast path unaffected: `Queue_id` match still resolves in one indexed
  lookup, no fan-out attempted (`xmaxAccount.findMany` not called).
- Fallback hits the correct account when `Queue_id` is absent.
- Fallback hits the correct account when `Queue_id` is present but wrong/
  unresolved.
- Fallback fully misses (all accounts reject) → discard, correct reasonCode
  per case (`contact_not_found_in_tenant` vs `queue_unresolved`), no shadow
  event write, `lastWebhookAt` still touched.
- Concurrency + early-stop: 4 accounts, concurrency 3 — the 4th account is
  never called once the 3rd resolves first.
- `lastWebhookAt` still does *not* move on invalid JSON or on a body with no
  contact id field at all.
- Existing tests (routing by `Queue_id`, cross-workspace isolation,
  `account.queueId`-from-config-not-payload, 404s) unchanged.

## Ops note (see PR description for pt-BR-ready bullets)

- `Queue_id` is still the preferred/fast routing path — send it, and make
  sure it matches one of the seeded queue ids (10, 11, 12, 13, 14, 16, 42,
  43).
- The fallback is a safety net, not a replacement: it costs 1 extra HTTP
  round trip to XMAX per miss (bounded to 3 concurrent, ~9 max, 9s budget),
  so webhooks route correctly but a little slower when `Queue_id` is
  missing/wrong.
- The webhook body **must always include the contact id field** (`Contact_Id`
  / `id` / etc.), regardless of what else is in "Dados". If XMAX's "Dados"
  replaces the default body instead of merging with it, and Dados is
  configured with only `Queue_name`/`Queue_id`, the webhook will be silently
  discarded (`missing_contact_id`) — confirm in the XMAX UI whether Dados
  merges or replaces, and if it replaces, add the contact id field(s) to
  Dados explicitly.
