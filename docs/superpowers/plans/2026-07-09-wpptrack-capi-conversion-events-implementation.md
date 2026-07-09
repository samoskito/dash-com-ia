# WppTrack CAPI Conversion Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full WhatsApp-to-Meta CAPI conversion path with CTWA parsing, value-aware events, queue sending, diagnostics, and a controlled test endpoint.

**Architecture:** Keep WppTrack's current NestJS/Prisma/BullMQ architecture and adapt the proven R100 WPP CAPI contract into focused backend units. Uazapi parsing becomes testable, conversion logs become auditable, and Meta payload generation becomes a dedicated builder used by the worker and manual test flow.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ, Zod shared contracts, Vitest, Meta Graph API Conversions API.

---

## Scope Check

The approved spec is one cohesive backend feature: conversion contracts, parser, payload builder, worker behavior, diagnostics, and manual testing. It intentionally does not implement final ROAS formulas, AI value extraction, chat UI, multiple conversion Pixels, or WhatsApp Cloud API.

No new public user-facing token field is introduced. The operational source of truth stays as the encrypted Meta OAuth connection plus `MetaConversionDestination` Pixel/Page. The existing hidden `META_CAPI_ACCESS_TOKEN` fallback can remain as a technical fallback only, not as a client-facing setup step.

## File Structure

Create:

- `packages/shared/src/schemas/conversion-events.ts` - shared event registry, event value requirements, manual test input schema, and log status/error enums.
- `apps/api/src/conversion-events/conversion-event-registry.ts` - API registry helpers for supported events and value requirements.
- `apps/api/src/conversion-events/meta-capi-payload.builder.ts` - pure payload builder for Meta Business Messaging CAPI.
- `apps/api/src/webhooks/uazapi-webhook-parser.ts` - pure parser for Uazapi text, labels, phone, attribution and `ctwa_clid`.
- `apps/api/test/conversion-event-registry.test.ts`
- `apps/api/test/meta-capi-payload-builder.test.ts`
- `apps/api/test/uazapi-webhook-parser.test.ts`

Modify:

- `packages/shared/src/index.ts`
- `packages/shared/src/schemas/conversion-rules.ts`
- `packages/shared/src/schemas/diagnostics.ts`
- `packages/shared/tests/contracts.test.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/conversion-events/meta-capi.adapter.ts`
- `apps/api/src/conversion-events/conversion-events.service.ts`
- `apps/api/src/conversion-events/conversion-events.module.ts`
- `apps/api/src/leads/leads.service.ts`
- `apps/api/src/webhooks/webhooks.controller.ts`
- `apps/api/src/diagnostics/diagnostics.controller.ts`
- `apps/api/src/diagnostics/diagnostics.module.ts`
- `apps/api/src/diagnostics/diagnostics.service.ts`
- `apps/api/test/meta-capi-adapter.test.ts`
- `apps/api/test/conversion-events-service.test.ts`
- `apps/api/test/webhooks-controller.test.ts`
- `apps/api/test/diagnostics-controller.test.ts`
- `Projeto.md`

## Target Data Contracts

Add these fields to Prisma:

```prisma
model Lead {
  ctwaClid      String?
  ctwaSourceUrl String?

  @@index([workspaceId, ctwaClid])
}

model ConversionEventLog {
  eventId     String?
  ctwaClid    String?
  customData  Json?
  valueCents  Int?
  currency    String?
  contentName String?
}

model ConversionRule {
  defaultValueCents Int?
  defaultCurrency   String?
  defaultContentName String?
  defaultItems      Json?
}
```

Use these conversion statuses exactly in code and tests:

```ts
export const conversionEventLogStatusValues = [
  "pending_meta_context",
  "pending_value",
  "ready_to_send",
  "queued",
  "sent",
  "error",
  "not_configured",
  "skipped"
] as const;
```

Use these diagnostic error codes exactly:

```ts
export const conversionEventErrorCodeValues = [
  "MissingMetaDestination",
  "MissingAccessToken",
  "MissingPhoneHash",
  "MissingCtwaClid",
  "MissingAdId",
  "EventValueMissing",
  "MetaCapiRejected",
  "MetaCapiNetworkError"
] as const;
```

## Task 1: Shared Conversion Event Contracts

**Files:**
- Create: `packages/shared/src/schemas/conversion-events.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/schemas/conversion-rules.ts`
- Modify: `packages/shared/src/schemas/diagnostics.ts`
- Modify: `packages/shared/tests/contracts.test.ts`

- [ ] **Step 1: Write failing shared contract tests**

Add these imports in `packages/shared/tests/contracts.test.ts`:

```ts
import {
  conversionEventNameSchema,
  conversionEventLogStatusSchema,
  conversionEventErrorCodeSchema,
  conversionEventTestInputSchema,
  conversionRuleCreateInputSchema
} from "../src";
```

Add these tests:

```ts
it("validates supported Meta CAPI WhatsApp event names", () => {
  expect(conversionEventNameSchema.parse("LeadSubmitted")).toBe("LeadSubmitted");
  expect(conversionEventNameSchema.parse("QualifiedLead")).toBe("QualifiedLead");
  expect(conversionEventNameSchema.parse("Purchase")).toBe("Purchase");
  expect(conversionEventNameSchema.parse("OrderDelivered")).toBe("OrderDelivered");
  expect(() => conversionEventNameSchema.parse("Contact")).toThrow();
});

it("validates conversion event statuses and error codes", () => {
  expect(conversionEventLogStatusSchema.parse("pending_meta_context")).toBe(
    "pending_meta_context"
  );
  expect(conversionEventLogStatusSchema.parse("pending_value")).toBe(
    "pending_value"
  );
  expect(conversionEventErrorCodeSchema.parse("MissingCtwaClid")).toBe(
    "MissingCtwaClid"
  );
  expect(conversionEventErrorCodeSchema.parse("MetaCapiRejected")).toBe(
    "MetaCapiRejected"
  );
});

it("validates conversion rules with value defaults for Purchase", () => {
  const input = conversionRuleCreateInputSchema.parse({
    name: "Compra por etiqueta",
    triggerType: "whatsapp_label",
    triggerValue: "Venda fechada",
    matchMode: "exact",
    eventName: "Purchase",
    defaultValueCents: 19900,
    defaultCurrency: "BRL",
    defaultContentName: "Plano mensal",
    defaultItems: [{ id: "plan_1", quantity: 1, item_price: 199 }]
  });

  expect(input.defaultValueCents).toBe(19900);
  expect(input.defaultCurrency).toBe("BRL");
});

it("validates a controlled Meta CAPI test input", () => {
  const input = conversionEventTestInputSchema.parse({
    workspaceId: "workspace_1",
    eventName: "QualifiedLead",
    phoneHash: "phone_hash_1",
    adId: "ad_1",
    ctwaClid: "clid_1",
    testEventCode: "TEST12345"
  });

  expect(input.testEventCode).toBe("TEST12345");
});
```

- [ ] **Step 2: Run shared tests to verify RED**

Run:

```bash
pnpm --filter @wpptrack/shared test -- contracts.test.ts
```

Expected: FAIL because the new schemas and fields do not exist.

- [ ] **Step 3: Create the shared conversion-events schema**

Create `packages/shared/src/schemas/conversion-events.ts`:

```ts
import { z } from "zod";

export const conversionEventNameSchema = z.enum([
  "LeadSubmitted",
  "QualifiedLead",
  "OrderShipped",
  "OrderDelivered",
  "OrderCanceled",
  "OrderReturned",
  "RatingProvided",
  "ReviewProvided",
  "ViewContent",
  "AddToCart",
  "CartAbandoned",
  "InitiateCheckout",
  "Purchase",
  "OrderCreated"
]);

export const conversionEventLogStatusSchema = z.enum([
  "pending_meta_context",
  "pending_value",
  "ready_to_send",
  "queued",
  "sent",
  "error",
  "not_configured",
  "skipped"
]);

export const conversionEventErrorCodeSchema = z.enum([
  "MissingMetaDestination",
  "MissingAccessToken",
  "MissingPhoneHash",
  "MissingCtwaClid",
  "MissingAdId",
  "EventValueMissing",
  "MetaCapiRejected",
  "MetaCapiNetworkError"
]);

export const conversionEventItemSchema = z.object({
  id: z.string().trim().min(1),
  quantity: z.number().int().positive().optional(),
  item_price: z.number().positive().optional()
});

export const conversionEventCustomDataSchema = z.object({
  value: z.number().positive().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  order_id: z.string().trim().min(1).optional(),
  content_name: z.string().trim().min(1).optional(),
  content_type: z.string().trim().min(1).optional(),
  contents: z.array(conversionEventItemSchema).optional(),
  num_items: z.number().int().positive().optional(),
  ad_id: z.string().trim().min(1).optional()
});

export const conversionEventTestInputSchema = z.object({
  workspaceId: z.string().trim().min(1),
  leadId: z.string().trim().min(1).optional(),
  eventName: conversionEventNameSchema,
  phoneHash: z.string().trim().min(1),
  adId: z.string().trim().min(1),
  ctwaClid: z.string().trim().min(1),
  valueCents: z.number().int().positive().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  contentName: z.string().trim().min(1).optional(),
  testEventCode: z.string().trim().min(1)
});

export type ConversionEventNameDto = z.infer<typeof conversionEventNameSchema>;
export type ConversionEventLogStatusDto = z.infer<
  typeof conversionEventLogStatusSchema
>;
export type ConversionEventErrorCodeDto = z.infer<
  typeof conversionEventErrorCodeSchema
>;
export type ConversionEventCustomDataDto = z.infer<
  typeof conversionEventCustomDataSchema
>;
export type ConversionEventTestInputDto = z.infer<
  typeof conversionEventTestInputSchema
>;
```

- [ ] **Step 4: Export and reuse the event schema**

Add to `packages/shared/src/index.ts`:

```ts
export * from "./schemas/conversion-events";
```

Modify `packages/shared/src/schemas/conversion-rules.ts`:

```ts
import { conversionEventNameSchema, conversionEventItemSchema } from "./conversion-events";
```

Replace the local `conversionEventNameSchema` definition with the import. Extend create/update/rule schemas with:

```ts
defaultValueCents: z.number().int().positive().nullable().optional(),
defaultCurrency: z.string().trim().min(3).max(3).nullable().optional(),
defaultContentName: z.string().trim().min(1).max(180).nullable().optional(),
defaultItems: z.array(conversionEventItemSchema).nullable().optional()
```

- [ ] **Step 5: Add diagnostics contract fields**

In `packages/shared/src/schemas/diagnostics.ts`, import `conversionEventTestInputSchema` and export:

```ts
export const diagnosticConversionEventTestInputSchema =
  conversionEventTestInputSchema;
export type DiagnosticConversionEventTestInputDto = z.infer<
  typeof diagnosticConversionEventTestInputSchema
>;
```

- [ ] **Step 6: Run shared tests to verify GREEN**

Run:

```bash
pnpm --filter @wpptrack/shared test -- contracts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit shared contracts**

```bash
git add packages/shared/src packages/shared/tests/contracts.test.ts
git commit -m "feat: add capi conversion event contracts"
```

## Task 2: Prisma Fields for CTWA and Value-Aware Conversion Logs

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: timestamped Prisma migration folder ending in `_capi_conversion_events` under `apps/api/prisma/migrations/`

- [ ] **Step 1: Add schema fields**

In `apps/api/prisma/schema.prisma`, add to `Lead`:

```prisma
  ctwaClid           String?
  ctwaSourceUrl      String?
```

Add to the existing `Lead` indexes:

```prisma
  @@index([workspaceId, ctwaClid])
```

Add to `ConversionEventLog`:

```prisma
  eventId                 String?
  ctwaClid                String?
  customData              Json?
  valueCents              Int?
  currency                String?
  contentName             String?
```

Add to `ConversionRule`:

```prisma
  defaultValueCents  Int?
  defaultCurrency    String?
  defaultContentName String?
  defaultItems       Json?
```

- [ ] **Step 2: Create the migration**

Run:

```bash
pnpm --filter @wpptrack/api exec prisma migrate dev --schema prisma/schema.prisma --name capi_conversion_events
```

Expected: Prisma creates one timestamped migration folder ending in `_capi_conversion_events` under `apps/api/prisma/migrations/` and updates the local database.

- [ ] **Step 3: Validate Prisma schema**

Run:

```bash
pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
```

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 4: Regenerate Prisma client**

Run:

```bash
pnpm --filter @wpptrack/api exec prisma generate --schema prisma/schema.prisma
```

Expected: Prisma Client generated successfully.

- [ ] **Step 5: Run API typecheck**

Run:

```bash
pnpm --filter @wpptrack/api typecheck
```

Expected: PASS after generated client includes the new fields.

- [ ] **Step 6: Commit Prisma changes**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: store ctwa and capi conversion data"
```

## Task 3: API Event Registry and Payload Builder

**Files:**
- Create: `apps/api/src/conversion-events/conversion-event-registry.ts`
- Create: `apps/api/src/conversion-events/meta-capi-payload.builder.ts`
- Create: `apps/api/test/conversion-event-registry.test.ts`
- Create: `apps/api/test/meta-capi-payload-builder.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `apps/api/test/conversion-event-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getConversionEventDefinition,
  isConversionEventRequiringValue
} from "../src/conversion-events/conversion-event-registry";

describe("conversion event registry", () => {
  it("marks Purchase as a value event", () => {
    expect(isConversionEventRequiringValue("Purchase")).toBe(true);
    expect(getConversionEventDefinition("Purchase")).toMatchObject({
      eventName: "Purchase",
      requiresValue: true
    });
  });

  it("marks QualifiedLead as a no-value event", () => {
    expect(isConversionEventRequiringValue("QualifiedLead")).toBe(false);
    expect(getConversionEventDefinition("QualifiedLead")).toMatchObject({
      eventName: "QualifiedLead",
      requiresValue: false
    });
  });
});
```

- [ ] **Step 2: Write failing payload builder tests**

Create `apps/api/test/meta-capi-payload-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildMetaCapiPayload } from "../src/conversion-events/meta-capi-payload.builder";

describe("Meta CAPI payload builder", () => {
  it("builds a WhatsApp business messaging payload with CTWA and page_id", () => {
    const payload = buildMetaCapiPayload({
      eventName: "QualifiedLead",
      eventTime: new Date("2026-07-09T12:00:00.000Z"),
      eventId: "event_1",
      phoneHash: "phone_hash_1",
      ctwaClid: "clid_1",
      pageId: "page_1",
      adId: "ad_1"
    });

    expect(payload.data[0]).toMatchObject({
      event_name: "QualifiedLead",
      event_time: 1783598400,
      event_id: "event_1",
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        ph: ["phone_hash_1"],
        ctwa_clid: "clid_1",
        page_id: "page_1"
      },
      custom_data: {
        ad_id: "ad_1"
      }
    });
  });

  it("builds Purchase custom_data with value fields", () => {
    const payload = buildMetaCapiPayload({
      eventName: "Purchase",
      eventTime: new Date("2026-07-09T12:00:00.000Z"),
      eventId: "purchase_1",
      phoneHash: "phone_hash_1",
      ctwaClid: "clid_1",
      pageId: "page_1",
      adId: "ad_1",
      valueCents: 19900,
      currency: "BRL",
      contentName: "Plano mensal"
    });

    expect(payload.data[0].custom_data).toMatchObject({
      ad_id: "ad_1",
      value: 199,
      currency: "BRL",
      content_name: "Plano mensal"
    });
  });

  it("adds test_event_code at the top level when provided", () => {
    const payload = buildMetaCapiPayload({
      eventName: "LeadSubmitted",
      eventTime: new Date("2026-07-09T12:00:00.000Z"),
      eventId: "lead_1",
      phoneHash: "phone_hash_1",
      ctwaClid: "clid_1",
      pageId: "page_1",
      adId: "ad_1",
      testEventCode: "TEST12345"
    });

    expect(payload.test_event_code).toBe("TEST12345");
  });
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
pnpm --filter @wpptrack/api test -- conversion-event-registry.test.ts meta-capi-payload-builder.test.ts
```

Expected: FAIL because the new files do not exist.

- [ ] **Step 4: Implement event registry**

Create `apps/api/src/conversion-events/conversion-event-registry.ts`:

```ts
import type { ConversionEventNameDto } from "@wpptrack/shared";

export type ConversionEventDefinition = {
  eventName: ConversionEventNameDto;
  requiresValue: boolean;
};

export const conversionEventDefinitions: ConversionEventDefinition[] = [
  { eventName: "LeadSubmitted", requiresValue: false },
  { eventName: "QualifiedLead", requiresValue: false },
  { eventName: "OrderShipped", requiresValue: false },
  { eventName: "OrderDelivered", requiresValue: false },
  { eventName: "OrderCanceled", requiresValue: false },
  { eventName: "OrderReturned", requiresValue: false },
  { eventName: "RatingProvided", requiresValue: false },
  { eventName: "ReviewProvided", requiresValue: false },
  { eventName: "ViewContent", requiresValue: true },
  { eventName: "AddToCart", requiresValue: true },
  { eventName: "CartAbandoned", requiresValue: true },
  { eventName: "InitiateCheckout", requiresValue: true },
  { eventName: "Purchase", requiresValue: true },
  { eventName: "OrderCreated", requiresValue: true }
];

const definitionsByName = new Map(
  conversionEventDefinitions.map((definition) => [
    definition.eventName,
    definition
  ])
);

export function getConversionEventDefinition(
  eventName: ConversionEventNameDto
): ConversionEventDefinition {
  const definition = definitionsByName.get(eventName);

  if (!definition) {
    throw new Error(`Unsupported conversion event: ${eventName}`);
  }

  return definition;
}

export function isConversionEventRequiringValue(
  eventName: ConversionEventNameDto
): boolean {
  return getConversionEventDefinition(eventName).requiresValue;
}
```

- [ ] **Step 5: Implement payload builder**

Create `apps/api/src/conversion-events/meta-capi-payload.builder.ts`:

```ts
import type { ConversionEventNameDto } from "@wpptrack/shared";

export type MetaCapiPayloadInput = {
  eventName: ConversionEventNameDto;
  eventTime: Date;
  eventId: string;
  phoneHash: string;
  ctwaClid: string;
  pageId: string;
  adId: string;
  valueCents?: number | null;
  currency?: string | null;
  contentName?: string | null;
  customData?: Record<string, unknown> | null;
  testEventCode?: string | null;
};

export type MetaCapiPayload = {
  data: Array<{
    event_name: string;
    event_time: number;
    event_id: string;
    action_source: "business_messaging";
    messaging_channel: "whatsapp";
    user_data: {
      ph: string[];
      ctwa_clid: string;
      page_id: string;
    };
    custom_data: Record<string, unknown>;
  }>;
  test_event_code?: string;
};

export function buildMetaCapiPayload(
  input: MetaCapiPayloadInput
): MetaCapiPayload {
  const customData = {
    ...(input.customData ?? {}),
    ad_id: input.adId,
    ...(typeof input.valueCents === "number"
      ? { value: input.valueCents / 100 }
      : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.contentName ? { content_name: input.contentName } : {})
  };

  return {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(input.eventTime.getTime() / 1000),
        event_id: input.eventId,
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: {
          ph: [input.phoneHash],
          ctwa_clid: input.ctwaClid,
          page_id: input.pageId
        },
        custom_data: customData
      }
    ],
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {})
  };
}
```

- [ ] **Step 6: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @wpptrack/api test -- conversion-event-registry.test.ts meta-capi-payload-builder.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit registry and builder**

```bash
git add apps/api/src/conversion-events/conversion-event-registry.ts apps/api/src/conversion-events/meta-capi-payload.builder.ts apps/api/test/conversion-event-registry.test.ts apps/api/test/meta-capi-payload-builder.test.ts
git commit -m "feat: build meta capi business messaging payloads"
```

## Task 4: Meta CAPI Adapter Uses the Payload Builder

**Files:**
- Modify: `apps/api/src/conversion-events/meta-capi.adapter.ts`
- Modify: `apps/api/test/meta-capi-adapter.test.ts`

- [ ] **Step 1: Add failing adapter tests**

Add to `apps/api/test/meta-capi-adapter.test.ts`:

```ts
it("sends messaging_channel and ctwa_clid in business messaging payloads", async () => {
  let requestedInit: RequestInit | undefined;
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    requestedInit = init;

    return new Response(JSON.stringify({ events_received: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });
  const adapter = new MetaCapiAdapter(
    { META_CAPI_ACCESS_TOKEN: "meta-token", META_GRAPH_API_VERSION: "v24.0" },
    fetchMock as never
  );

  await adapter.sendEvent({
    pixelId: "pixel_1",
    pageId: "page_1",
    eventName: "LeadSubmitted",
    dedupeKey: "dedupe_1",
    phoneHash: "phone_hash_1",
    adId: "ad_1",
    ctwaClid: "clid_1"
  });

  const body = JSON.parse(String(requestedInit?.body));
  expect(body.data[0].messaging_channel).toBe("whatsapp");
  expect(body.data[0].user_data.ctwa_clid).toBe("clid_1");
});

it("returns MissingCtwaClid without calling Meta when CTWA is absent", async () => {
  const fetchMock = vi.fn();
  const adapter = new MetaCapiAdapter(
    { META_CAPI_ACCESS_TOKEN: "meta-token" },
    fetchMock as never
  );

  const result = await adapter.sendEvent({
    pixelId: "pixel_1",
    pageId: "page_1",
    eventName: "LeadSubmitted",
    dedupeKey: "dedupe_1",
    phoneHash: "phone_hash_1",
    adId: "ad_1",
    ctwaClid: null
  });

  expect(result).toMatchObject({
    status: "not_configured",
    errorCode: "MissingCtwaClid"
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run adapter tests to verify RED**

Run:

```bash
pnpm --filter @wpptrack/api test -- meta-capi-adapter.test.ts
```

Expected: FAIL because adapter input/result lacks `ctwaClid`, `errorCode`, value fields, and builder usage.

- [ ] **Step 3: Extend adapter types**

In `apps/api/src/conversion-events/meta-capi.adapter.ts`, update `MetaCapiSendEventInput`:

```ts
export type MetaCapiSendEventInput = {
  accessToken?: string | null;
  pixelId: string | null;
  pageId: string | null;
  eventName: ConversionEventNameDto;
  dedupeKey: string;
  phoneHash: string | null;
  adId: string | null;
  ctwaClid: string | null;
  valueCents?: number | null;
  currency?: string | null;
  contentName?: string | null;
  customData?: Record<string, unknown> | null;
  testEventCode?: string | null;
};
```

Update result:

```ts
export type MetaCapiSendEventResult = {
  status: "not_configured" | "sent" | "error";
  responseSummary: Record<string, unknown> | null;
  errorMessage: string | null;
  errorCode:
    | "MissingMetaDestination"
    | "MissingAccessToken"
    | "MissingPhoneHash"
    | "MissingCtwaClid"
    | "MissingAdId"
    | "MetaCapiRejected"
    | "MetaCapiNetworkError"
    | null;
};
```

- [ ] **Step 4: Replace inline body with builder**

Import:

```ts
import type { ConversionEventNameDto } from "@wpptrack/shared";
import { buildMetaCapiPayload } from "./meta-capi-payload.builder";
```

Before the fetch call, validate each required field:

```ts
if (!accessToken) {
  return {
    status: "not_configured",
    responseSummary: null,
    errorMessage: "Meta OAuth token not configured",
    errorCode: "MissingAccessToken"
  };
}

if (!input.pixelId || !input.pageId) {
  return {
    status: "not_configured",
    responseSummary: null,
    errorMessage: "Meta CAPI pixel id or page id not configured",
    errorCode: "MissingMetaDestination"
  };
}

if (!input.phoneHash) {
  return {
    status: "not_configured",
    responseSummary: null,
    errorMessage: "Phone hash not available for Meta CAPI",
    errorCode: "MissingPhoneHash"
  };
}

if (!input.ctwaClid) {
  return {
    status: "not_configured",
    responseSummary: null,
    errorMessage: "CTWA click id not available for Meta CAPI",
    errorCode: "MissingCtwaClid"
  };
}

if (!input.adId) {
  return {
    status: "not_configured",
    responseSummary: null,
    errorMessage: "Meta ad id not available for Meta CAPI",
    errorCode: "MissingAdId"
  };
}
```

Use:

```ts
body: JSON.stringify(
  buildMetaCapiPayload({
    eventName: input.eventName,
    eventTime: new Date(),
    eventId: input.dedupeKey,
    phoneHash: input.phoneHash,
    ctwaClid: input.ctwaClid,
    pageId: input.pageId,
    adId: input.adId,
    valueCents: input.valueCents,
    currency: input.currency,
    contentName: input.contentName,
    customData: input.customData,
    testEventCode: input.testEventCode
  })
)
```

When `response.ok` is false, return `errorCode: "MetaCapiRejected"`. When fetch throws, catch and return `errorCode: "MetaCapiNetworkError"`.

- [ ] **Step 5: Run adapter tests to verify GREEN**

Run:

```bash
pnpm --filter @wpptrack/api test -- meta-capi-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit adapter changes**

```bash
git add apps/api/src/conversion-events/meta-capi.adapter.ts apps/api/test/meta-capi-adapter.test.ts
git commit -m "feat: send ctwa business messaging capi events"
```

## Task 5: Uazapi Parser With CTWA Extraction

**Files:**
- Create: `apps/api/src/webhooks/uazapi-webhook-parser.ts`
- Create: `apps/api/test/uazapi-webhook-parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `apps/api/test/uazapi-webhook-parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseUazapiWebhook } from "../src/webhooks/uazapi-webhook-parser";

describe("Uazapi webhook parser", () => {
  it("extracts CTWA and attribution from message referral", () => {
    const parsed = parseUazapiWebhook({
      event: "message.received",
      id: "event_1",
      message: {
        text: "quero comprar",
        referral: {
          ctwa_clid: "clid_1",
          source_url: "https://fb.com/ad",
          ad_id: "ad_1",
          adset_id: "adset_1",
          campaign_id: "cmp_1"
        }
      },
      contact: { phone: "+55 11 99999-1234", name: "Maria" }
    });

    expect(parsed).toMatchObject({
      eventType: "message.received",
      externalEventId: "event_1",
      messageText: "quero comprar",
      phone: "+55 11 99999-1234",
      contactName: "Maria",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      ctwaSourceUrl: "https://fb.com/ad"
    });
  });

  it("extracts labels from strings and label objects", () => {
    const parsed = parseUazapiWebhook({
      labels: ["Venda fechada", { name: "VIP" }, { title: "BPC" }]
    });

    expect(parsed.labels).toEqual(["Venda fechada", "VIP", "BPC"]);
  });

  it("does not treat ctwaPayload as ctwa_clid", () => {
    const parsed = parseUazapiWebhook({
      ctwaPayload: "internal_blob",
      message: { referral: { ctwaPayload: "nested_blob" } }
    });

    expect(parsed.ctwaClid).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run parser tests to verify RED**

Run:

```bash
pnpm --filter @wpptrack/api test -- uazapi-webhook-parser.test.ts
```

Expected: FAIL because parser file does not exist.

- [ ] **Step 3: Implement parser**

Create `apps/api/src/webhooks/uazapi-webhook-parser.ts` with exported type and function:

```ts
import { createHash } from "node:crypto";

export type UazapiWebhookBody = Record<string, unknown>;

export type ParsedUazapiWebhook = {
  eventType: string;
  externalEventId?: string;
  leadId?: string;
  phone?: string;
  phoneHash?: string;
  contactName?: string;
  messageText?: string;
  labels: string[];
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  ctwaClid?: string;
  ctwaSourceUrl?: string;
  providerInstanceId?: string;
};

export function parseUazapiWebhook(
  body: UazapiWebhookBody
): ParsedUazapiWebhook {
  const message = recordValue(body.message);
  const context = recordValue(body.context);
  const referral =
    recordValue(body.referral) ??
    recordValue(message?.referral) ??
    recordValue(context?.referral);
  const adsContext =
    recordValue(body.ads_context_data) ??
    recordValue(body.adsContextData) ??
    recordValue(referral?.ads_context_data) ??
    recordValue(referral?.adsContextData);
  const phone = getPhone(body);

  return {
    eventType: firstString(body.event) ?? firstString(body.type) ?? "uazapi.webhook",
    externalEventId:
      firstString(body.id) ??
      firstString(body.eventId) ??
      firstString(body.externalEventId),
    leadId: firstString(body.leadId),
    phone,
    phoneHash: firstString(body.phoneHash) ?? hashPhone(phone),
    contactName: getContactName(body),
    messageText: getMessageText(body),
    labels: getLabels(body),
    campaignId:
      firstString(body.campaignId) ??
      firstString(body.campaign_id) ??
      firstString(body.utm_campaign) ??
      firstString(referral?.campaignId) ??
      firstString(referral?.campaign_id) ??
      firstString(adsContext?.campaignId) ??
      firstString(adsContext?.campaign_id),
    adSetId:
      firstString(body.adSetId) ??
      firstString(body.adsetId) ??
      firstString(body.ad_set_id) ??
      firstString(body.adset_id) ??
      firstString(body.utm_adset) ??
      firstString(referral?.adSetId) ??
      firstString(referral?.adsetId) ??
      firstString(referral?.ad_set_id) ??
      firstString(referral?.adset_id) ??
      firstString(adsContext?.adSetId) ??
      firstString(adsContext?.adsetId) ??
      firstString(adsContext?.ad_set_id) ??
      firstString(adsContext?.adset_id),
    adId:
      firstString(body.adId) ??
      firstString(body.ad_id) ??
      firstString(body.sourceId) ??
      firstString(body.source_id) ??
      firstString(referral?.adId) ??
      firstString(referral?.ad_id) ??
      firstString(referral?.sourceId) ??
      firstString(referral?.source_id) ??
      firstString(adsContext?.adId) ??
      firstString(adsContext?.ad_id),
    ctwaClid:
      firstString(body.ctwa_clid) ??
      firstString(body.ctwaClid) ??
      firstString(referral?.ctwa_clid) ??
      firstString(referral?.ctwaClid),
    ctwaSourceUrl:
      firstString(body.ctwaSourceUrl) ??
      firstString(body.source_url) ??
      firstString(referral?.source_url) ??
      firstString(referral?.sourceUrl),
    providerInstanceId: getProviderInstanceId(body)
  };
}
```

In the same file, add local helpers copied from current `WebhooksController` behavior: `firstString`, `recordValue`, `getMessageText`, `getLabels`, `getPhone`, `getContactName`, `getProviderInstanceId`, `labelToString`, `normalizePhone`, and `hashPhone`. These helpers must keep the same extraction fields currently used in `WebhooksController` and add the CTWA/referral fields from the spec.

- [ ] **Step 4: Run parser tests to verify GREEN**

Run:

```bash
pnpm --filter @wpptrack/api test -- uazapi-webhook-parser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

```bash
git add apps/api/src/webhooks/uazapi-webhook-parser.ts apps/api/test/uazapi-webhook-parser.test.ts
git commit -m "feat: parse uazapi ctwa webhook context"
```

## Task 6: ConversionEventsService Statuses, Values and Auto LeadSubmitted

**Files:**
- Modify: `apps/api/src/conversion-events/conversion-events.service.ts`
- Modify: `apps/api/test/conversion-events-service.test.ts`

- [ ] **Step 1: Add failing service tests**

Add tests in `apps/api/test/conversion-events-service.test.ts`:

```ts
it("blocks Purchase rules without value as pending_value", async () => {
  const { db, service } = createHarness();

  const result = await service.recordRuleMatches({
    workspaceId: "workspace_1",
    leadId: "lead_1",
    phoneHash: "phone_hash_1",
    adId: "ad_1",
    ctwaClid: "clid_1",
    rules: [
      {
        id: "rule_1",
        workspaceId: "workspace_1",
        name: "Compra",
        triggerType: "whatsapp_label",
        triggerValue: "Venda fechada",
        matchMode: "exact",
        eventName: "Purchase",
        pixelId: null,
        active: true,
        createdAt: "2026-07-09T12:00:00.000Z",
        updatedAt: "2026-07-09T12:00:00.000Z",
        defaultValueCents: null,
        defaultCurrency: null,
        defaultContentName: null,
        defaultItems: null
      }
    ]
  });

  expect(result.created).toEqual(["conversion_1"]);
  expect(db.logs[0]).toMatchObject({
    eventName: "Purchase",
    status: "pending_value",
    errorCode: "EventValueMissing"
  });
});

it("records automatic LeadSubmitted once per lead and ad", async () => {
  const { db, service } = createHarness();

  const first = await service.recordAutomaticLeadSubmitted({
    workspaceId: "workspace_1",
    leadId: "lead_1",
    phoneHash: "phone_hash_1",
    campaignId: "cmp_1",
    adSetId: "adset_1",
    adId: "ad_1",
    ctwaClid: "clid_1"
  });
  const second = await service.recordAutomaticLeadSubmitted({
    workspaceId: "workspace_1",
    leadId: "lead_1",
    phoneHash: "phone_hash_1",
    campaignId: "cmp_1",
    adSetId: "adset_1",
    adId: "ad_1",
    ctwaClid: "clid_1"
  });

  expect(first.created).toEqual(["conversion_1"]);
  expect(second.duplicates).toEqual(["conversion_1"]);
  expect(db.logs[0]).toMatchObject({
    sourceTrigger: "auto_lead",
    eventName: "LeadSubmitted",
    status: "ready_to_send",
    ctwaClid: "clid_1"
  });
});
```

- [ ] **Step 2: Run service tests to verify RED**

Run:

```bash
pnpm --filter @wpptrack/api test -- conversion-events-service.test.ts
```

Expected: FAIL because `ctwaClid`, `recordAutomaticLeadSubmitted`, value handling and new error codes do not exist.

- [ ] **Step 3: Extend service input and log record types**

In `RecordRuleMatchesInput`, add:

```ts
ctwaClid?: string;
valueCents?: number;
currency?: string;
contentName?: string;
customData?: Record<string, unknown>;
```

In `ConversionEventLogRecord`, add:

```ts
eventId: string | null;
ctwaClid: string | null;
customData: Prisma.JsonValue | null;
valueCents: number | null;
currency: string | null;
contentName: string | null;
errorCode: string | null;
```

- [ ] **Step 4: Add value-aware status selection**

Import:

```ts
import { isConversionEventRequiringValue } from "./conversion-event-registry";
```

Add helper:

```ts
private resolveInitialStatus(input: {
  eventName: string;
  adId?: string;
  ctwaClid?: string;
  valueCents?: number | null;
}): { status: string; errorCode: string | null; errorMessage: string | null } {
  if (!input.adId || !input.ctwaClid) {
    return {
      status: "pending_meta_context",
      errorCode: !input.adId ? "MissingAdId" : "MissingCtwaClid",
      errorMessage: !input.adId
        ? "Evento sem id de anuncio Meta."
        : "Evento sem ctwa_clid para CAPI WhatsApp."
    };
  }

  if (
    isConversionEventRequiringValue(input.eventName as never) &&
    !input.valueCents
  ) {
    return {
      status: "pending_value",
      errorCode: "EventValueMissing",
      errorMessage: "Evento exige valor confiavel antes do envio para Meta."
    };
  }

  return { status: "ready_to_send", errorCode: null, errorMessage: null };
}
```

Use this helper when creating logs in `recordRuleMatches`.

- [ ] **Step 5: Store event fields on logs**

When creating a `ConversionEventLog`, set:

```ts
eventId: dedupeKey,
ctwaClid: input.ctwaClid ?? null,
customData: input.customData
  ? (input.customData as Prisma.InputJsonValue)
  : rule.defaultItems
    ? ({ contents: rule.defaultItems } as Prisma.InputJsonValue)
    : Prisma.JsonNull,
valueCents: input.valueCents ?? rule.defaultValueCents ?? null,
currency: input.currency ?? rule.defaultCurrency ?? null,
contentName: input.contentName ?? rule.defaultContentName ?? null,
errorCode: statusResult.errorCode,
errorMessage: statusResult.errorMessage
```

- [ ] **Step 6: Add automatic LeadSubmitted method**

Add public method:

```ts
async recordAutomaticLeadSubmitted(input: {
  workspaceId: string;
  leadId?: string | null;
  phoneHash?: string | null;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  ctwaClid?: string | null;
}): Promise<RecordRuleMatchesResult> {
  const statusResult = this.resolveInitialStatus({
    eventName: "LeadSubmitted",
    adId: input.adId ?? undefined,
    ctwaClid: input.ctwaClid ?? undefined
  });
  const subject = input.leadId ?? input.phoneHash ?? "unknown";
  const dedupeKey = [
    input.workspaceId,
    subject,
    "auto_lead",
    "LeadSubmitted",
    input.adId ?? "missing_ad"
  ].join(":");
  const existing = await this.prisma.conversionEventLog.findUnique({
    where: { dedupeKey }
  }) as ConversionEventLogRecord | null;

  if (existing) {
    return { created: [], duplicates: [existing.id] };
  }

  const log = await this.prisma.conversionEventLog.create({
    data: {
      workspaceId: input.workspaceId,
      leadId: input.leadId ?? null,
      phoneHash: input.phoneHash ?? null,
      sourceTrigger: "auto_lead",
      eventName: "LeadSubmitted",
      status: statusResult.status,
      eventId: dedupeKey,
      ctwaClid: input.ctwaClid ?? null,
      campaignId: input.campaignId ?? null,
      adSetId: input.adSetId ?? null,
      adId: input.adId ?? null,
      attributionStatus: input.adId ? "attributed" : "missing_ad_id",
      dedupeKey,
      errorCode: statusResult.errorCode,
      errorMessage: statusResult.errorMessage
    }
  });

  return { created: [log.id], duplicates: [] };
}
```

- [ ] **Step 7: Pass new fields to adapter and diagnostics**

In `sendReadyEvent`, pass:

```ts
ctwaClid: log.ctwaClid,
valueCents: log.valueCents,
currency: log.currency,
contentName: log.contentName,
customData: log.customData as Record<string, unknown> | null
```

Store `result.errorCode` on log updates. Change diagnostic error code from old generic values to `result.errorCode ?? "MetaCapiRejected"`.

- [ ] **Step 8: Run service tests to verify GREEN**

Run:

```bash
pnpm --filter @wpptrack/api test -- conversion-events-service.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit service changes**

```bash
git add apps/api/src/conversion-events/conversion-events.service.ts apps/api/test/conversion-events-service.test.ts
git commit -m "feat: record value-aware capi conversion logs"
```

## Task 7: Persist CTWA on Leads and Webhooks

**Files:**
- Modify: `apps/api/src/leads/leads.service.ts`
- Modify: `apps/api/src/webhooks/webhooks.controller.ts`
- Modify: `apps/api/test/webhooks-controller.test.ts`

- [ ] **Step 1: Add failing webhook controller test**

Add to `apps/api/test/webhooks-controller.test.ts`:

```ts
it("stores ctwa context and queues automatic LeadSubmitted for eligible Uazapi leads", async () => {
  const { app, leadsService, conversionEventsService, conversionEventsQueueService } =
    await createApp();
  conversionEventsService.recordAutomaticLeadSubmitted.mockResolvedValue({
    created: ["conversion_auto_1"],
    duplicates: []
  });

  await request(app.getHttpServer())
    .post("/webhooks/uazapi")
    .set("x-workspace-id", "workspace_1")
    .send({
      id: "uazapi_event_1",
      event: "message.received",
      message: {
        text: "ola",
        referral: {
          ctwa_clid: "clid_1",
          source_url: "https://fb.com/ad",
          ad_id: "ad_1",
          adset_id: "adset_1",
          campaign_id: "cmp_1"
        }
      },
      contact: { phone: "+55 11 99999-1234" }
    })
    .expect(202);

  expect(leadsService.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
    expect.objectContaining({
      ctwaClid: "clid_1",
      ctwaSourceUrl: "https://fb.com/ad"
    })
  );
  expect(conversionEventsService.recordAutomaticLeadSubmitted).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: "workspace_1",
      adId: "ad_1",
      ctwaClid: "clid_1"
    })
  );
  expect(conversionEventsQueueService.enqueueSend).toHaveBeenCalledWith(
    "conversion_auto_1"
  );
});
```

- [ ] **Step 2: Run webhook tests to verify RED**

Run:

```bash
pnpm --filter @wpptrack/api test -- webhooks-controller.test.ts
```

Expected: FAIL because parser is not wired, lead input lacks CTWA fields, and `recordAutomaticLeadSubmitted` is not called.

- [ ] **Step 3: Extend lead service types and persistence**

In `UpsertWhatsappLeadInput`, add:

```ts
ctwaClid?: string;
ctwaSourceUrl?: string;
```

In `LeadRecord`, add nullable fields:

```ts
ctwaClid: string | null;
ctwaSourceUrl: string | null;
```

In `create` and `update` data:

```ts
ctwaClid: input.ctwaClid ?? null,
ctwaSourceUrl: input.ctwaSourceUrl ?? null
```

For updates, use `undefined` when missing:

```ts
ctwaClid: input.ctwaClid ?? undefined,
ctwaSourceUrl: input.ctwaSourceUrl ?? undefined
```

- [ ] **Step 4: Replace local Uazapi extraction in controller**

In `apps/api/src/webhooks/webhooks.controller.ts`, import:

```ts
import { parseUazapiWebhook } from "./uazapi-webhook-parser";
```

In `recordUazapiWebhook`, replace calls to `getUazapiWebhookMetadata`, `getMessageText`, `getLabels`, `getPhone`, and `getContactName` with:

```ts
const parsed = parseUazapiWebhook(body);
```

Use `parsed` for diagnostics, trigger evaluation, lead upsert, rule matching and automatic `LeadSubmitted`.

- [ ] **Step 5: Queue auto and rule logs only when ready**

After `recordAutomaticLeadSubmitted` and `recordRuleMatches`, enqueue only created logs whose status is ready. Use a new service method:

```ts
async listReadyLogIds(logIds: string[]): Promise<string[]> {
  if (!logIds.length) {
    return [];
  }

  const logs = await this.prisma.conversionEventLog.findMany({
    where: { id: { in: logIds }, status: "ready_to_send" },
    select: { id: true }
  });

  return logs.map((log) => log.id);
}
```

Then in controller:

```ts
const readyLogIds = await this.conversionEventsService.listReadyLogIds([
  ...automatic.created,
  ...conversion.created
]);
const queued = await Promise.all(
  readyLogIds.map((logId) => this.conversionEventsQueueService.enqueueSend(logId))
);
```

- [ ] **Step 6: Remove parser helpers from controller**

Remove private helper methods that moved to `uazapi-webhook-parser.ts`:

- `getUazapiWebhookMetadata`
- `getUazapiAttribution`
- `getMessageText`
- `getLabels`
- `getPhone`
- `getContactName`
- `hashPhone`
- `normalizePhone`
- `getUazapiProviderInstanceId`
- `labelToString`

Keep shared helpers that still serve Meta/Asaas handling.

- [ ] **Step 7: Run webhook and parser tests**

Run:

```bash
pnpm --filter @wpptrack/api test -- webhooks-controller.test.ts uazapi-webhook-parser.test.ts conversion-events-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit webhook integration**

```bash
git add apps/api/src/leads/leads.service.ts apps/api/src/webhooks apps/api/test/webhooks-controller.test.ts
git commit -m "feat: create capi events from uazapi ctwa webhooks"
```

## Task 8: Backoffice Manual CAPI Test Endpoint

**Files:**
- Modify: `apps/api/src/conversion-events/conversion-events.service.ts`
- Modify: `apps/api/src/conversion-events/conversion-events.module.ts`
- Modify: `apps/api/src/diagnostics/diagnostics.controller.ts`
- Modify: `apps/api/src/diagnostics/diagnostics.module.ts`
- Modify: `apps/api/test/diagnostics-controller.test.ts`

- [ ] **Step 1: Write failing diagnostics controller test**

Add to `apps/api/test/diagnostics-controller.test.ts`:

```ts
it("allows platform admin to send a controlled Meta CAPI test event", async () => {
  const { app, conversionEventsService } = await createApp();
  conversionEventsService.sendManualTestEvent.mockResolvedValue({
    conversionEventLogId: "conversion_test_1",
    workspaceId: "workspace_1",
    status: "sent"
  });

  await request(app.getHttpServer())
    .post("/backoffice/diagnostics/conversions/test")
    .set("Cookie", "wpptrack_session=refresh-token")
    .send({
      workspaceId: "workspace_1",
      eventName: "QualifiedLead",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      testEventCode: "TEST12345"
    })
    .expect(201);

  expect(conversionEventsService.sendManualTestEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: "workspace_1",
      eventName: "QualifiedLead",
      testEventCode: "TEST12345"
    })
  );
});
```

- [ ] **Step 2: Run diagnostics controller tests to verify RED**

Run:

```bash
pnpm --filter @wpptrack/api test -- diagnostics-controller.test.ts
```

Expected: FAIL because route and service method do not exist.

- [ ] **Step 3: Add manual test service method**

In `ConversionEventsService`, add:

```ts
async sendManualTestEvent(input: {
  workspaceId: string;
  leadId?: string;
  eventName: string;
  phoneHash: string;
  adId: string;
  ctwaClid: string;
  valueCents?: number;
  currency?: string;
  contentName?: string;
  testEventCode: string;
}): Promise<SendReadyEventResult> {
  const dedupeKey = [
    input.workspaceId,
    input.leadId ?? input.phoneHash,
    "manual_test",
    input.eventName,
    input.adId,
    Date.now()
  ].join(":");
  const statusResult = this.resolveInitialStatus({
    eventName: input.eventName,
    adId: input.adId,
    ctwaClid: input.ctwaClid,
    valueCents: input.valueCents
  });
  const log = await this.prisma.conversionEventLog.create({
    data: {
      workspaceId: input.workspaceId,
      leadId: input.leadId ?? null,
      phoneHash: input.phoneHash,
      sourceTrigger: "manual_test",
      eventName: input.eventName,
      status: statusResult.status,
      eventId: dedupeKey,
      ctwaClid: input.ctwaClid,
      campaignId: null,
      adSetId: null,
      adId: input.adId,
      attributionStatus: "manual_test",
      dedupeKey,
      valueCents: input.valueCents ?? null,
      currency: input.currency ?? null,
      contentName: input.contentName ?? null,
      customData: Prisma.JsonNull,
      errorCode: statusResult.errorCode,
      errorMessage: statusResult.errorMessage
    }
  });

  if (statusResult.status !== "ready_to_send") {
    return {
      conversionEventLogId: log.id,
      workspaceId: input.workspaceId,
      status: "not_configured"
    };
  }

  return this.sendReadyEvent(log.id, { testEventCode: input.testEventCode });
}
```

Update `sendReadyEvent` signature to:

```ts
async sendReadyEvent(
  logId: string,
  options: { testEventCode?: string } = {}
): Promise<SendReadyEventResult>
```

Pass `options.testEventCode` to the adapter.

- [ ] **Step 4: Wire diagnostics controller route**

In `DiagnosticsController`, import:

```ts
import { diagnosticConversionEventTestInputSchema } from "@wpptrack/shared";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
```

Inject `ConversionEventsService`. Add:

```ts
@Post("conversions/test")
async sendConversionTest(
  @AuthToken() refreshToken: string,
  @Body() body: unknown
) {
  await this.platformAdminService.assertPlatformAdmin(refreshToken);

  const parsed = diagnosticConversionEventTestInputSchema.safeParse(body);

  if (!parsed.success) {
    throw new BadRequestException("Payload invalido");
  }

  return this.conversionEventsService.sendManualTestEvent(parsed.data);
}
```

In `DiagnosticsModule`, import `ConversionEventsModule` directly:

```ts
imports: [AuthModule, PrismaModule, QueueModule, ConversionEventsModule]
```

- [ ] **Step 5: Run diagnostics and service tests**

Run:

```bash
pnpm --filter @wpptrack/api test -- diagnostics-controller.test.ts conversion-events-service.test.ts meta-capi-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit manual test endpoint**

```bash
git add apps/api/src/conversion-events apps/api/src/diagnostics apps/api/test/diagnostics-controller.test.ts apps/api/test/conversion-events-service.test.ts
git commit -m "feat: add backoffice capi test endpoint"
```

## Task 9: Diagnostics Hygiene and Retry Compatibility

**Files:**
- Modify: `apps/api/src/diagnostics/diagnostics.service.ts`
- Modify: `apps/api/test/diagnostics-service.test.ts`

- [ ] **Step 1: Write failing diagnostics tests**

Add to `apps/api/test/diagnostics-service.test.ts`:

```ts
it("shows CAPI logs with ctwa and value metadata but no access token", async () => {
  const { service, db } = createHarness();
  db.conversionEventLogs.push({
    id: "conversion_1",
    workspaceId: "workspace_1",
    leadId: "lead_1",
    phoneHash: "phone_hash_1",
    sourceTrigger: "keyword",
    eventName: "Purchase",
    status: "pending_value",
    pixelId: "pixel_1",
    pageId: "page_1",
    campaignId: "cmp_1",
    adSetId: "adset_1",
    adId: "ad_1",
    ctwaClid: "clid_123456789",
    valueCents: 19900,
    currency: "BRL",
    contentName: "Plano mensal",
    errorCode: "EventValueMissing",
    errorMessage: "Evento exige valor confiavel antes do envio para Meta.",
    providerResponseSummary: { events_received: 0 },
    createdAt: new Date("2026-07-09T12:00:00.000Z")
  });

  const logs = await service.listConversionEventLogs({ workspaceId: "workspace_1" });

  expect(logs[0]).toMatchObject({
    id: "conversion_1",
    eventName: "Purchase",
    status: "pending_value",
    errorCode: "EventValueMissing"
  });
  expect(JSON.stringify(logs)).not.toContain("access_token");
});
```

- [ ] **Step 2: Run diagnostics tests to verify RED**

Run:

```bash
pnpm --filter @wpptrack/api test -- diagnostics-service.test.ts
```

Expected: FAIL because DTO mapping does not include the new fields.

- [ ] **Step 3: Extend diagnostics query selection and DTO mapping**

In `DiagnosticsService.listConversionEventLogs`, select and map:

```ts
eventId
ctwaClid
valueCents
currency
contentName
customData
```

Mask CTWA in summaries using:

```ts
private maskCtwaClid(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.length <= 8
    ? `${value.slice(0, 2)}***`
    : `${value.slice(0, 4)}...${value.slice(-4)}`;
}
```

Return masked `ctwaClid` in list DTOs and full value only in internal backend logic.

- [ ] **Step 4: Keep retry behavior limited to ready logs**

In `retryConversionEvent`, reject `pending_value` with:

```ts
throw new BadRequestException("Evento ainda precisa de valor antes do reenvio");
```

Reject `pending_meta_context` with:

```ts
throw new BadRequestException("Evento ainda precisa de contexto Meta antes do reenvio");
```

- [ ] **Step 5: Run diagnostics tests**

Run:

```bash
pnpm --filter @wpptrack/api test -- diagnostics-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit diagnostics**

```bash
git add apps/api/src/diagnostics/diagnostics.service.ts apps/api/test/diagnostics-service.test.ts
git commit -m "feat: expose capi diagnostics safely"
```

## Task 10: Documentation and Final Verification

**Files:**
- Modify: `Projeto.md`
- Modify: `.env.example` only if the implementation adds a new environment variable.

- [ ] **Step 1: Update Projeto.md**

Add this note under the current implementation status:

```md
- Modulo CAPI WhatsApp em implementacao: eventos `LeadSubmitted`, `QualifiedLead`, `Purchase` e registry expandido usam destino unico Pixel + Pagina, token OAuth Meta criptografado, parser Uazapi com `ctwa_clid`, fila BullMQ e diagnosticos de bloqueio/envio. Usuario final nao informa token CAPI manual.
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @wpptrack/shared test -- contracts.test.ts
pnpm --filter @wpptrack/api test -- conversion-event-registry.test.ts meta-capi-payload-builder.test.ts meta-capi-adapter.test.ts conversion-events-service.test.ts uazapi-webhook-parser.test.ts webhooks-controller.test.ts diagnostics-controller.test.ts diagnostics-service.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Validate Prisma**

Run:

```bash
pnpm --filter @wpptrack/api exec prisma validate --schema prisma/schema.prisma
```

Expected: Prisma schema validates.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: all packages typecheck.

- [ ] **Step 5: Run full tests**

Run:

```bash
pnpm test
```

Expected: all package tests pass.

- [ ] **Step 6: Run build**

Run:

```bash
pnpm build
```

Expected: shared, API and web builds pass.

- [ ] **Step 7: Commit docs**

```bash
git add Projeto.md .env.example
git commit -m "docs: record capi conversion event implementation"
```

Only add `.env.example` if it changed.

## Self-Review

Spec coverage:

- R100 CAPI principles adapted to WppTrack backend: Tasks 1, 3 and 4.
- No manual client CAPI token: File structure and Scope Check, plus Task 10 documentation.
- Encrypted Meta OAuth destination through existing service flow: Tasks 4, 6 and 8.
- Single Pixel/Page conversion destination with `page_id`: Tasks 3, 4, 6 and 8.
- `ctwa_clid` parsing and storage: Tasks 2, 5 and 7.
- Automatic `LeadSubmitted`: Tasks 6 and 7.
- Keyword and label events: Tasks 1, 6 and 7 preserve current rules and add value handling.
- Value-aware Purchase blocking: Tasks 1, 3 and 6.
- Meta payload `business_messaging`, `messaging_channel`, `ctwa_clid`, `page_id`, `test_event_code`: Tasks 3, 4 and 8.
- Diagnostics without token leakage: Tasks 6, 8 and 9.
- Manual controlled test with `test_event_code`: Task 8.
- Final docs and verification: Task 10.

Placeholder scan:

- The plan avoids unfinished markers and vague implementation instructions.
- Each task has failing tests, implementation steps, verification commands, and a commit.

Type consistency:

- `ConversionEventNameDto` comes from the shared event schema and is reused by API registry and adapter.
- `ctwaClid`, `valueCents`, `currency`, `contentName`, and `customData` use the same names across Prisma, service inputs, adapter inputs, tests and diagnostics.
- Error codes match the spec list exactly.
