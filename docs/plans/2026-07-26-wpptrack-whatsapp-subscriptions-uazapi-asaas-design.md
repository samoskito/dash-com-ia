# WppTrack WhatsApp Subscriptions, Uazapi and Asaas Design

Date: 2026-07-26
Status: Approved for implementation

## 1. Objective

Add self-service WhatsApp activation and recurring billing without changing or
interrupting the channels that already operate in production.

The first native connection provider is Uazapi. A customer with an active plan
and an available WhatsApp seat can create an instance, scan its QR Code and
start receiving messages. External providers such as Umbler and Gupshup do not
use a QR Code, but every production WhatsApp number still consumes one seat.

Asaas is the financial authority for checkout, recurring charges, cancellation
and automatic service-invoice issuance.

## 2. Approved Commercial Contract

### 2.1 Package pricing

The customer does not pay one independent Asaas subscription for each number.
Each workspace has one monthly package with:

- a total monthly price;
- a maximum number of active WhatsApp numbers;
- one recurring Asaas subscription;
- zero or more active WhatsApp seats up to that limit.

Examples of valid negotiated packages include:

- BRL 50 per month for up to 3 numbers;
- BRL 100 per month for up to 10 numbers;
- BRL 30 per month for up to 5 numbers;
- an exempt package with a defined number limit and BRL 0 billing.

The number is the unit of consumption and entitlement. The workspace package is
the unit of financial billing.

### 2.2 Plan types

Plans can be:

- `standard`: public offer available to eligible customers;
- `custom`: private negotiated offer assigned by the platform owner;
- `exempt`: private zero-price offer assigned by the platform owner;
- `legacy_protected`: migration-only offer that preserves current production.

Only the platform owner can create, assign or change custom plans, exemptions
and legacy protection. Workspace owners can select eligible standard plans and
complete payment, but cannot grant themselves commercial exceptions.

### 2.3 Price and capacity snapshots

Assigning a plan creates immutable commercial snapshots on the workspace
contract:

- monthly price in cents;
- included WhatsApp seat count;
- plan name and version;
- assignment reason and actor;
- effective date.

Editing a plan catalog entry must not silently change an existing contract.
Changing an active customer requires an explicit audited contract operation.

### 2.4 Capacity enforcement

Every active Uazapi instance or active external WhatsApp channel consumes one
seat. When all seats are occupied:

- a new Uazapi instance cannot be created;
- a discovered external channel cannot be promoted to production;
- the UI explains that the plan limit has been reached;
- only a plan upgrade, seat release or platform-owner adjustment can continue.

A discovered Umbler or Gupshup channel can remain in observation without
consuming a seat. Its payloads remain preserved, but it cannot create automatic
production conversions until it has an active seat.

## 3. Domain Model

### 3.1 SubscriptionPlan

Evolve the current plan catalog with:

- `kind`: standard, custom, exempt or legacy protected;
- `visibility`: public or private;
- `monthlyPriceCents`;
- `includedWhatsappNumbers`;
- `active`;
- normal audit timestamps.

The existing `pricePerWhatsappInstanceCents` field becomes legacy-compatible
input during the migration and is not the source of truth for new contracts.

### 3.2 WorkspaceBillingProfile

Store the payer data required to create or update the Asaas customer:

- legal or personal name;
- CPF/CNPJ;
- billing email;
- phone;
- postal code and address fields;
- Asaas customer ID;
- validation and update timestamps.

Sensitive financial credentials and card data never pass through or persist in
WppTrack. Payment collection stays on the hosted Asaas Checkout.

### 3.3 WorkspaceSubscription

Evolve the current workspace subscription into the active commercial contract:

- assigned plan and immutable commercial snapshot;
- Asaas customer, checkout and subscription IDs;
- billing method when known;
- current financial status;
- current period start and end;
- grace deadline;
- cancellation request and access end timestamps;
- fiscal configuration status;
- activation, suspension and cancellation timestamps.

There is at most one current contract per workspace. Historical changes are
recorded separately instead of overwriting commercial evidence.

The current `activeInstances` counter is deprecated. Seat use is derived from
the seat table to avoid drift.

### 3.4 WhatsappSeat

Create a unified entitlement record for one billable WhatsApp number:

- workspace and current contract;
- provider;
- normalized connected phone when available;
- either a `WhatsappInstance` reference or an `InboundWebhookChannel`
  reference;
- status: reserved, active, suspended or released;
- reservation expiry;
- activation, suspension and release timestamps.

The database must guarantee that:

- a Uazapi instance has at most one current seat;
- an inbound webhook channel has at most one current seat;
- a seat targets exactly one provider resource;
- cross-workspace references are impossible.

### 3.5 BillingProviderEvent

Persist Asaas event identity, type, resource IDs, processing status and
timestamps. A unique provider event ID makes webhook processing idempotent.
Payload storage follows the existing redaction and secret-handling policy.

### 3.6 BillingContractAudit

Record plan assignment, price or capacity changes, exemption, cancellation,
reactivation, suspension and seat operations with:

- workspace;
- actor;
- prior and next commercial snapshots;
- reason;
- provider references;
- timestamp.

## 4. Subscription State Machine

The internal contract uses explicit states:

- `draft`;
- `awaiting_payment`;
- `active`;
- `past_due`;
- `grace_period`;
- `cancel_at_period_end`;
- `suspended`;
- `canceled`;
- `exempt`;
- `legacy_protected`.

Creating an Asaas subscription is not payment confirmation. The first confirmed
charge activates the contract. Browser redirects never grant access.

An exempt or legacy-protected contract does not create an Asaas subscription.
It is activated through an audited platform-owner operation.

## 5. Checkout and Payment

### 5.1 Hosted recurring checkout

Use Asaas Checkout in recurring mode with credit card and Pix. The API creates
the checkout from the trusted contract snapshot and sends a stable WppTrack
external reference.

The customer completes payment on the Asaas-hosted page. WppTrack activates the
contract only after the corresponding payment webhook is validated and
processed.

### 5.2 Idempotency and reconciliation

Webhook handling must:

- authenticate the configured Asaas webhook token;
- persist provider event identity before side effects;
- tolerate at-least-once delivery;
- resolve workspace and contract only from trusted local references;
- never create duplicate seats, subscriptions or activations;
- support an audited reconciliation command for missed provider events.

### 5.3 Plan changes

An upgrade can take effect only through an explicit platform-owner or allowed
standard-plan operation. A downgrade is blocked when the new capacity is below
current seat use.

Changes to an Asaas subscription affect future charges according to provider
rules. The local contract stores the exact effective date and never rewrites
past invoices or paid-charge history.

## 6. Cancellation and Delinquency

### 6.1 Self-service cancellation

The workspace owner can cancel freely from the product. The operation:

1. requires an explicit confirmation;
2. records the request and optional reason;
3. removes the Asaas recurrence;
4. prevents new renewals;
5. preserves access until the current paid period ends;
6. suspends the workspace and its seats at the access-end timestamp.

Already paid charges and fiscal history remain available. The operation is
idempotent and can be safely retried after a provider timeout.

### 6.2 Three-day grace period

When a recurring charge becomes overdue:

- the contract enters a three-day grace period;
- existing processing remains active during grace;
- the UI displays the financial warning;
- new seats and plan changes are blocked.

After the grace deadline:

- automatic production processing is suspended;
- QR creation and new activations are blocked;
- instances, routes and historical payloads are preserved;
- external webhooks can continue observation intake.

A later payment confirmation reactivates the contract and seats automatically.
Preserved external history is available to the existing controlled recovery
flows; it is never released as an unbounded automatic backlog.

## 7. Automatic Service Invoices

After creating the Asaas subscription, WppTrack configures invoice settings
with:

- `effectiveDatePeriod = ON_PAYMENT_CONFIRMATION`;
- the platform's validated municipal service ID or code;
- the approved service description and fiscal observations;
- the configured tax values required by the issuer account.

The Asaas account must have invoice issuance enabled. Fiscal service codes,
taxes and descriptions must be validated with the platform accountant before
production.

Invoice webhooks and reconciliation expose:

- scheduled;
- issued;
- authorized;
- canceled;
- failed or rejected.

A fiscal failure creates a high-priority backoffice alert but does not suspend a
customer whose payment is confirmed. The platform owner can inspect the reason
and retry after correcting the fiscal configuration.

## 8. Uazapi Activation Journey

With an active contract and available capacity:

1. the workspace owner enters an instance display name;
2. the backend reserves one seat with a bounded expiry;
3. the backend creates the Uazapi instance;
4. the backend stores its encrypted instance token;
5. the backend configures the per-instance webhook;
6. the frontend requests a real QR Code and status;
7. status polling stops when connected, expired or failed;
8. the reserved seat becomes active when the instance connects.

Provisioning failures release the reservation. An empty or invalid provider
response must never mark a local instance active.

Disconnecting a number does not automatically cancel the workspace package.
Removing the instance through the approved destructive flow releases its seat.

## 9. External Provider Journey

An Umbler or Gupshup webhook connection can discover several channels. The
connection itself is not billable.

For each discovered channel:

- observation and encrypted intake remain available;
- the UI shows number, provider, readiness and billing state;
- `Activate channel` checks contract and capacity;
- a successful activation creates a seat and promotes only that channel;
- pausing production preserves the seat;
- removing/releasing the channel frees the seat through a confirmed action.

Connection-wide production controls remain operational, but billing
authorization is evaluated per channel before materialization.

## 10. Authorization and Product Surfaces

### 10.1 Workspace application

`Settings > Subscription` shows:

- assigned plan;
- monthly total;
- used and available WhatsApp seats;
- payment status and current period;
- invoice history and fiscal state;
- checkout or payment action;
- self-service cancellation.

`Integrations > WhatsApp` unifies:

- Uazapi instances and QR connection;
- Umbler/Gupshup discovered channels;
- seat use;
- provider status;
- observation versus production state;
- actionable block reasons.

### 10.2 Backoffice

The platform owner can:

- create standard and private plans;
- assign custom, exempt and legacy plans;
- inspect contracts, seats, payments and invoices;
- change commercial terms with a required reason;
- reconcile provider state;
- inspect fiscal failures;
- migrate one workspace at a time.

Workspace admins and analysts cannot change billing. Only the workspace owner
can checkout or cancel.

## 11. Protected Migration

The rollout is additive:

1. add new fields and tables without changing runtime authorization;
2. backfill every current production number into a seat;
3. create one `legacy_protected` contract per existing workspace with capacity
   equal to its current active seat count;
4. preserve all existing statuses, tokens, routes and production timestamps;
5. block only additional activations until a definitive plan is assigned;
6. enable new billing enforcement behind a feature flag;
7. validate one sandbox workspace and one production canary;
8. expand gradually.

No migration reconnects Uazapi, changes an external webhook URL, replays
historical events or modifies a Meta route.

## 12. Failure Handling and Observability

Operational state must distinguish:

- plan missing;
- awaiting first payment;
- capacity reached;
- checkout expired;
- provider provisioning failed;
- QR expired;
- payment overdue and grace deadline;
- subscription canceled;
- invoice configuration missing;
- invoice issuance failed.

Logs and audit records use internal IDs and redacted summaries. They never
include API keys, card data, full provider tokens or secrets embedded in webhook
URLs.

## 13. Acceptance Criteria

- A workspace has one active package and a deterministic WhatsApp seat limit.
- Custom and exempt plans can only be assigned by the platform owner.
- Current production numbers continue operating under legacy protection.
- A plan at capacity cannot activate another number.
- A Uazapi QR Code is unavailable before first payment confirmation.
- Uazapi provisioning failure cannot activate a local instance.
- One external webhook connection can contain several independently billed
  channels.
- Observation does not consume a seat or create production conversions.
- Every Asaas webhook is idempotent.
- Canceling prevents renewal and preserves access until the paid period ends.
- Three-day grace behavior is deterministic and reversible after payment.
- Every confirmed recurring payment receives automatic invoice configuration.
- Fiscal failures are visible and recoverable without hiding a paid customer.
- Cross-workspace plan, contract, seat and provider references are rejected.

## 14. External References

- Asaas Checkout:
  https://docs.asaas.com/docs/checkout-asaas
- Asaas recurring checkout:
  https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
- Remove an Asaas subscription:
  https://docs.asaas.com/reference/remover-assinatura
- Automatic invoices for subscriptions:
  https://docs.asaas.com/docs/emitir-notas-fiscais-automaticamente-para-assinaturas
- Uazapi documentation:
  https://docs.uazapi.com/
