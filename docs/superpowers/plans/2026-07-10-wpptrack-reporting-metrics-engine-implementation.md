# WppTrack Reporting Metrics Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a centralized reporting metrics engine so Overview, Reports, exports, and Meta event audit use the approved WppTrack formulas for conversations, organic health, funnel steps, revenue, first purchase, repurchase, and ROAS.

**Architecture:** Extend shared contracts first, add the minimum persistence fields needed for event date and purchase classification, then move metric math out of `MetaReportingService` into a pure engine. Wire the engine into campaign, ad set, ad, Overview, CSV, and audit endpoints before updating the web UI labels and totals.

**Tech Stack:** TypeScript, NestJS, Prisma, Zod, Next.js App Router, Vitest, pnpm, PostgreSQL.

---

## File Structure

- Modify `packages/shared/src/schemas/reporting.ts`: expand report DTO schemas with human-facing metric fields, revenue, dynamic funnel steps, and conversion audit DTOs.
- Modify `packages/shared/src/metrics.ts`: replace the legacy funnel key list with human labels and reusable metric types.
- Modify `packages/shared/tests/contracts.test.ts`: cover the new report contracts and preserve filter contract behavior.
- Modify `apps/api/prisma/schema.prisma`: add event occurrence and reporting-classification fields to `ConversionEventLog`.
- Create `apps/api/prisma/migrations/<timestamp>_reporting_metrics_engine/migration.sql`: add the database fields and backfill from existing records.
- Create `apps/api/src/reporting/reporting-metrics.engine.ts`: pure metric calculator with no Prisma dependency.
- Create `apps/api/test/reporting-metrics-engine.test.ts`: focused tests for formulas, visibility, organic separation, first purchase, repurchase, and failed Meta-send counting.
- Modify `apps/api/src/reporting/meta-reporting.service.ts`: replace local `toMetrics` and `countEvents` math with the centralized engine.
- Modify `apps/api/src/reporting/reporting.controller.ts`: add conversion audit endpoint and keep existing filters.
- Create `apps/api/test/reporting-controller.test.ts` or extend an existing reporting controller test if present when the task starts.
- Modify `apps/web/src/app/(app)/overview/page.tsx`: use new summary fields and human labels.
- Modify `apps/web/src/app/(app)/reports/page.tsx`: use new table fields, dynamic funnel labels, revenue columns, and total ROAS calculations.
- Modify `apps/web/src/app/(app)/reports/export/route.ts` only if the export route needs query propagation changes.
- Update `Projeto.md` after implementation to record what was completed and which tests passed.

## Task 1: Expand Shared Reporting Contracts

**Files:**
- Modify: `packages/shared/src/schemas/reporting.ts`
- Modify: `packages/shared/src/metrics.ts`
- Modify: `packages/shared/tests/contracts.test.ts`

- [ ] **Step 1: Write failing shared contract tests**

Add a new test block after the current campaign report schema tests in `packages/shared/tests/contracts.test.ts`:

```ts
it("validates reporting rows with human funnel, revenue and ROAS metrics", () => {
  const parsed = campaignReportRowSchema.parse({
    id: "cmp_1",
    name: "Campanha WhatsApp",
    status: "active",
    businessId: "business_1",
    businessName: "BM Principal",
    adAccountId: "act_123",
    adAccountName: "Conta WhatsApp",
    whatsappClassification: "auto_whatsapp",
    spendCents: 120000,
    metaConversationsStarted: 100,
    costPerMetaConversationCents: 1200,
    realConversations: 80,
    costPerRealConversationCents: 1500,
    organicLeads: 12,
    totalReceived: 92,
    trackingRate: 0.8696,
    qualifiedLead: 10,
    costPerQualifiedLeadCents: 12000,
    purchases: 3,
    firstPurchases: 2,
    repurchases: 1,
    costPerPurchaseCents: 40000,
    trafficRevenueCents: 900000,
    organicRevenueCents: 150000,
    totalRevenueCents: 1050000,
    firstPurchaseRevenueCents: 600000,
    repurchaseRevenueCents: 300000,
    roasAcquisition: 5,
    roasWithRepurchase: 7.5,
    funnelSteps: [
      {
        key: "real_conversations",
        label: "Conversas reais iniciadas",
        count: 80,
        costCents: 1500,
        rateFromPrevious: null,
        visible: true
      },
      {
        key: "qualified_lead",
        label: "Lead qualificado",
        count: 10,
        costCents: 12000,
        rateFromPrevious: 0.125,
        visible: true
      },
      {
        key: "purchases",
        label: "Compras",
        count: 3,
        costCents: 40000,
        rateFromPrevious: 0.3,
        visible: true
      }
    ]
  });

  expect(parsed.funnelSteps.map((step) => step.label)).toEqual([
    "Conversas reais iniciadas",
    "Lead qualificado",
    "Compras"
  ]);
  expect(parsed.purchases).toBe(3);
  expect(parsed.roasAcquisition).toBe(5);
});

it("validates Meta conversion event audit rows", () => {
  const parsed = metaConversionAuditRowSchema.parse({
    id: "event_1",
    eventName: "Purchase",
    eventLabel: "Compras",
    leadId: "lead_1",
    phoneHash: "hash_123",
    campaignId: "cmp_1",
    adSetId: "adset_1",
    adId: "ad_1",
    pixelId: "pixel_1",
    pageId: "page_1",
    occurredAt: "2026-07-10T10:00:00.000Z",
    sentAt: null,
    status: "error",
    providerResponseSummary: { error: "Meta refused event" },
    errorCode: "MetaCapiRejected",
    errorMessage: "Invalid parameter"
  });

  expect(parsed.eventLabel).toBe("Compras");
  expect(parsed.status).toBe("error");
});
```

- [ ] **Step 2: Run the shared tests and verify failure**

Run:

```powershell
pnpm --filter @wpptrack/shared test -- contracts.test.ts
```

Expected: FAIL because `metaConversionAuditRowSchema`, `purchases`, revenue fields, and `funnelSteps` do not exist yet.

- [ ] **Step 3: Update `packages/shared/src/metrics.ts`**

Replace the existing file with:

```ts
export const reportFunnelStepKeys = [
  "real_conversations",
  "qualified_lead",
  "purchases"
] as const;

export type ReportFunnelStepKey = (typeof reportFunnelStepKeys)[number];

export type MoneyCents = number;

export const reportFunnelLabels: Record<ReportFunnelStepKey, string> = {
  real_conversations: "Conversas reais iniciadas",
  qualified_lead: "Lead qualificado",
  purchases: "Compras"
};

export interface ReportFunnelStep {
  key: ReportFunnelStepKey;
  label: string;
  count: number;
  costCents: MoneyCents | null;
  rateFromPrevious: number | null;
  visible: boolean;
}

export interface ReportMetric {
  key: string;
  label: string;
  value: number;
  costCents?: MoneyCents | null;
  unavailableReason?: string;
}
```

- [ ] **Step 4: Update `packages/shared/src/schemas/reporting.ts`**

Add these schemas after `moneyCentsSchema`:

```ts
const ratioSchema = z.number().nonnegative().nullable();
const reportFunnelStepKeySchema = z.enum([
  "real_conversations",
  "qualified_lead",
  "purchases",
]);

export const reportFunnelStepSchema = z.object({
  key: reportFunnelStepKeySchema,
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
  costCents: moneyCentsSchema.nullable(),
  rateFromPrevious: ratioSchema,
  visible: z.boolean(),
});

export const metaConversionAuditRowSchema = z.object({
  id: z.string().min(1),
  eventName: z.string().min(1),
  eventLabel: z.string().min(1),
  leadId: z.string().min(1).nullable(),
  phoneHash: z.string().min(1).nullable(),
  campaignId: z.string().min(1).nullable(),
  adSetId: z.string().min(1).nullable(),
  adId: z.string().min(1).nullable(),
  pixelId: z.string().min(1).nullable(),
  pageId: z.string().min(1).nullable(),
  occurredAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
  status: z.string().min(1),
  providerResponseSummary: z.unknown().nullable(),
  errorCode: z.string().min(1).nullable(),
  errorMessage: z.string().min(1).nullable(),
});

export const metaConversionAuditSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  events: z.array(metaConversionAuditRowSchema),
});
```

Update `campaignReportRowSchema` by removing `leadSubmitted`, `costPerLeadSubmittedCents`, `purchase`, and `roas`, then adding these fields:

```ts
  organicLeads: z.number().int().nonnegative(),
  totalReceived: z.number().int().nonnegative(),
  trackingRate: ratioSchema,
  qualifiedLead: z.number().int().nonnegative(),
  costPerQualifiedLeadCents: moneyCentsSchema.nullable(),
  purchases: z.number().int().nonnegative(),
  firstPurchases: z.number().int().nonnegative(),
  repurchases: z.number().int().nonnegative(),
  costPerPurchaseCents: moneyCentsSchema.nullable(),
  trafficRevenueCents: moneyCentsSchema,
  organicRevenueCents: moneyCentsSchema,
  totalRevenueCents: moneyCentsSchema,
  firstPurchaseRevenueCents: moneyCentsSchema,
  repurchaseRevenueCents: moneyCentsSchema,
  roasAcquisition: ratioSchema,
  roasWithRepurchase: ratioSchema,
  funnelSteps: z.array(reportFunnelStepSchema),
```

At the bottom, export these types:

```ts
export type ReportFunnelStepDto = z.infer<typeof reportFunnelStepSchema>;
export type MetaConversionAuditRowDto = z.infer<
  typeof metaConversionAuditRowSchema
>;
export type MetaConversionAuditDto = z.infer<typeof metaConversionAuditSchema>;
```

- [ ] **Step 5: Update old shared tests to the new field names**

In `packages/shared/tests/contracts.test.ts`, replace old row fixture fields:

```ts
leadSubmitted: 30,
costPerLeadSubmittedCents: 4000,
purchase: 3,
roas: 4.2
```

with:

```ts
organicLeads: 0,
totalReceived: 80,
trackingRate: 1,
qualifiedLead: 12,
costPerQualifiedLeadCents: 10000,
purchases: 3,
firstPurchases: 3,
repurchases: 0,
costPerPurchaseCents: 40000,
trafficRevenueCents: 504000,
organicRevenueCents: 0,
totalRevenueCents: 504000,
firstPurchaseRevenueCents: 504000,
repurchaseRevenueCents: 0,
roasAcquisition: 4.2,
roasWithRepurchase: 4.2,
funnelSteps: [
  {
    key: "real_conversations",
    label: "Conversas reais iniciadas",
    count: 80,
    costCents: 1500,
    rateFromPrevious: null,
    visible: true
  },
  {
    key: "qualified_lead",
    label: "Lead qualificado",
    count: 12,
    costCents: 10000,
    rateFromPrevious: 0.15,
    visible: true
  },
  {
    key: "purchases",
    label: "Compras",
    count: 3,
    costCents: 40000,
    rateFromPrevious: 0.25,
    visible: true
  }
]
```

Replace expectations for `parsed.purchase` with `parsed.purchases`.

- [ ] **Step 6: Run shared tests**

Run:

```powershell
pnpm --filter @wpptrack/shared test -- contracts.test.ts
pnpm --filter @wpptrack/shared typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit shared contracts**

Run:

```powershell
git add packages/shared/src/schemas/reporting.ts packages/shared/src/metrics.ts packages/shared/tests/contracts.test.ts
git commit -m "feat: expand reporting metric contracts"
```

Expected: commit succeeds.

## Task 2: Add Event Occurrence and Purchase Classification Persistence

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_reporting_metrics_engine/migration.sql`

- [ ] **Step 1: Update Prisma schema**

In `model ConversionEventLog`, add these fields after `eventName`:

```prisma
  eventOccurredAt         DateTime  @default(now())
  customerIdentityKey     String?
  businessSource          String?
  purchaseKind            String?
```

Add these indexes at the end of `model ConversionEventLog`:

```prisma
  @@index([workspaceId, eventName, eventOccurredAt])
  @@index([workspaceId, customerIdentityKey])
  @@index([workspaceId, purchaseKind])
```

- [ ] **Step 2: Create migration**

Run:

```powershell
pnpm --filter @wpptrack/api prisma migrate dev --name reporting_metrics_engine --create-only
```

Expected: Prisma creates a new folder under `apps/api/prisma/migrations`.

- [ ] **Step 3: Replace migration SQL with explicit backfill**

Open the generated `migration.sql` and make sure it contains:

```sql
ALTER TABLE "ConversionEventLog" ADD COLUMN "eventOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ConversionEventLog" ADD COLUMN "customerIdentityKey" TEXT;
ALTER TABLE "ConversionEventLog" ADD COLUMN "businessSource" TEXT;
ALTER TABLE "ConversionEventLog" ADD COLUMN "purchaseKind" TEXT;

UPDATE "ConversionEventLog"
SET "eventOccurredAt" = "createdAt"
WHERE "eventOccurredAt" IS NULL;

UPDATE "ConversionEventLog"
SET "customerIdentityKey" = "phoneHash"
WHERE "customerIdentityKey" IS NULL AND "phoneHash" IS NOT NULL;

UPDATE "ConversionEventLog"
SET "businessSource" = CASE
  WHEN "campaignId" IS NULL AND "adSetId" IS NULL AND "adId" IS NULL THEN 'organic'
  ELSE 'paid'
END
WHERE "businessSource" IS NULL;

CREATE INDEX "ConversionEventLog_workspaceId_eventName_eventOccurredAt_idx" ON "ConversionEventLog"("workspaceId", "eventName", "eventOccurredAt");
CREATE INDEX "ConversionEventLog_workspaceId_customerIdentityKey_idx" ON "ConversionEventLog"("workspaceId", "customerIdentityKey");
CREATE INDEX "ConversionEventLog_workspaceId_purchaseKind_idx" ON "ConversionEventLog"("workspaceId", "purchaseKind");
```

- [ ] **Step 4: Validate Prisma**

Run:

```powershell
pnpm --filter @wpptrack/api prisma:generate
pnpm --filter @wpptrack/api typecheck
```

Expected: Prisma generate and TypeScript typecheck PASS.

- [ ] **Step 5: Commit persistence change**

Run:

```powershell
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: persist reporting event metadata"
```

Expected: commit succeeds.

## Task 3: Build the Pure Reporting Metrics Engine

**Files:**
- Create: `apps/api/src/reporting/reporting-metrics.engine.ts`
- Create: `apps/api/test/reporting-metrics-engine.test.ts`

- [ ] **Step 1: Write failing engine tests**

Create `apps/api/test/reporting-metrics-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ReportingMetricsEngine,
  type ReportingMetricEvent,
  type ReportingMetricInsight,
  type ReportingMetricLead,
} from "../src/reporting/reporting-metrics.engine";

const engine = new ReportingMetricsEngine();

function lead(input: Partial<ReportingMetricLead>): ReportingMetricLead {
  return {
    adId: null,
    adSetId: null,
    campaignId: null,
    customerIdentityKey: "phone_a",
    firstMessageAt: new Date("2026-07-10T10:00:00.000Z"),
    id: "lead_1",
    phoneHash: "phone_a",
    ...input,
  };
}

function event(input: Partial<ReportingMetricEvent>): ReportingMetricEvent {
  return {
    adId: null,
    adSetId: null,
    businessSource: null,
    campaignId: null,
    currency: "BRL",
    customerIdentityKey: "phone_a",
    eventName: "Purchase",
    eventOccurredAt: new Date("2026-07-10T11:00:00.000Z"),
    id: "event_1",
    phoneHash: "phone_a",
    purchaseKind: null,
    status: "sent",
    valueCents: 10000,
    ...input,
  };
}

const insight: ReportingMetricInsight = {
  metaConversationsStarted: 10,
  spendCents: 100000,
};

describe("ReportingMetricsEngine", () => {
  it("uses LeadSubmitted as real conversations without duplicating funnel labels", () => {
    const metrics = engine.calculate({
      events: [event({ eventName: "LeadSubmitted", valueCents: null })],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.realConversations).toBe(1);
    expect(metrics.funnelSteps.map((step) => step.label)).toEqual([
      "Conversas reais iniciadas",
    ]);
  });

  it("keeps configured zero events visible and never-configured events hidden", () => {
    const metrics = engine.calculate({
      configuredEvents: new Set(["QualifiedLead", "Purchase"]),
      events: [],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.qualifiedLead).toBe(0);
    expect(metrics.purchases).toBe(0);
    expect(metrics.funnelSteps.map((step) => step.key)).toEqual([
      "real_conversations",
      "qualified_lead",
      "purchases",
    ]);
  });

  it("counts failed Meta-send events as business conversions", () => {
    const metrics = engine.calculate({
      events: [
        event({
          campaignId: "cmp_1",
          eventName: "Purchase",
          status: "error",
          valueCents: 50000,
        }),
      ],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.purchases).toBe(1);
    expect(metrics.trafficRevenueCents).toBe(50000);
  });

  it("separates organic revenue from paid ROAS", () => {
    const metrics = engine.calculate({
      events: [
        event({
          businessSource: "organic",
          campaignId: null,
          eventName: "Purchase",
          valueCents: 25000,
        }),
        event({
          businessSource: "paid",
          campaignId: "cmp_1",
          eventName: "Purchase",
          valueCents: 100000,
        }),
      ],
      insight,
      leads: [
        lead({ campaignId: "cmp_1", id: "lead_paid" }),
        lead({ campaignId: null, id: "lead_org", phoneHash: "phone_b" }),
      ],
      scope: {},
    });

    expect(metrics.trafficRevenueCents).toBe(100000);
    expect(metrics.organicRevenueCents).toBe(25000);
    expect(metrics.totalRevenueCents).toBe(125000);
    expect(metrics.roasAcquisition).toBe(1);
  });

  it("classifies first purchase and repurchase by phone identity", () => {
    const metrics = engine.calculate({
      events: [
        event({
          campaignId: "cmp_1",
          eventName: "Purchase",
          eventOccurredAt: new Date("2026-07-10T11:00:00.000Z"),
          id: "purchase_1",
          valueCents: 100000,
        }),
        event({
          campaignId: "cmp_1",
          eventName: "Purchase",
          eventOccurredAt: new Date("2026-07-11T11:00:00.000Z"),
          id: "purchase_2",
          valueCents: 50000,
        }),
      ],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.firstPurchases).toBe(1);
    expect(metrics.repurchases).toBe(1);
    expect(metrics.firstPurchaseRevenueCents).toBe(100000);
    expect(metrics.repurchaseRevenueCents).toBe(50000);
    expect(metrics.roasAcquisition).toBe(1);
    expect(metrics.roasWithRepurchase).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run the engine test and verify failure**

Run:

```powershell
pnpm --filter @wpptrack/api test -- reporting-metrics-engine.test.ts
```

Expected: FAIL because `reporting-metrics.engine.ts` does not exist.

- [ ] **Step 3: Create `apps/api/src/reporting/reporting-metrics.engine.ts`**

Create the file with:

```ts
import type { CampaignReportRowDto, ReportFunnelStepDto } from "@wpptrack/shared";

export type ReportingMetricScope = {
  adId?: string | null;
  adSetId?: string | null;
  campaignId?: string | null;
};

export type ReportingMetricInsight = {
  spendCents: number;
  metaConversationsStarted: number | null;
};

export type ReportingMetricLead = {
  id: string;
  phoneHash: string | null;
  customerIdentityKey?: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  firstMessageAt: Date | null;
};

export type ReportingMetricEvent = {
  id: string;
  phoneHash: string | null;
  customerIdentityKey?: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  eventName: string;
  eventOccurredAt: Date;
  status: string;
  valueCents: number | null;
  currency: string | null;
  businessSource?: string | null;
  purchaseKind?: string | null;
};

export type ReportingMetricsInput = {
  configuredEvents?: Set<string>;
  events: ReportingMetricEvent[];
  insight: ReportingMetricInsight;
  leads: ReportingMetricLead[];
  scope: ReportingMetricScope;
};

export type ReportingMetricsResult = Omit<
  CampaignReportRowDto,
  | "id"
  | "name"
  | "status"
  | "businessId"
  | "businessName"
  | "adAccountId"
  | "adAccountName"
  | "whatsappClassification"
>;

const COUNTED_EVENT_STATUSES_TO_SKIP = new Set(["skipped"]);

export class ReportingMetricsEngine {
  calculate(input: ReportingMetricsInput): ReportingMetricsResult {
    const scopedLeads = input.leads.filter((lead) =>
      this.belongsToScope(lead, input.scope),
    );
    const scopedEvents = input.events.filter((event) =>
      this.belongsToScope(event, input.scope),
    );
    const countableEvents = scopedEvents.filter(
      (event) => !COUNTED_EVENT_STATUSES_TO_SKIP.has(event.status),
    );
    const realConversations = scopedLeads.filter((lead) =>
      this.isPaid(lead),
    ).length;
    const organicLeads = scopedLeads.filter((lead) => !this.isPaid(lead)).length;
    const qualifiedLead = this.countEvents(countableEvents, "QualifiedLead");
    const purchaseEvents = this.purchaseEvents(countableEvents);
    const purchaseClassification = this.classifyPurchases(purchaseEvents);
    const purchases = purchaseEvents.length;
    const trafficRevenueCents = purchaseClassification
      .filter((item) => item.businessSource === "paid")
      .reduce((total, item) => total + item.valueCents, 0);
    const organicRevenueCents = purchaseClassification
      .filter((item) => item.businessSource === "organic")
      .reduce((total, item) => total + item.valueCents, 0);
    const firstPurchaseRevenueCents = purchaseClassification
      .filter((item) => item.kind === "first_purchase")
      .reduce((total, item) => total + item.valueCents, 0);
    const repurchaseRevenueCents = purchaseClassification
      .filter((item) => item.kind === "repurchase")
      .reduce((total, item) => total + item.valueCents, 0);
    const firstPurchases = purchaseClassification.filter(
      (item) => item.kind === "first_purchase",
    ).length;
    const repurchases = purchaseClassification.filter(
      (item) => item.kind === "repurchase",
    ).length;
    const totalReceived = realConversations + organicLeads;
    const configuredEvents = input.configuredEvents ?? this.configuredFromEvents(countableEvents);
    const funnelSteps = this.funnelSteps({
      configuredEvents,
      purchases,
      qualifiedLead,
      realConversations,
      spendCents: input.insight.spendCents,
    });

    return {
      costPerMetaConversationCents: this.costPer(
        input.insight.spendCents,
        input.insight.metaConversationsStarted ?? 0,
      ),
      costPerPurchaseCents: this.costPer(input.insight.spendCents, purchases),
      costPerQualifiedLeadCents: this.costPer(
        input.insight.spendCents,
        qualifiedLead,
      ),
      costPerRealConversationCents: this.costPer(
        input.insight.spendCents,
        realConversations,
      ),
      firstPurchaseRevenueCents,
      firstPurchases,
      funnelSteps,
      metaConversationsStarted: input.insight.metaConversationsStarted ?? 0,
      organicLeads,
      organicRevenueCents,
      purchases,
      qualifiedLead,
      realConversations,
      repurchaseRevenueCents,
      repurchases,
      roasAcquisition: this.roas(firstPurchaseRevenueCents, input.insight.spendCents),
      roasWithRepurchase: this.roas(
        firstPurchaseRevenueCents + repurchaseRevenueCents,
        input.insight.spendCents,
      ),
      spendCents: input.insight.spendCents,
      totalReceived,
      totalRevenueCents: trafficRevenueCents + organicRevenueCents,
      trackingRate: this.rate(realConversations, totalReceived),
      trafficRevenueCents,
    };
  }

  private belongsToScope(
    item: Pick<ReportingMetricEvent, "adId" | "adSetId" | "campaignId">,
    scope: ReportingMetricScope,
  ): boolean {
    if (scope.adId) {
      return item.adId === scope.adId;
    }

    if (scope.adSetId) {
      return item.adSetId === scope.adSetId;
    }

    if (scope.campaignId) {
      return item.campaignId === scope.campaignId;
    }

    return true;
  }

  private classifyPurchases(events: ReportingMetricEvent[]) {
    const sorted = [...events].sort(
      (left, right) =>
        left.eventOccurredAt.getTime() - right.eventOccurredAt.getTime(),
    );
    const seen = new Set<string>();

    return sorted.map((event) => {
      const identity =
        event.customerIdentityKey ?? event.phoneHash ?? `event:${event.id}`;
      const explicitKind =
        event.purchaseKind === "first_purchase" ||
        event.purchaseKind === "repurchase"
          ? event.purchaseKind
          : null;
      const kind =
        explicitKind ?? (seen.has(identity) ? "repurchase" : "first_purchase");
      seen.add(identity);

      return {
        businessSource: this.eventBusinessSource(event),
        kind,
        valueCents: event.valueCents ?? 0,
      };
    });
  }

  private configuredFromEvents(events: ReportingMetricEvent[]): Set<string> {
    return new Set(events.map((event) => event.eventName));
  }

  private countEvents(events: ReportingMetricEvent[], eventName: string): number {
    return events.filter((event) => event.eventName === eventName).length;
  }

  private costPer(spendCents: number, count: number): number | null {
    return count > 0 ? Math.floor(spendCents / count) : null;
  }

  private eventBusinessSource(event: ReportingMetricEvent): "paid" | "organic" {
    if (event.businessSource === "organic") {
      return "organic";
    }

    return this.isPaid(event) ? "paid" : "organic";
  }

  private funnelSteps(input: {
    configuredEvents: Set<string>;
    purchases: number;
    qualifiedLead: number;
    realConversations: number;
    spendCents: number;
  }): ReportFunnelStepDto[] {
    const steps: ReportFunnelStepDto[] = [
      {
        key: "real_conversations",
        label: "Conversas reais iniciadas",
        count: input.realConversations,
        costCents: this.costPer(input.spendCents, input.realConversations),
        rateFromPrevious: null,
        visible: true,
      },
    ];

    if (input.configuredEvents.has("QualifiedLead")) {
      steps.push({
        key: "qualified_lead",
        label: "Lead qualificado",
        count: input.qualifiedLead,
        costCents: this.costPer(input.spendCents, input.qualifiedLead),
        rateFromPrevious: this.rate(
          input.qualifiedLead,
          steps[steps.length - 1]?.count ?? 0,
        ),
        visible: true,
      });
    }

    if (input.configuredEvents.has("Purchase")) {
      steps.push({
        key: "purchases",
        label: "Compras",
        count: input.purchases,
        costCents: this.costPer(input.spendCents, input.purchases),
        rateFromPrevious: this.rate(
          input.purchases,
          steps[steps.length - 1]?.count ?? 0,
        ),
        visible: true,
      });
    }

    return steps;
  }

  private isPaid(
    item: Pick<ReportingMetricEvent, "adId" | "adSetId" | "campaignId">,
  ): boolean {
    return Boolean(item.campaignId || item.adSetId || item.adId);
  }

  private purchaseEvents(events: ReportingMetricEvent[]): ReportingMetricEvent[] {
    return events.filter((event) => event.eventName === "Purchase");
  }

  private rate(part: number, total: number): number | null {
    return total > 0 ? Number((part / total).toFixed(4)) : null;
  }

  private roas(revenueCents: number, spendCents: number): number | null {
    if (revenueCents <= 0 || spendCents <= 0) {
      return null;
    }

    return Number((revenueCents / spendCents).toFixed(2));
  }
}
```

- [ ] **Step 4: Run engine tests**

Run:

```powershell
pnpm --filter @wpptrack/api test -- reporting-metrics-engine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit engine**

Run:

```powershell
git add apps/api/src/reporting/reporting-metrics.engine.ts apps/api/test/reporting-metrics-engine.test.ts
git commit -m "feat: add reporting metrics engine"
```

Expected: commit succeeds.

## Task 4: Wire the Engine into MetaReportingService

**Files:**
- Modify: `apps/api/src/reporting/reporting.module.ts`
- Modify: `apps/api/src/reporting/meta-reporting.service.ts`
- Modify or create: `apps/api/test/meta-reporting-service.test.ts`

- [ ] **Step 1: Add service-level tests for current report rows**

If `apps/api/test/meta-reporting-service.test.ts` does not exist, create it with Prisma mocked the same way nearby service tests mock Prisma. Cover these assertions:

```ts
expect(row.leadSubmitted).toBeUndefined();
expect(row.purchases).toBe(1);
expect(row.funnelSteps[0]?.label).toBe("Conversas reais iniciadas");
expect(row.roasAcquisition).toBe(2);
expect(row.roasWithRepurchase).toBe(3);
```

Use fixture events:

```ts
[
  {
    adId: "ad_1",
    adSetId: "adset_1",
    businessSource: "paid",
    campaignId: "cmp_1",
    currency: "BRL",
    customerIdentityKey: "phone_a",
    eventName: "Purchase",
    eventOccurredAt: new Date("2026-07-10T12:00:00.000Z"),
    id: "event_1",
    phoneHash: "phone_a",
    purchaseKind: "first_purchase",
    status: "error",
    valueCents: 200000,
  }
]
```

Run:

```powershell
pnpm --filter @wpptrack/api test -- meta-reporting-service.test.ts
```

Expected: FAIL until the service uses the engine and new DTO fields.

- [ ] **Step 2: Register the engine provider**

In `apps/api/src/reporting/reporting.module.ts`, import and add the provider:

```ts
import { ReportingMetricsEngine } from "./reporting-metrics.engine";
```

Add `ReportingMetricsEngine` to `providers`.

- [ ] **Step 3: Inject the engine**

In `apps/api/src/reporting/meta-reporting.service.ts`, import:

```ts
import { ReportingMetricsEngine } from "./reporting-metrics.engine";
```

Update the constructor:

```ts
    private readonly whatsappClassifier: WhatsappCampaignClassifierService,
    private readonly metricsEngine: ReportingMetricsEngine,
```

- [ ] **Step 4: Expand record types**

Update `ConversionEventRecord`:

```ts
type ConversionEventRecord = {
  id: string;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  eventName: string;
  eventOccurredAt: Date;
  status: string;
  phoneHash: string | null;
  customerIdentityKey: string | null;
  businessSource: string | null;
  purchaseKind: string | null;
  valueCents: number | null;
  currency: string | null;
};
```

Update `LeadRecord`:

```ts
type LeadRecord = {
  id: string;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  phoneHash: string | null;
  firstMessageAt: Date | null;
};
```

- [ ] **Step 5: Load configured funnel events from active conversion rules**

Add a helper in `MetaReportingService`:

```ts
  private async getConfiguredFunnelEvents(workspaceId: string): Promise<Set<string>> {
    const rules = await this.prisma.conversionRule.findMany({
      where: {
        workspaceId,
        active: true,
        eventName: { in: ["QualifiedLead", "Purchase"] },
      },
      select: { eventName: true },
    });

    return new Set(rules.map((rule) => rule.eventName));
  }
```

In `getCampaignReportOverview`, `getAdSetReportOverview`, and `getAdReportOverview`, load this once per request:

```ts
const configuredEvents = await this.getConfiguredFunnelEvents(input.workspaceId);
```

Pass `configuredEvents` into `toReportRow`, `toAdSetReportRow`, and `toAdReportRow`, then into `toMetrics`. This is required so a configured event such as `QualifiedLead` or `Purchase` appears in `funnelSteps` with zero counts even when no matching event exists in the selected period.

- [ ] **Step 6: Replace `toMetrics` implementation**

Replace the body of `toMetrics` with:

```ts
    return this.metricsEngine.calculate({
      configuredEvents: new Set(
        [
          ...input.configuredEvents,
          ...input.events
            .filter((event) => ["QualifiedLead", "Purchase"].includes(event.eventName))
            .map((event) => event.eventName),
        ],
      ),
      events: input.events,
      insight: {
        metaConversationsStarted: input.metaConversationsStarted,
        spendCents: input.spendCents,
      },
      leads: input.leads,
      scope: {},
    });
```

Then update `toReportRow`, `toAdSetReportRow`, and `toAdReportRow` so they pass already scoped `events` and `leads` into `toMetrics`. Keep the existing scope filtering in each row function, and remove duplicate counting logic from `toMetrics`.

Add this field to the `toMetrics` input type:

```ts
configuredEvents: Set<string>;
```

Add a service-level test where `getConfiguredFunnelEvents` returns `new Set(["QualifiedLead"])`, there are no `QualifiedLead` events in the period, and the returned row still includes the `Lead qualificado` funnel step with count zero.

- [ ] **Step 7: Count real events regardless of Meta send failure**

Rename `getSentConversionEvents` to `getConversionEventsForMetrics`.

Change its Prisma query from:

```ts
status: "sent",
...this.periodWhere(input),
```

to:

```ts
status: { not: "skipped" },
...this.eventPeriodWhere(input),
```

Select:

```ts
{
  id: true,
  campaignId: true,
  adSetId: true,
  adId: true,
  eventName: true,
  eventOccurredAt: true,
  status: true,
  phoneHash: true,
  customerIdentityKey: true,
  businessSource: true,
  purchaseKind: true,
  valueCents: true,
  currency: true,
}
```

Add:

```ts
  private eventPeriodWhere(input: { since?: string; until?: string }) {
    return input.since && input.until
      ? {
          eventOccurredAt: {
            gte: new Date(`${input.since}T00:00:00.000Z`),
            lte: new Date(`${input.until}T23:59:59.999Z`),
          },
        }
      : {};
  }
```

- [ ] **Step 8: Use lead first-message dates for lead period filters**

Replace the `where` in `getLeads` with:

```ts
where: {
  workspaceId: input.workspaceId,
  ...(input.since && input.until
    ? {
        OR: [
          {
            firstMessageAt: {
              gte: new Date(`${input.since}T00:00:00.000Z`),
              lte: new Date(`${input.until}T23:59:59.999Z`),
            },
          },
          {
            firstMessageAt: null,
            createdAt: {
              gte: new Date(`${input.since}T00:00:00.000Z`),
              lte: new Date(`${input.until}T23:59:59.999Z`),
            },
          },
        ],
      }
    : {}),
},
select: {
  id: true,
  campaignId: true,
  adSetId: true,
  adId: true,
  phoneHash: true,
  firstMessageAt: true,
},
```

- [ ] **Step 9: Run API tests**

Run:

```powershell
pnpm --filter @wpptrack/api test -- reporting-metrics-engine.test.ts meta-reporting-service.test.ts
pnpm --filter @wpptrack/api typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit service wiring**

Run:

```powershell
git add apps/api/src/reporting apps/api/test/meta-reporting-service.test.ts
git commit -m "feat: use metrics engine in reports"
```

Expected: commit succeeds.

## Task 5: Add Conversion Event Audit API

**Files:**
- Modify: `apps/api/src/reporting/reporting.controller.ts`
- Modify: `apps/api/src/reporting/meta-reporting.service.ts`
- Create or modify: `apps/api/test/reporting-controller.test.ts`

- [ ] **Step 1: Write failing controller test**

Create a test that stubs `metaReportingService.getConversionEventAudit` and calls:

```ts
await request(app.getHttpServer())
  .get("/reports/conversions/audit?since=2026-07-01&until=2026-07-10")
  .set("Cookie", [`wpptrack_session=${refreshToken}`])
  .expect(200);
```

Assert the service receives:

```ts
expect(metaReportingService.getConversionEventAudit).toHaveBeenCalledWith({
  workspaceId: "workspace_1",
  since: "2026-07-01",
  until: "2026-07-10",
  rangeLabel: "2026-07-01 a 2026-07-10",
});
```

- [ ] **Step 2: Add service method**

In `MetaReportingService`, add:

```ts
  async getConversionEventAudit(input: {
    workspaceId: string;
    since?: string;
    until?: string;
    rangeLabel: string;
  }): Promise<MetaConversionAuditDto> {
    const events = await this.prisma.conversionEventLog.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...this.eventPeriodWhere(input),
      },
      orderBy: { eventOccurredAt: "desc" },
      take: 200,
      select: {
        id: true,
        eventName: true,
        leadId: true,
        phoneHash: true,
        campaignId: true,
        adSetId: true,
        adId: true,
        pixelId: true,
        pageId: true,
        eventOccurredAt: true,
        sentAt: true,
        status: true,
        providerResponseSummary: true,
        errorCode: true,
        errorMessage: true,
      },
    });

    return {
      workspaceId: input.workspaceId,
      rangeLabel: input.rangeLabel,
      events: events.map((event) => ({
        id: event.id,
        eventName: event.eventName,
        eventLabel: this.eventLabel(event.eventName),
        leadId: event.leadId,
        phoneHash: event.phoneHash,
        campaignId: event.campaignId,
        adSetId: event.adSetId,
        adId: event.adId,
        pixelId: event.pixelId,
        pageId: event.pageId,
        occurredAt: event.eventOccurredAt.toISOString(),
        sentAt: event.sentAt ? event.sentAt.toISOString() : null,
        status: event.status,
        providerResponseSummary: event.providerResponseSummary,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
      })),
    };
  }

  private eventLabel(eventName: string): string {
    if (eventName === "LeadSubmitted") {
      return "Conversas reais iniciadas";
    }

    if (eventName === "QualifiedLead") {
      return "Lead qualificado";
    }

    if (eventName === "Purchase") {
      return "Compras";
    }

    return eventName;
  }
```

Import `MetaConversionAuditDto` from `@wpptrack/shared`.

- [ ] **Step 3: Add controller endpoint**

In `ReportingController`, add:

```ts
  @Get("conversions/audit")
  async getConversionEventAudit(
    @AuthToken() refreshToken: string,
    @Query("since") since?: string,
    @Query("until") until?: string,
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);
    const period = this.parseReportPeriod(since, until);

    return this.metaReportingService.getConversionEventAudit({
      workspaceId,
      ...period,
    });
  }
```

- [ ] **Step 4: Run audit tests**

Run:

```powershell
pnpm --filter @wpptrack/api test -- reporting-controller.test.ts
pnpm --filter @wpptrack/api typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit audit API**

Run:

```powershell
git add apps/api/src/reporting/reporting.controller.ts apps/api/src/reporting/meta-reporting.service.ts apps/api/test/reporting-controller.test.ts
git commit -m "feat: expose conversion event audit"
```

Expected: commit succeeds.

## Task 6: Update Reports UI and CSV Labels

**Files:**
- Modify: `apps/api/src/reporting/meta-reporting.service.ts`
- Modify: `apps/web/src/app/(app)/reports/page.tsx`
- Modify: `apps/web/src/app/(app)/reports/export/route.ts` only if current route drops query fields

- [ ] **Step 1: Update CSV header test or add service test**

Add an assertion around `getCampaignReportCsv`:

```ts
expect(csv.content.split("\n")[0]).toBe(
  "Campanha,Status,Investimento,Conversas Meta,Conversas reais iniciadas,Lead qualificado,Compras,Receita primeira compra,Receita recompra,ROAS aquisicao,ROAS com recompra",
);
```

Run:

```powershell
pnpm --filter @wpptrack/api test -- meta-reporting-service.test.ts
```

Expected: FAIL until CSV headers are updated.

- [ ] **Step 2: Update CSV generation**

In `getCampaignReportCsv`, replace the old header fields:

```ts
"LeadSubmitted",
"QualifiedLead",
"Purchase",
"ROAS",
```

with:

```ts
"Conversas reais iniciadas",
"Lead qualificado",
"Compras",
"Receita primeira compra",
"Receita recompra",
"ROAS aquisicao",
"ROAS com recompra",
```

For each row, output:

```ts
String(campaign.realConversations),
String(campaign.qualifiedLead),
String(campaign.purchases),
this.centsToDecimal(campaign.firstPurchaseRevenueCents),
this.centsToDecimal(campaign.repurchaseRevenueCents),
campaign.roasAcquisition === null ? "" : String(campaign.roasAcquisition),
campaign.roasWithRepurchase === null ? "" : String(campaign.roasWithRepurchase),
```

- [ ] **Step 3: Update Reports page types and totals**

In `apps/web/src/app/(app)/reports/page.tsx`, update `ReportTotals`:

```ts
type ReportTotals = {
  firstPurchaseRevenueCents: number;
  metaConversationsStarted: number;
  purchases: number;
  qualifiedLead: number;
  realConversations: number;
  repurchaseRevenueCents: number;
  spendCents: number;
  trafficRevenueCents: number;
};
```

Update `reportTotals` to sum these fields:

```ts
function reportTotals(rows: PerformanceRow[]): ReportTotals {
  return rows.reduce(
    (totals, row) => ({
      firstPurchaseRevenueCents:
        totals.firstPurchaseRevenueCents + row.firstPurchaseRevenueCents,
      metaConversationsStarted:
        totals.metaConversationsStarted + row.metaConversationsStarted,
      purchases: totals.purchases + row.purchases,
      qualifiedLead: totals.qualifiedLead + row.qualifiedLead,
      realConversations: totals.realConversations + row.realConversations,
      repurchaseRevenueCents:
        totals.repurchaseRevenueCents + row.repurchaseRevenueCents,
      spendCents: totals.spendCents + row.spendCents,
      trafficRevenueCents: totals.trafficRevenueCents + row.trafficRevenueCents,
    }),
    {
      firstPurchaseRevenueCents: 0,
      metaConversationsStarted: 0,
      purchases: 0,
      qualifiedLead: 0,
      realConversations: 0,
      repurchaseRevenueCents: 0,
      spendCents: 0,
      trafficRevenueCents: 0,
    },
  );
}
```

- [ ] **Step 4: Update table cells**

Replace `PerformanceMetricsCells` body with columns using human labels:

```tsx
<>
  <td>{money(row.spendCents)}</td>
  <td>
    {row.metaConversationsStarted}
    <span>{money(row.costPerMetaConversationCents)}</span>
  </td>
  <td>
    {row.realConversations}
    <span>{money(row.costPerRealConversationCents)}</span>
  </td>
  <td>
    {row.qualifiedLead}
    <span>{money(row.costPerQualifiedLeadCents)}</span>
  </td>
  <td>
    {row.purchases}
    <span>{money(row.costPerPurchaseCents)}</span>
  </td>
  <td>{money(row.firstPurchaseRevenueCents)}</td>
  <td>{money(row.repurchaseRevenueCents)}</td>
  <td>{row.roasAcquisition === null ? "-" : `${row.roasAcquisition}x`}</td>
  <td>{row.roasWithRepurchase === null ? "-" : `${row.roasWithRepurchase}x`}</td>
</>
```

Update table headers from `LeadSubmitted`, `QualifiedLead`, `Purchase`, `ROAS` to:

```tsx
<th>Lead qualificado</th>
<th>Compras</th>
<th>Receita primeira compra</th>
<th>Receita recompra</th>
<th>ROAS aquisicao</th>
<th>ROAS com recompra</th>
```

- [ ] **Step 5: Run web typecheck**

Run:

```powershell
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/api test -- meta-reporting-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Reports UI and CSV**

Run:

```powershell
git add apps/api/src/reporting/meta-reporting.service.ts apps/web/src/app/(app)/reports/page.tsx apps/web/src/app/(app)/reports/export/route.ts
git commit -m "feat: show human reporting metrics"
```

Expected: commit succeeds.

## Task 7: Update Overview UI

**Files:**
- Modify: `apps/web/src/app/(app)/overview/page.tsx`

- [ ] **Step 1: Update aggregate helper**

Replace `sumCampaigns` so the returned object uses new fields:

```ts
function sumCampaigns(campaigns: CampaignReportRowDto[]): CampaignReportRowDto {
  const spendCents = campaigns.reduce((total, campaign) => total + campaign.spendCents, 0);
  const metaConversationsStarted = campaigns.reduce(
    (total, campaign) => total + campaign.metaConversationsStarted,
    0
  );
  const realConversations = campaigns.reduce(
    (total, campaign) => total + campaign.realConversations,
    0
  );
  const organicLeads = campaigns.reduce(
    (total, campaign) => total + campaign.organicLeads,
    0
  );
  const qualifiedLead = campaigns.reduce(
    (total, campaign) => total + campaign.qualifiedLead,
    0
  );
  const purchases = campaigns.reduce((total, campaign) => total + campaign.purchases, 0);
  const firstPurchaseRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.firstPurchaseRevenueCents,
    0
  );
  const repurchaseRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.repurchaseRevenueCents,
    0
  );
  const trafficRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.trafficRevenueCents,
    0
  );
  const organicRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.organicRevenueCents,
    0
  );
  const totalReceived = realConversations + organicLeads;

  return {
    id: "all_campaigns",
    name:
      campaigns.length === 0
        ? "Nenhuma campanha sincronizada"
        : campaigns.length === 1
          ? campaigns[0]?.name ?? "Campanha"
          : "Todas as campanhas",
    status: campaigns.some((campaign) => campaign.status === "active") ? "active" : "unknown",
    spendCents,
    metaConversationsStarted,
    costPerMetaConversationCents: costPer(spendCents, metaConversationsStarted),
    realConversations,
    costPerRealConversationCents: costPer(spendCents, realConversations),
    organicLeads,
    totalReceived,
    trackingRate: totalReceived > 0 ? realConversations / totalReceived : null,
    qualifiedLead,
    costPerQualifiedLeadCents: costPer(spendCents, qualifiedLead),
    purchases,
    firstPurchases: campaigns.reduce((total, campaign) => total + campaign.firstPurchases, 0),
    repurchases: campaigns.reduce((total, campaign) => total + campaign.repurchases, 0),
    costPerPurchaseCents: costPer(spendCents, purchases),
    trafficRevenueCents,
    organicRevenueCents,
    totalRevenueCents: trafficRevenueCents + organicRevenueCents,
    firstPurchaseRevenueCents,
    repurchaseRevenueCents,
    roasAcquisition: ratio(firstPurchaseRevenueCents, spendCents),
    roasWithRepurchase: ratio(firstPurchaseRevenueCents + repurchaseRevenueCents, spendCents),
    funnelSteps: campaigns[0]?.funnelSteps ?? [],
  };
}
```

Add helper:

```ts
function ratio(part: number, total: number): number | null {
  return total > 0 && part > 0 ? Number((part / total).toFixed(2)) : null;
}
```

- [ ] **Step 2: Update cards and labels**

Replace the current metric grid with:

```tsx
<div className="metric-grid">
  <Metric label="Conversas Meta" value={String(campaign.metaConversationsStarted)} delta={report.rangeLabel} />
  <Metric label="Conversas reais iniciadas" value={String(campaign.realConversations)} delta={`${trackedRate}% rastreadas`} />
  <Metric label="Leads organicos" value={String(campaign.organicLeads)} delta={`${campaign.totalReceived} recebidos no total`} />
  <Metric label="Faturamento total" value={money(campaign.totalRevenueCents)} delta={`Trafego ${money(campaign.trafficRevenueCents)}`} />
</div>
```

In the funnel section, render `campaign.funnelSteps`:

```tsx
{campaign.funnelSteps.map((step, index) => (
  <FunnelStep
    key={step.key}
    label={step.label}
    value={step.count}
    width={index === 0 ? "100%" : funnelWidth(step.count, campaign.funnelSteps[index - 1]?.count ?? 0)}
  />
))}
```

Replace literal labels `LeadSubmitted`, `QualifiedLead`, and `Purchase` in this file with the human labels.

- [ ] **Step 3: Run web checks**

Run:

```powershell
pnpm --filter @wpptrack/web typecheck
pnpm --filter @wpptrack/web test
```

Expected: PASS.

- [ ] **Step 4: Commit Overview UI**

Run:

```powershell
git add apps/web/src/app/(app)/overview/page.tsx
git commit -m "feat: update overview metric language"
```

Expected: commit succeeds.

## Task 8: Final Verification and Project Handoff

**Files:**
- Modify: `Projeto.md`

- [ ] **Step 1: Run full verification**

Run:

```powershell
pnpm --filter @wpptrack/shared test
pnpm --filter @wpptrack/api test
pnpm --filter @wpptrack/web test
pnpm typecheck
```

Expected: all commands PASS.

- [ ] **Step 2: Build if typecheck passes**

Run:

```powershell
pnpm build
```

Expected: build PASS.

- [ ] **Step 3: Update `Projeto.md`**

Add a new bullet under `Proximo passo operacional`:

```md
- Motor centralizado de metricas de relatorios implementado conforme `docs/superpowers/specs/2026-07-10-wpptrack-reporting-metrics-formulas-design.md` e plano `docs/superpowers/plans/2026-07-10-wpptrack-reporting-metrics-engine-implementation.md`: contratos compartilhados usam nomes humanos, eventos de negocio contam mesmo com falha de envio Meta, compras separam primeira compra/recompra por telefone normalizado, organico fica separado da midia paga, e Visao Geral/Relatorios/CSV usam o mesmo motor de calculo.
```

Replace the "Ordem aprovada" bullet if all implementation tasks are complete:

```md
- Proxima etapa apos o motor de metricas: retomar o teste real Uazapi/CAPI com payload real (`ctwa_clid`, `ad_id`, evento recebido e envio Meta), sem bloquear ajustes visuais posteriores.
```

- [ ] **Step 4: Commit final handoff**

Run:

```powershell
git add Projeto.md
git commit -m "docs: update metrics engine handoff"
```

Expected: commit succeeds.

- [ ] **Step 5: Report final status**

Include:

- commits created;
- tests run and results;
- migrations created;
- any manual action required for Dokploy deploy, such as applying the Prisma migration through the API Dockerfile deployment.
