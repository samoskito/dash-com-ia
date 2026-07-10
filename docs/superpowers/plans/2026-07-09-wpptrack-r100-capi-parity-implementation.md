# WppTrack R100 CAPI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align WppTrack's Meta CAPI event payloads with the proven R100 WPP conversion module while keeping chat, CRM and Kanban out of scope.

**Architecture:** Reuse WppTrack's existing CAPI pipeline: Uazapi webhook creates conversion logs, BullMQ sends ready logs, `MetaCapiAdapter` posts to the selected Pixel, and the selected Facebook Page is sent as `page_id`. This wave only tightens event payload construction and persistent project memory; WABA remains future-only.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ, Vitest, Zod shared contracts, Meta Graph API Conversions API.

---

## Scope

This plan keeps:

- Meta CAPI destination as the single selected Pixel + Facebook Page.
- Token source as the encrypted Meta OAuth token already stored by the backend.
- Uazapi/API nao oficial as the current WhatsApp provider.
- R100 WPP as reference for event payload shape and conversion behavior.

This plan does not add:

- Chat, CRM, Kanban, attendants or inbox flows from R100.
- WhatsApp Cloud API/WABA behavior.
- Multiple conversion Pixels.
- Formula engine, AI value extraction or external purchase webhook ingestion.

## Task 1: R100 Purchase `custom_data` parity

**Files:**
- Modify: `apps/api/src/conversion-events/meta-capi-payload.builder.ts`
- Modify: `apps/api/test/meta-capi-payload-builder.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test showing that `Purchase` payloads complete the same Meta fields R100 uses when items are present:

```ts
it("fills R100-style Purchase item metadata when missing", () => {
  const payload = buildMetaCapiPayload({
    eventName: "Purchase",
    eventTime: new Date("2026-07-09T12:00:00.000Z"),
    eventId: "workspace_1:lead_1:rule_1:Purchase:ad_1",
    phoneHash: "phone_hash_1",
    ctwaClid: "clid_1",
    pageId: "page_1",
    adId: "ad_1",
    valueCents: 19900,
    currency: "BRL",
    contentName: "Plano mensal",
    customData: {
      contents: [
        { id: "plan_1", quantity: 2, item_price: 99.5 },
        { id: "setup_1" }
      ]
    }
  });

  expect(payload.data[0].custom_data).toMatchObject({
    ad_id: "ad_1",
    value: 199,
    currency: "BRL",
    content_name: "Plano mensal",
    order_id: "workspace_1:lead_1:rule_1:Purchase:ad_1",
    content_type: "product",
    num_items: 3,
    contents: [
      { id: "plan_1", quantity: 2, item_price: 99.5 },
      { id: "setup_1" }
    ]
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @wpptrack/api test -- meta-capi-payload-builder.test.ts
```

Expected: FAIL because `order_id`, `content_type` and `num_items` are not filled automatically.

- [ ] **Step 3: Implement minimal builder behavior**

In `buildMetaCapiPayload`, derive a Purchase-specific custom data block:

```ts
const purchaseDefaults =
  input.eventName === "Purchase"
    ? buildPurchaseCustomDataDefaults(input.eventId, input.customData ?? {})
    : {};
```

Add a helper that:

- Sets `order_id` to the current event id only when missing.
- Sets `content_type` to `product` only when `contents` exists and `content_type` is missing.
- Sets `num_items` to the sum of item quantities, defaulting each missing quantity to `1`, only when `contents` exists and `num_items` is missing.
- Preserves explicit custom fields supplied by the caller.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @wpptrack/api test -- meta-capi-payload-builder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/conversion-events/meta-capi-payload.builder.ts apps/api/test/meta-capi-payload-builder.test.ts
git commit -m "feat: align purchase capi payload with r100"
```

## Task 2: Adapter coverage for completed Purchase payload

**Files:**
- Modify: `apps/api/test/meta-capi-adapter.test.ts`

- [ ] **Step 1: Write or update the adapter test**

Extend the Purchase adapter test so it verifies the HTTP body includes:

```ts
order_id: "purchase_event_1",
content_type: "product",
num_items: 2
```

when the input has `eventName: "Purchase"` and `customData.contents`.

- [ ] **Step 2: Run adapter test**

Run:

```bash
pnpm --filter @wpptrack/api test -- meta-capi-adapter.test.ts
```

Expected: PASS using the builder behavior from Task 1.

- [ ] **Step 3: Commit if the test changed**

```bash
git add apps/api/test/meta-capi-adapter.test.ts
git commit -m "test: cover r100 purchase capi adapter payload"
```

## Task 3: Persistent project memory

**Files:**
- Modify: `Projeto.md`

- [ ] **Step 1: Update the CAPI decision notes**

Add a concise note under current implementation status:

```md
- Paridade R100 WPP para CAPI: WppTrack deve reaproveitar o comportamento de envio de conversoes do R100, incluindo payload `business_messaging`, `page_id`, `ctwa_clid`, `Purchase` com `order_id`, `content_type`, `contents` e `num_items`, mas sem trazer chat, CRM, Kanban ou atendimento.
```

- [ ] **Step 2: Commit docs**

```bash
git add Projeto.md docs/superpowers/plans/2026-07-09-wpptrack-r100-capi-parity-implementation.md
git commit -m "docs: record r100 capi parity scope"
```

## Task 4: Final verification

- [ ] **Step 1: Run focused CAPI tests**

Run:

```bash
pnpm --filter @wpptrack/api test -- meta-capi-payload-builder.test.ts meta-capi-adapter.test.ts conversion-events-service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run API typecheck**

Run:

```bash
pnpm --filter @wpptrack/api typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: clean or only intentional uncommitted changes called out in the final response.

## Self-Review

Spec coverage:

- Keeps Page ID and Pixel destination for current non-official WhatsApp API phase.
- Keeps WABA out of the current implementation.
- Uses R100 only for conversion payload parity, not for CRM/chat.
- Adds focused tests before code changes.

Placeholder scan:

- No placeholder tasks or future-only implementation steps are included.

Type consistency:

- The plan uses existing `ConversionEventCustomDataDto`, `MetaCapiPayloadInput`, `MetaCapiAdapter` and Vitest files already present in the repository.
