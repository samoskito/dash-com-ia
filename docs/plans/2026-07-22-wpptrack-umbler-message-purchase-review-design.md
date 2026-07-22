# WppTrack Umbler Message Purchase Review Design

## 1. Status and Scope

This design extends and partially supersedes the structured-catalog and tag
sections of `2026-07-21-wpptrack-umbler-conversion-events-design.md`.

Implementation status on 2026-07-22:

- message triggers, catalog order parsing, purchase review persistence, APIs,
  permissions, review UI and reporting adjustments are implemented locally;
- fixed-average rules can be registered in observation mode;
- rule-specific automation callbacks remain observation-only until a
  representative real Umbler payload is captured and certified;
- the production migration and one-rule canary still require deployment and
  operational validation.

The Umbler account-level `chat tag changed` webhook cannot observe the contact
tags used by the current customers. A dedicated contact-tag webhook is
therefore not part of the production design.

WppTrack will support two complementary conversion paths:

1. a rule-specific automation webhook called explicitly from an Umbler bot
   flow;
2. recognition of standard messages received through the existing Umbler
   message webhook.

Both paths converge on the same internal conversion and business-deduplication
layer.

## 2. Customer Modes

### 2.1 Structured catalog customer

Purchases are recognized only from chat messages. The message may be sent by a
bot, a team member or the contact. It must contain a configured trigger phrase
and one or more complete catalog item combinations.

The catalog is authoritative for prices. Payment descriptions, installment
amounts and unrelated extras do not change the purchase value.

### 2.2 Average-value customer

Bot conversions call a signed, rule-specific automation webhook. Human
conversions are recognized from a configured standard message. Both sources
use the fixed average value stored by the conversion rule.

## 3. Trigger Phrases

Every message-based conversion rule requires one or more trigger phrases.
Examples include:

- `Dados para confirmar o pedido`;
- `Comprovante de encomenda`;
- `Aviso de compra`.

Matching is case-insensitive, accent-insensitive and whitespace-normalized. A
message must contain an exact normalized configured phrase. The production
path does not use fuzzy matching or silently repair trigger text.

Rules also declare the permitted message authors:

- team member and bot;
- contact;
- both.

Catalog rules use `both`. A fixed-average purchase message normally uses team
member and bot.

## 4. Structured Order Parser

Once a trigger phrase matches, the parser reads repeated catalog attribute
pairs in message order. The first approved catalog uses `Tamanho` and
`Modelo`, but labels remain configurable.

The parser supports:

- a single pair such as `Tamanho: 4,90` plus `Modelo: Nacional`;
- repeated pairs in one message;
- quantities such as `2x 2,44`, with normalized spacing;
- configured aliases for attribute values;
- unrelated lines between or after item pairs.

Each complete pair must resolve to exactly one active catalog variant. The
calculated order total is the sum of `quantity * catalog unit price` for every
resolved item.

For example:

```text
Tamanho: 3,05
Modelo: Nacional

Tamanho: 2x 2,44
Modelo: Nacional
```

resolves to:

- one `3,05 / Nacional` item at BRL 1,997.00;
- two `2,44 / Nacional` items at BRL 1,597.00 each;
- catalog total BRL 5,191.00.

Lines describing payment, installments, transport bags, spring boxes, hook
boxes, freight or other uncatalogued extras are ignored for valuation. A
payment amount may be retained as a non-authoritative diagnostic observation,
but it never replaces the catalog total.

## 5. Fail-Closed Classification

WppTrack never guesses a product, quantity or price in the automatic path.

A recognized message is classified as follows:

- `recognized`: every item resolves exactly and may proceed automatically;
- `awaiting_data`: a trigger/template is present but required item data is
  blank;
- `review_required`: attributes are missing, split across messages, unknown,
  ambiguous or malformed;
- `ignored`: no configured trigger phrase is present.

Attributes split across separate messages are not assembled automatically.
They create a review candidate instead.

When a complete message for the same workspace, channel and contact follows an
open empty template, the complete occurrence supersedes and closes the empty
candidate so that the operator does not receive two actionable records.

## 6. Unified Business Deduplication

Automation callbacks and message recognition are separate source triggers but
share business deduplication:

- `QualifiedLead` is accepted once per workspace and paid lead identity;
- `Purchase` uses a rolling 24-hour window per workspace and paid lead
  identity;
- the first materialized source wins;
- later matching sources are retained as auditable duplicates and never send a
  second Meta event.

The check runs under the existing customer-scoped database lock. Provider
retry deduplication remains separate from business deduplication.

## 7. Purchase Review Domain

Every message that matches a trigger phrase creates or updates an auditable
purchase occurrence. The domain stores only the minimum normalized data needed
for operations:

- workspace, rule, connection, channel and source delivery;
- hashed contact identity and resolved paid lead;
- source type and message author type;
- matched trigger phrase;
- extracted line items, quantities, variants, unit prices and subtotals;
- authoritative calculated total and currency;
- optional observed payment amount for diagnostics;
- machine-readable classification and reason codes;
- Meta conversion reference when materialized;
- actor and timestamps for every manual decision.

Recommended lifecycle states are:

- `recognized`;
- `awaiting_data`;
- `review_required`;
- `approved`;
- `sent`;
- `duplicate`;
- `rejected`;
- `failed`;
- `corrected_after_send`.

Full message text, address and unrelated personal data are not copied into the
long-lived review record. Raw source payload access continues to use the
encrypted inbox, retention window and audited platform-owner boundary.

## 8. Review Actions

Workspace Owners and Administrators may:

- select catalog variants;
- add or remove line items;
- change quantities;
- inspect unit prices, subtotals and the resulting total;
- approve an unsent purchase;
- reject a candidate as not being a purchase;
- correct a purchase after it was sent;
- provide a required correction or rejection reason.

Analysts have read-only access.

Approving an unsent candidate materializes the corrected conversion and sends
it to Meta immediately through the existing conversion log and CAPI queue,
subject to paid-lead attribution, route, time-window and environment guards.

Correcting a purchase already sent to Meta does not send another event and
does not rewrite the original delivery record. It creates an append-only
reporting adjustment containing the previous value, effective corrected value,
actor, reason and timestamp. WppTrack reports use the effective value while
the Meta audit preserves the original event.

## 9. User Interface

The existing `Eventos Meta` page gains two tabs:

1. `Conversoes`;
2. `Revisao de compras`, with an actionable pending counter.

The review list prioritizes actionable states and supports workspace-safe
filters for status, rule, channel, date and contact. Each row shows normalized
items and the blocking reason without exposing unnecessary raw payload data.

The detail surface provides the line-item editor, calculated totals, source
summary, audit timeline and explicit approve/reject actions. Submitted actions
must be idempotent and protected against concurrent approval.

## 10. Safety and Permissions

- All reads and mutations are scoped by workspace membership.
- Only Owner and Administrator roles may mutate purchase reviews.
- Platform-owner raw payload access remains in the backoffice boundary.
- Manual approval revalidates the paid lead and exact Meta route at execution
  time.
- No public callback may choose workspace, Meta identifiers, event name,
  catalog price or average value.
- Every approval, rejection and correction writes an audit record.
- Automatic parsing and manual approval use the same dedupe lock.

## 11. Implementation Order

1. Extend message-rule contracts with trigger phrases and allowed authors.
2. Replace the single-variant parser result with an order result containing
   line items and quantities.
3. Add purchase occurrence, line-item and reporting-adjustment persistence.
4. Update observation to accept configured inbound contact messages and create
   fail-closed review candidates.
5. Unify automation and message business deduplication.
6. Add review APIs and Owner/Administrator authorization.
7. Add the `Revisao de compras` tab and correction editor.
8. Rework reporting to use an append-only effective-value adjustment.
9. Certify representative real Umbler fixtures in observation.
10. Activate one canary rule before enabling automatic production processing.

## 12. Required Test Coverage

- trigger phrase normalization and aliases;
- permitted author enforcement;
- blank templates and superseding complete responses;
- one and multiple item pairs;
- quantity parsing including `2x 2,44`;
- unknown and ambiguous variants;
- ignored payment and accessory lines;
- automation/message cross-source deduplication;
- QualifiedLead lifetime deduplication;
- Purchase rolling 24-hour deduplication;
- workspace isolation and role authorization;
- concurrent manual approvals;
- approval-to-CAPI materialization;
- post-send reporting correction without Meta resend;
- redacted audit and encrypted raw-payload access boundaries.

## 13. Out of Scope for This Wave

- fuzzy automatic conversion on misspelled trigger phrases;
- assembling an order from attributes spread across multiple messages;
- dynamic prices inferred from arbitrary free text;
- automatic valuation of accessories, freight or payment fees;
- editing or retracting an event already accepted by Meta.
