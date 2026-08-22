# Spike: UAZAPI `fromMe` InitiateCheckout (IC) miss

Date: 2026-08-22
Author: investigation via code reading (no code changed)

## Question

When an attendant (team member) sends an InitiateCheckout ("IC") trigger
phrase from a UAZAPI-connected WhatsApp number, why can that event fail to
convert (no CAPI send), even though the message arrived and the webhook was
processed?

## Code read

- `WebhooksController.evaluateUazapiTeamMessage` —
  `apps/api/src/webhooks/webhooks.controller.ts:618-662`
- `UazapiProviderConversionService.evaluateTeamMessage` —
  `apps/api/src/inbound-webhooks/uazapi-provider-conversion.service.ts:105-211`

## How the two functions fit together

`recordUazapiWebhook` classifies a parsed UAZAPI message as a "team message"
only when `message.fromMe === true` and the chat is not a group
(`webhooks.controller.ts:517-520`). For every such message it calls
`evaluateUazapiTeamMessage(resolvedContext, parsed)`, which:

1. Returns silently if `parsed.phone` or `parsed.messageText` is falsy.
2. Looks up the `WhatsappInstance` row scoped to
   `{ id: context.whatsappInstanceId, workspaceId: context.workspaceId }`;
   returns silently if not found.
3. Calls `UazapiProviderConversionService.evaluateTeamMessage(...)` with the
   phone, message text, external id and instance.
4. Wraps the whole call in `try/catch`: **any exception thrown by step 3 is
   caught, logged as `uazapi_team_message_evaluation_failed`, and swallowed.**
   The webhook response itself is unaffected — the caller never learns the
   team message wasn't evaluated.

`evaluateTeamMessage` on the service side then runs a sequence of gates
before it ever asks the decision engine to look at the IC rule:

1. `parseInboundWebhooksConfig(this.env)` — if `config.enabled` or
   `config.conversionRulesEnabled` is off, returns
   `{ evaluated: false, eligibleExecutionId: null }` immediately. No IC rule
   in any workspace is evaluated while these flags are off.
2. `phone.trim()` / `messageText.trim()` — empty after trimming returns the
   same "not evaluated" result (a second, stricter check than the
   controller's truthy check).
3. `this.bridge.ensureBridge(input.instance)` — resolves the UAZAPI instance
   to a `connectionId`/`channelId`. If the instance isn't bridged to a
   provider connection yet (e.g. onboarding incomplete), this throws, which
   propagates up and is swallowed by the controller's `catch` (see above).
4. `this.loadRules(workspaceId, connectionId, channelId)` — loads only
   **active**, **`triggerType: "message_phrase"`** rules
   (`removedAt: null`) whose `channels` include this exact `channelId`. If
   the workspace's InitiateCheckout rule is configured with a different
   trigger type (e.g. `structured_catalog`/`provider_automation`), is
   inactive, is soft-removed, or is scoped to a different connection/channel
   than the one this instance bridges to, `rules` comes back empty and the
   function returns `{ evaluated: false, eligibleExecutionId: null }` —
   the message is never compared against any trigger phrase.
5. `inboundWebhookChannel.findFirst(...)` — if the bridged channel row can't
   be found for this workspace, returns early the same way.
6. `this.paidLeads.resolve({ workspaceId, phone })` — resolved **once**,
   before the rule loop, keyed only by phone. The service's own class-level
   comment states the paid-lead-only guarantee explicitly:
   > "Paid-lead-only, fail-closed: no resolved lead (adId + ctwaClid) means
   > no CAPI, ever."
   and the occurrence built per rule is annotated:
   > "fromMe=true is always the workspace's team/bot sending from the
   > connected number; contacts never reach this branch."

   This is the structural reason a `fromMe` IC message misses: **the
   contact must already have a resolved paid lead (an inbound CTWA message
   that carried `ctwaClid`/ad attribution) before the attendant's IC phrase
   arrives.** If the attendant types the checkout trigger phrase before that
   resolution exists (or the phone format/hash used by `paidLeads.resolve`
   doesn't match the contact that actually holds the paid lead), the decision
   engine's `evaluate()` short-circuits with `decisionCode:
   "ignored_untracked_lead"` as soon as `leadResolution.status !==
   "resolved"` — before dedupe or eligibility is even considered. The loop
   still marks `evaluated = true` (a decision object was produced) and still
   persists it via `this.decisions.recordInitial`, but
   `orchestration.eligibleExecutionId` stays `null`, so nothing is queued and
   no CAPI event is sent. From the outside this looks identical to "nothing
   happened."

7. Value extraction: InitiateCheckout has a `required` value policy in the
   shared conversion-event catalog. Even past the lead-resolution gate, if
   the matched trigger phrase's message doesn't carry an extractable money
   value, the rule evaluation (invoked from this same loop via
   `this.decisionEngine.evaluate`) can also come back `review_required`
   rather than `eligible`, which likewise never reaches
   `orchestration.eligibleExecutionId`. This is a second, independent way an
   IC trigger can fail to convert even when the lead is resolved.

## Why this reads as a silent "miss"

Unlike the sibling `evaluateLabels` method in the same file (lines
290-360), which special-cases `decisionCode === "ignored_untracked_lead"` in
observation mode to force a `blocked` disposition with a visible reason so
Settings can show the validation result, `evaluateTeamMessage` has **no such
special case**. Its loop only ever calls the generic `this.disposition(...)`
helper. Combined with the controller's blanket `try/catch` around the whole
call (point 4 above) and the multiple silent early-returns in the service
(points 1, 2, 4, 5), there is no code path in either function that surfaces
*why* a given `fromMe` IC message didn't convert — it just doesn't happen,
with the only trace being a `uazapi_team_message_evaluation_failed` log line
(and only if the failure was a thrown exception, not one of the early
returns) or the persisted `decisions` row for the lead-resolution case.

## Summary of miss causes found in these two functions

| # | Gate | Effect when unmet |
|---|------|--------------------|
| 1 | `parsed.phone` / `parsed.messageText` missing | silent return, no evaluation |
| 2 | Instance not found for `{id, workspaceId}` | silent return, no evaluation |
| 3 | Any exception in `evaluateTeamMessage` (e.g. `ensureBridge` failure) | caught + logged, swallowed |
| 4 | `config.enabled` / `config.conversionRulesEnabled` off | `evaluated: false`, no evaluation |
| 5 | Trimmed phone/messageText empty | `evaluated: false`, no evaluation |
| 6 | No active `message_phrase` rule bound to the bridged channel | `evaluated: false`, no evaluation |
| 7 | Bridged channel row missing | `evaluated: false`, no evaluation |
| 8 | Contact's phone has no **resolved paid lead** yet | `decisionCode: "ignored_untracked_lead"`, `eligibleExecutionId: null` |
| 9 | IC message matched trigger phrase but no extractable value (required policy) | `review_required`, `eligibleExecutionId: null` |

Gate 8 (paid-lead resolution ordering) is the most likely explanation for a
"the attendant clearly sent the checkout message but it never converted"
report, since it is the only gate that depends on business/timing state
(inbound CTWA lead resolution) rather than configuration, and it produces no
distinguishing signal in `evaluateTeamMessage`'s return value or logs the way
the labels path does.
