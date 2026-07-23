# WppTrack Umbler Conversion Pipeline Hardening Design

## 1. Status and Authority

Approved on 2026-07-23.

This document is the current authority for the Umbler conversion pipeline. It
supersedes conflicting conversion-classification, purchase-review and author
handling rules in:

- `2026-07-21-wpptrack-umbler-conversion-events-design.md`;
- `2026-07-22-wpptrack-umbler-message-purchase-review-design.md`;
- `2026-07-21-wpptrack-umbler-conversion-events-implementation.md`.

The earlier documents remain useful as implementation history, but they must
not be used to infer current behavior where they disagree with this design.

## 2. Scope

This hardening wave covers the complete Umbler conversion path:

- qualified leads from rule-specific Umbler automation callbacks;
- purchases from automation callbacks with a configured average value;
- purchases recognized from standard Umbler messages with an average value;
- purchases recognized from structured catalog messages;
- observation, automatic production, retry, explicit reevaluation and replay;
- paid-lead resolution, review, business deduplication and Meta delivery;
- customer-facing operational views and platform-owner audit views.

The following are out of scope for this wave:

- Gupshup payload certification and production conversion rules;
- Meta connection, asset-routing and reporting redesign;
- general dashboard and report changes unrelated to conversion traceability;
- arbitrary free-form price extraction.

Existing Meta routes, queues, conversion logs and active Umbler connections
must continue operating during the migration.

## 3. Problem Statement

The current implementation grew through several production fixes. It now has
overlapping business and technical states across:

- `InboundWebhookDelivery`;
- `ProviderConversionRuleExecution`;
- `PurchaseReview`;
- `ConversionEventLog`;
- the Meta delivery queue.

The same message can also be interpreted once during observation and again
during materialization or replay. If a rule, alias or catalog changes between
those moments, the same payload can produce a different result.

The older plans contain requirements that are no longer valid. In particular,
they classified empty order templates as reviews and, in another phase,
ignored contact-authored messages. The approved behavior now depends on the
message content and configured author scope, not on assumptions from those
older phases.

The result must be a deterministic pipeline with one decision engine, explicit
state transitions and one audit trace from webhook ingress to Meta response.

## 4. Core Invariants

### 4.1 Paid traffic is the eligibility boundary

WppTrack only materializes Umbler conversions for a paid lead already known to
the workspace.

After phone and conversation identity normalization:

- a matching paid lead may continue through the decision pipeline;
- a missing phone or missing paid-lead match produces
  `ignored_untracked_lead`;
- an untracked lead never creates a purchase review or Meta event;
- the raw delivery and internal reason remain available to platform-owner
  audit.

This rule intentionally excludes organic conversations and contacts created
before WppTrack started tracking the workspace.

### 4.2 Empty templates are not purchases

A configured trigger phrase without any meaningful catalog attributes is a
template, not a purchase:

- all required attributes empty produces `ignored_empty_template`;
- author type does not change this decision;
- no `PurchaseReview` or `ConversionEventLog` is created;
- the internal delivery audit records the ignored reason.

### 4.3 Review must be actionable

A customer-facing review exists only when:

- a paid lead was resolved;
- the conversion trigger is valid;
- at least one meaningful purchase attribute was provided; and
- a user can complete or correct the item, variant, quantity or value.

Unknown paid leads and empty templates are not actionable and therefore never
appear in review.

### 4.4 Author scope is configurable

Team members, bots and contacts can trigger a rule when its author scope
allows them. Catalog correctness and paid-lead eligibility are enforced for
every author.

### 4.5 Deduplication is independent from transport retry

- qualified leads use lifetime business deduplication for the paid lead;
- purchases use a rolling 24-hour business deduplication window;
- provider retry and queue retry use occurrence idempotency;
- automatic processing, replay and manual actions share the same locks and
  deduplication keys.

## 5. Canonical Decision Model

Every applicable normalized occurrence receives exactly one business decision:

| Decision                 | Meaning                                           | Operational effect           |
| ------------------------ | ------------------------------------------------- | ---------------------------- |
| `ignored_empty_template` | Trigger found, no meaningful attributes           | Internal audit only          |
| `ignored_untracked_lead` | No paid lead can be resolved                      | Internal audit only          |
| `review_required`        | Known paid lead, partial or invalid business data | Create one actionable review |
| `eligible`               | Known paid lead and complete conversion data      | Observe or materialize       |
| `duplicate`              | Business conversion was already materialized      | Record dedupe outcome only   |

After an eligible decision, technical delivery may move through:

- `observed`;
- `queued`;
- `sent`;
- `blocked_configuration`;
- `failed_retryable`;
- `failed_permanent`.

Business decisions and technical delivery states must not be collapsed into a
single generic status.

The canonical decision is a discriminated union containing:

- decision code and reason code;
- normalized occurrence identity;
- paid lead identity, when resolved;
- matched rule and trigger;
- normalized items, quantities, currency and calculated value;
- rule version and immutable rule snapshot;
- catalog version and immutable matched-variant snapshot;
- parser and decision-engine versions;
- deterministic occurrence and business-deduplication keys.

## 6. Architecture

### 6.1 Inbound intake

The existing ingress remains responsible for authentication, provider-level
deduplication, encrypted raw-payload retention and queueing. A raw delivery is
evidence, not a conversion.

### 6.2 Umbler normalizer

Provider-specific parsing produces a common occurrence with:

- provider, connection and channel;
- provider delivery, event and message identifiers;
- author type;
- phone and conversation identity;
- message body;
- occurrence timestamp.

No Meta side effect is allowed in the provider parser.

### 6.3 Paid-lead resolver

A dedicated resolver normalizes identity and resolves an existing paid lead.
It returns a typed result instead of throwing generic errors:

- `resolved`;
- `missing_identity`;
- `not_found`;
- `ambiguous`.

Only `resolved` can continue to review or materialization.

### 6.4 Conversion decision engine

The engine is pure: it has no database, queue or Meta dependency. It receives
the normalized occurrence, lead-resolution result, rule snapshot and catalog
snapshot, then returns the canonical decision.

Rule-specific evaluators cover:

- qualified-lead automation;
- average-value purchase automation;
- average-value purchase message;
- structured catalog purchase message.

### 6.5 Decision audit

Decisions are persisted before side effects in an append-only audit record.
Ignored decisions remain internal audit records and do not create operational
executions, reviews or conversion logs.

The current `ProviderConversionRuleExecution` remains the technical execution
record during the incremental migration. It is linked to the frozen decision
used for materialization.

### 6.6 Conversion orchestrator

One orchestrator maps decisions to effects:

- ignored: finish with no customer-facing record;
- review required: create or update one review;
- eligible in observation: persist observation only;
- eligible in production: create the technical execution and queue it;
- duplicate: record the dedupe result.

Both live handling and replay call the same orchestration command.

### 6.7 Meta materializer

The materializer consumes a frozen eligible decision. It does not parse the
message again and does not reload mutable catalog rules to reinterpret it.

It uses trusted paid-lead attribution and current approved Meta routing, then
creates one `ConversionEventLog` and queues one delivery.

## 7. Processing Operations

### 7.1 Automatic processing

1. Store and deduplicate raw delivery.
2. Normalize the Umbler occurrence.
3. Resolve the paid lead.
4. Evaluate and persist the canonical decision.
5. Apply the rule mode.
6. Queue an eligible production decision.
7. Record Meta delivery in the existing audit flow.

### 7.2 Retry

`Retry` repeats a technical side effect using the same frozen decision. It is
available only for retryable technical states and never changes catalog items,
lead attribution or business value.

### 7.3 Reevaluation

`Reevaluate` is explicit. It reruns the current rule and catalog after an
operator changed configuration or corrected a review. It creates a new
decision version while retaining the previous version.

### 7.4 Review approval

Approval creates a corrected eligible decision version and sends it through
the same orchestrator and dedupe lock as automatic processing.

Rejection closes the review with a reason and preserves its history.

## 8. Catalog Decision Matrix

| Input                                  | Paid lead | Result                   |
| -------------------------------------- | --------- | ------------------------ |
| No configured trigger                  | Any       | Ignore                   |
| Trigger, all required attributes blank | Any       | `ignored_empty_template` |
| Trigger, meaningful partial attributes | Missing   | `ignored_untracked_lead` |
| Trigger, meaningful partial attributes | Resolved  | `review_required`        |
| Trigger, complete unknown combination  | Missing   | `ignored_untracked_lead` |
| Trigger, complete unknown combination  | Resolved  | `review_required`        |
| Trigger, complete valid combination    | Missing   | `ignored_untracked_lead` |
| Trigger, complete valid combination    | Resolved  | `eligible`               |

Catalog parsing also enforces:

- aliases are normalized before matching;
- `2x 2,44` means quantity two;
- repeated complete attribute pairs create multiple line items;
- values come from catalog variants, not payment text;
- unrelated accessories and address/payment fields do not change the catalog
  total.

## 9. Audit and Product Surfaces

### 9.1 Settings

Owns rules, triggers, author scope, channel scope, average value, catalog,
aliases and a side-effect-free message tester.

### 9.2 Integrations

Owns Umbler connection health, discovered channels and observation/production
mode. It does not duplicate rule editing.

### 9.3 Purchase review

Shows only actionable `review_required` purchases for known paid leads.
Pending, rejected and historical views are separate.

### 9.4 Meta events

Shows created, queued, sent, blocked and failed Meta events. It does not show
empty templates or untracked leads as conversion failures.

### 9.5 Backoffice

Provides the complete trace:

`delivery -> normalized occurrence -> decision -> review/execution -> event log
-> Meta response`

Filters include workspace, connection, channel, rule, event type, decision,
technical status and date-time range down to the minute.

Actions are explicit:

- approve and send;
- retry technical delivery;
- reevaluate business decision;
- inspect trace and raw payload.

## 10. Legacy Data and Retention

The migration is idempotent and preserves raw payloads.

- existing empty-template reviews are closed as ignored and removed from
  operational review;
- existing unknown-lead reviews are closed as ignored and removed from
  operational review;
- already sent or deduplicated events are never recreated;
- legacy records remain available in internal history;
- no migration performs a Meta side effect.

Existing payload-retention rules remain authoritative. Expired payloads cannot
be reevaluated, but their normalized audit and terminal reason remain visible.

## 11. Testing Strategy

The test suite uses representative real Umbler fixtures for:

- team, bot and contact messages;
- blank templates;
- partial and invalid catalog data;
- valid single and multi-item purchases;
- aliases and quantities;
- known and unknown paid leads;
- automation callbacks;
- average-value purchases.

Required integration proofs:

- an empty template creates no review or conversion event;
- an untracked lead creates no review or conversion event;
- a partial known-lead purchase creates exactly one review;
- a complete known-lead purchase creates exactly one eligible decision;
- automatic handling and replay converge on the same decision and key;
- concurrent processing creates at most one conversion event;
- qualified-lead lifetime dedupe works;
- purchase 24-hour dedupe and later repurchase work;
- retry does not reinterpret the decision;
- reevaluation creates a new version and retains history.

Frontend contract tests cover labels, action availability, filtering and the
absence of ignored decisions from customer-facing review.

## 12. Rollout and Rollback

The new engine is introduced behind workspace/channel-scoped feature flags.

1. Run in shadow mode and compare old and new decisions.
2. Enable observation for one certified Umbler channel.
3. Run controlled replay.
4. Enable automatic production for that channel.
5. Expand to the remaining channels of the first workspace.
6. Expand to the second Umbler workspace.
7. Retire the old evaluator only after stable production evidence.

Rollback disables the new engine for the affected workspace/channel and leaves
existing raw payloads and decisions intact. No global rollback is required for
a single-customer issue.

## 13. Acceptance Criteria

The hardening wave is complete when:

- no empty template appears in purchase review;
- no untracked lead appears in customer-facing conversion operations;
- every created conversion has a complete trace;
- automatic, replay and manual approval share one decision engine;
- repeated or concurrent processing does not duplicate events;
- retry and reevaluation are visibly distinct;
- all supported Umbler conversion modes pass fixture and database integration
  tests;
- canary workspaces run without unexplained counter divergence or conversion
  loss.
