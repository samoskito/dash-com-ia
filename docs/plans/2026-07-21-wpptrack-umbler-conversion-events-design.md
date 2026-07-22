# WppTrack Umbler Conversion Events Design

Date: 2026-07-21
Status: Approved for implementation

## 1. Objective

Extend the production Umbler integration beyond `LeadSubmitted` so each
workspace can configure reusable `QualifiedLead` and `Purchase` rules without
changing the live paid-conversation flow.

The approved first release supports three independent rule types:

1. `QualifiedLead` from a dedicated webhook block inside an Umbler automation.
2. `Purchase` from a dedicated Umbler automation webhook with a configured
   average value.
3. `Purchase` from an outbound structured message matched against a fixed
   product catalog.

The two purchase mechanisms serve different customers. A catalog message does
not wait for a tag, and an automation purchase does not inspect a catalog.

## 2. Existing Foundation

The implementation must reuse the current production path:

- encrypted inbound payload retention;
- provider-specific Umbler parsing;
- workspace and channel isolation;
- paid lead attribution with CTWA and Meta ad data;
- exact Meta destination resolution;
- conversion log, BullMQ delivery and Meta CAPI audit;
- first-purchase and repurchase reporting;
- controlled replay and platform-owner diagnostics.

The current Umbler `LeadSubmitted` behavior remains unchanged. New conversion
rules are opt-in and disabled for production until their own gates and rule
state allow materialization.

## 3. Approaches Considered

### 3.1 One generic keyword engine for every event

This would be quick, but it would mix tag automations, free text and structured
catalog parsing. It would also make value resolution and audit reasons hard to
explain. Rejected.

### 3.2 One custom integration per customer

This would satisfy the immediate cases but duplicate webhook security, parser,
catalog and delivery logic. Every new customer would require code changes.
Rejected.

### 3.3 Shared conversion rules with provider-specific adapters

This is the approved approach. The existing conversion-rule domain remains the
business entry point. Umbler-specific adapters collect and normalize events,
while the rule engine, catalog, dedupe and conversion materializer are reusable
inside any workspace.

## 4. Rule Model

The existing `ConversionRule` remains the base record for name, event name,
default value, currency, content and enabled state. Provider conversion rules
add a one-to-one configuration with:

- source provider and inbound connection;
- trigger kind: `provider_automation` or `structured_catalog`;
- mode: `observation` or `production`;
- allowed Umbler channels;
- parser version and certification state;
- optional catalog;
- creation, update and activation audit metadata.

Pausing the base rule stops evaluation. Observation mode continues collecting
and classifying executions but never creates a conversion log. Production mode
may materialize only executions that pass every business and routing guard.

Legacy `keyword` and `whatsapp_label` rules keep their current behavior. Their
evaluation path must explicitly ignore the new trigger kinds.

## 5. Automation Webhook Rules

Each automation rule receives its own opaque signed URL. The rule behind the
URL defines the intended event, so a public payload cannot choose or override
`QualifiedLead`, `Purchase`, value, currency or workspace.

The endpoint record contains:

- conversion rule and Umbler connection;
- hashed secret and secret version;
- provider parser version;
- last delivery and last valid parse timestamps;
- rotation and removal metadata.

The plaintext URL is displayed only after creation or rotation. Secret lookup
uses constant-time comparison. Tenant context comes from the endpoint record,
never from request data.

Automation callbacks use the same encrypted inbox and seven-day payload
retention as the main Umbler webhook. A delivery is tagged as a conversion
automation delivery and linked to its rule. If Umbler supplies a stable event
identifier, it becomes the permanent ingress identity. Otherwise, retries are
collapsed using endpoint, canonical body hash and a bounded retry window. The
business dedupe rules remain a separate layer.

The first deployment keeps automation rules in observation. Real tag callbacks
are inspected, added as fixtures and used to certify the versioned automation
parser before either event can enter production.

## 6. Qualified Lead Automation

An Umbler tag starts an automation whose webhook block calls the rule-specific
URL. The URL itself identifies the `QualifiedLead` rule; several tags may call
the same URL when they mean the same business event, or use separate rules when
operators need separate audit histories.

The normalized callback must identify at least the contact, conversation or
chat, channel when available, and occurrence time. WppTrack resolves that
identity to an existing paid lead in the same workspace. It never creates an
organic lead from this callback and never trusts Meta IDs supplied by the
public request.

`QualifiedLead` is accepted only once for the same workspace and customer
identity, regardless of provider retries, rule, tag or later replay. The
deterministic business dedupe key is shared across all qualifying sources.

## 7. Purchase From Automation

The purchase automation follows the same signed-endpoint flow. Its rule stores
the configured average value, three-letter currency and optional content name.
The public callback cannot alter these commercial values.

After the paid lead and exact Meta route are resolved, WppTrack creates a
`Purchase` using the rule defaults. Existing reporting classifies the first
accepted purchase as `first_purchase` and later accepted purchases as
`repurchase`.

The same customer may buy again, but two purchases less than 24 hours apart are
treated as one business conversion. The 24-hour rule is rolling and uses the
event occurrence time, not a calendar-day bucket. Exactly 24 hours or more is
accepted as a new purchase. Processing obtains a customer-scoped database lock
before checking the time window so simultaneous callbacks cannot bypass it.

## 8. Structured Catalog Purchase

The catalog purchase is evaluated from the existing Umbler message webhook.
The parser is extended to expose message direction, author type and content to
the internal processor without adding message text to redacted summaries.

Only non-private outbound messages sent by either a human team member or a bot
are eligible. Contact messages never trigger a catalog purchase.

A catalog contains:

- product name and currency;
- one or two freely named attributes;
- normalized aliases for attribute values;
- valid attribute combinations;
- one authoritative value in cents per combination;
- allowed Umbler channels.

For the approved trampoline customer, the first attributes are `Tamanho` and
`Modelo`, with these variants:

| Tamanho | Modelo | Valor |
| --- | --- | ---: |
| 4,90 | Nacional | R$ 3.597,00 |
| 4,27 | Nacional | R$ 2.997,00 |
| 3,05 | Nacional | R$ 1.997,00 |
| 2,44 | Nacional | R$ 1.597,00 |
| 3,05 | Europa | R$ 1.797,00 |
| 2,44 | Europa | R$ 1.397,00 |

The parser reads one structured confirmation at a time, for example:

```text
Tamanho: 4,90
Modelo: Nacional
3.597,00
```

Attribute labels and values are normalized for case, whitespace and configured
aliases. The message must resolve to exactly one catalog variant. The catalog
value is authoritative; the amount written in the message is a validation
check. A missing amount, unknown combination, ambiguous match or different
amount is blocked for audit. WppTrack never guesses a product or price.

## 9. Attribution and Materialization

Every rule execution first resolves the contact to an existing lead in the
same workspace. That lead supplies the trusted paid attribution:

- phone identity;
- CTWA identifier;
- Meta ad, campaign and ad set;
- source URL when available;
- current exact Meta connection and conversion destination.

The automation payload or outbound message cannot replace these fields. A
missing lead, organic lead, unresolved Meta route or cross-workspace reference
fails closed.

An eligible execution is translated into the existing conversion-event input
and sent through the current registry, conversion log and CAPI queue. This
preserves event naming, hashing, payload construction, retries, audit and
reporting.

## 10. Execution Audit

Each evaluated callback or catalog message creates a rule execution record
with:

- rule, connection, channel and source delivery;
- stable external execution identity;
- hashed customer identity and occurrence time;
- observation, eligible, materialized, duplicate, blocked or failed state;
- machine-readable reason code;
- matched catalog variant and configured value when applicable;
- resolved lead and conversion log references;
- timestamps and retry counters.

Full message content is not copied into this long-lived record. The audit keeps
only extracted attributes, value, provider identifiers and a redacted result.
The encrypted source payload follows the existing retention policy.

Platform owners can inspect raw payloads and controlled replay through the
existing audited backoffice boundary. Workspace managers see normalized rule
results and corrective reasons but not raw payloads.

## 11. User Interface

Each Umbler connection gains an `Eventos de conversao` section. It lists rules
with event, trigger, channels, mode, last execution and health.

Creating an automation rule asks for:

- rule name;
- `QualifiedLead` or `Purchase`;
- allowed channels;
- average value and currency only for `Purchase`;
- observation or production state.

After creation, the UI displays the one-time URL and a copy action for the
Umbler automation. Rotation invalidates the old URL immediately.

Creating a catalog rule opens a compact catalog editor for product, one or two
attribute labels, variants, aliases and values. A test-message field shows the
exact matched variant or the blocking reason before activation.

Production activation requires a confirmation and displays the applicable
dedupe policy. Controls use existing workspace integration permissions:
workspace owners, authorized admins and platform owners may manage rules;
analysts remain read-only.

## 12. Safety and Failure Handling

- `INBOUND_CONVERSION_RULES_ENABLED` gates collection and evaluation.
- `INBOUND_CONVERSION_PRODUCTION_ENABLED` gates all new side effects.
- Each rule must also be enabled, certified and in production mode.
- Existing Umbler live lead delivery does not depend on either new flag.
- Endpoint secrets are never logged or returned after creation.
- Provider retries are technically idempotent.
- `QualifiedLead` has lifetime business dedupe per workspace/customer.
- `Purchase` has rolling 24-hour business dedupe per workspace/customer.
- Catalog mismatch and route ambiguity remain visible but unsent.
- Queue publication follows durable outbox semantics and reconciliation.
- No rule can operate on a channel, lead or Meta asset from another workspace.

## 13. Rollout

1. Deploy schema, contracts and rule UI hidden behind disabled flags.
2. Enable observation and create one rule-specific URL for each tag automation.
3. Capture real Umbler callbacks from both customer flows.
4. Add fixtures, certify the automation parser and verify contact attribution.
5. Run one `QualifiedLead` and one average-value `Purchase` canary.
6. Configure the fixed catalog and validate representative messages in
   observation.
7. Run one catalog purchase canary from a real outbound confirmation.
8. Activate only the validated rules and channels.
9. Observe conversion logs, Meta acceptance and dashboard classification.

## 14. Out of Scope

The first release does not include:

- arbitrary free-text keyword rules for Umbler;
- extracting an open-ended price from a customer-defined message template;
- automatic AI interpretation of conversation content;
- creation of leads from tag callbacks;
- changing existing Umbler `LeadSubmitted` behavior;
- changing the Barbieri integration or any current workspace route.

Keyword triggers and dynamic message variables remain a later evolution after
the two approved production mechanisms are stable.

## 15. Success Criteria

The feature is complete when:

- a manager can create a dedicated URL for each Umbler automation rule;
- real callbacks are observable before activation;
- tag automation creates one lifetime `QualifiedLead` per paid lead;
- average-value automation creates purchases with the configured value;
- a human or bot structured message resolves one exact catalog variant;
- invalid catalog messages are blocked without guessed values;
- a second purchase inside 24 hours is deduplicated and one at or after 24
  hours becomes a repurchase;
- all accepted events use the original paid lead attribution and exact Meta
  route;
- existing Umbler lead intake and current production workspaces remain
  unchanged.
