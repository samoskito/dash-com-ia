import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversionEventsService } from "../src/conversion-events/conversion-events.service";
import { MetaCapiAdapter } from "../src/conversion-events/meta-capi.adapter";

function createHarness(
  metaCapiAdapter?: {
    sendEvent(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  },
  connectionResolver?: {
    hasNormalizedConnections(workspaceId: string): Promise<boolean>;
    resolveCapiRoute(
      input: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
    getLegacyCompatibilityProjection?(
      workspaceId: string,
      purpose: "reporting" | "capi",
    ): Promise<Record<string, unknown>>;
  },
) {
  const db = {
    integrationLogs: [] as Array<Record<string, unknown>>,
    diagnosticEvents: [] as Array<Record<string, unknown>>,
    logs: [] as Array<Record<string, unknown>>,
    destinations: [] as Array<Record<string, unknown>>,
    cutovers: [] as Array<Record<string, unknown>>,
    countQueries: [] as Array<Record<string, unknown>>,
    funnelDefaults: [] as Array<Record<string, unknown>>,
  };
  const prisma = {
    externalCapiCutover: {
      findFirst: async ({
        where,
      }: {
        where: {
          connectorId: string;
          eventType: string;
          status: string;
          activatedAt: { lte: Date };
        };
      }) =>
        db.cutovers.find(
          (cutover) =>
            cutover.connectorId === where.connectorId &&
            cutover.eventType === where.eventType &&
            cutover.status === where.status &&
            cutover.activatedAt instanceof Date &&
            cutover.activatedAt <= where.activatedAt.lte,
        ) ?? null,
    },
    funnelStageConfiguration: {
      findMany: async ({
        where,
      }: {
        where: { workspaceId: string; eventName: { in: string[] } };
      }) =>
        db.funnelDefaults.filter(
          (defaults) =>
            defaults.workspaceId === where.workspaceId &&
            where.eventName.in.includes(String(defaults.eventName)),
        ),
    },
    metaConversionDestination: {
      findFirst: async ({ where }: { where: { workspaceId: string } }) =>
        db.destinations.find(
          (destination) => destination.workspaceId === where.workspaceId,
        ) ?? null,
    },
    metaIntegration: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) =>
        db.logs.find((log) => log.workspaceId === where.workspaceId)
          ? {
              workspaceId: where.workspaceId,
              encryptedAccessToken: "workspace-oauth-token",
              tokenIv: "oauth-iv",
              tokenTag: "oauth-tag",
              capiAccessTokenEncrypted: null,
              capiTokenIv: null,
              capiTokenTag: null,
              selectedAdAccountId: "act_legacy",
            }
          : null,
    },
    conversionEventLog: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; dedupeKey?: string; workspaceId?: string };
      }) =>
        db.logs.find(
          (log) =>
            (where.workspaceId === undefined ||
              log.workspaceId === where.workspaceId) &&
            ((where.id !== undefined && log.id === where.id) ||
              (where.dedupeKey !== undefined &&
                log.dedupeKey === where.dedupeKey)),
        ) ?? null,
      findMany: async ({
        where,
      }: {
        where: { id: { in: string[] }; status?: string };
      }) =>
        db.logs.filter(
          (log) =>
            where.id.in.includes(String(log.id)) &&
            (where.status === undefined || log.status === where.status),
        ),
      count: async ({
        where,
      }: {
        where: {
          workspaceId?: string;
          eventName?: string;
          customerIdentityKey?: string;
        };
      }) => {
        db.countQueries.push(where);
        return db.logs.filter(
          (log) =>
            (where.workspaceId === undefined ||
              log.workspaceId === where.workspaceId) &&
            (where.eventName === undefined ||
              log.eventName === where.eventName) &&
            (where.customerIdentityKey === undefined ||
              log.customerIdentityKey === where.customerIdentityKey),
        ).length;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `conversion_${db.logs.length + 1}`,
          createdAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data,
        };
        db.logs.push(log);
        return log;
      },
      update: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const index = db.logs.findIndex((log) => log.id === where.id);
        db.logs[index] = {
          ...db.logs[index],
          ...data,
        };
        return db.logs[index];
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: { id: string; status?: string };
      }) => {
        let count = 0;
        db.logs = db.logs.map((log) => {
          if (
            log.id === where.id &&
            (where.status === undefined || log.status === where.status)
          ) {
            count += 1;
            return { ...log, ...data };
          }
          return log;
        });
        return { count };
      },
    },
    integrationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `integration_${db.integrationLogs.length + 1}`,
          startedAt: data.startedAt ?? new Date("2026-07-02T03:00:00.000Z"),
          ...data,
        };
        db.integrationLogs.push(log);
        return log;
      },
    },
    diagnosticEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const event = {
          id: `diagnostic_${db.diagnosticEvents.length + 1}`,
          ...data,
        };
        db.diagnosticEvents.push(event);
        return event;
      },
    },
  };

  return {
    db,
    service: new ConversionEventsService(
      prisma as never,
      (metaCapiAdapter ?? {
        sendEvent: async () => ({
          status: "not_configured" as const,
          requestPayload: null,
          responseSummary: null,
          errorMessage: "Meta CAPI token, pixel id or page id not configured",
          errorCode: "MissingMetaDestination" as const,
        }),
      }) as never,
      {
        decrypt: ({ encryptedAccessToken }: { encryptedAccessToken: string }) =>
          encryptedAccessToken,
        fingerprint: (accessToken: string) => `fingerprint:${accessToken}`,
      } as never,
      connectionResolver as never,
    ),
  };
}

describe("conversion events service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records conversion logs for matched keyword and label rules without sending Meta events", async () => {
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
          name: "Lead qualificado",
          triggerType: "keyword",
          triggerValue: "quero comprar",
          matchMode: "contains",
          eventName: "QualifiedLead",
          pixelId: "pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
        {
          id: "rule_2",
          workspaceId: "workspace_1",
          name: "Compra",
          triggerType: "whatsapp_label",
          triggerValue: "Venda fechada",
          matchMode: "exact",
          eventName: "Purchase",
          pixelId: null,
          defaultValueCents: 19900,
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    expect(result.created).toHaveLength(2);
    expect(db.logs[0]).toMatchObject({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      sourceTrigger: "keyword",
      eventName: "QualifiedLead",
      status: "ready_to_send",
      pixelId: "pixel_1",
      adId: "ad_1",
    });
    expect(db.logs[1]).toMatchObject({
      sourceTrigger: "whatsapp_label",
      eventName: "Purchase",
      status: "ready_to_send",
      pixelId: null,
      adId: "ad_1",
    });
  });

  it("uses workspace event defaults when a rule has no specific product or value", async () => {
    const { db, service } = createHarness();
    db.funnelDefaults.push({
      workspaceId: "workspace_1",
      eventName: "Purchase",
      defaultValueCents: 250_000,
      defaultCurrency: "BRL",
      defaultContentName: "Plano premium",
    });

    await service.recordRuleMatches({
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
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    expect(db.logs[0]).toMatchObject({
      eventName: "Purchase",
      valueCents: 250_000,
      valueSource: "configured_average",
      currency: "BRL",
      contentName: "Plano premium",
      status: "ready_to_send",
    });
  });

  it("persists reporting occurrence fields for automatic LeadSubmitted events", async () => {
    const { db, service } = createHarness();

    await service.recordAutomaticLeadSubmitted({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
    });

    expect(db.logs[0]).toMatchObject({
      eventName: "LeadSubmitted",
      eventOccurredAt: expect.any(Date),
      customerIdentityKey: "phone_hash_1",
      businessSource: "paid",
      purchaseKind: null,
    });
  });

  it("stores historical external milestones as imported", async () => {
    const { db, service } = createHarness();

    const result = await service.recordExternalConversion({
      workspaceId: "workspace_1",
      externalConnectorId: "connector_1",
      sourceEventId: "historical-lead:1:qualified_lead",
      sourceTrigger: "external_mysql:kinbox_mysql",
      eventName: "QualifiedLead",
      eventId: "event_historical_1",
      dedupeKey:
        "external:connector_1:kinbox_mysql:qualified_lead:lead:phone_hash_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      businessSource: "paid",
      adId: "ad_1",
      ctwaClid: "clid_1",
      eventOccurredAt: new Date("2026-07-11T03:00:00.000Z"),
      deliveryStatus: "imported",
    });

    expect(result).toMatchObject({
      status: "created",
      deliveryStatus: "imported",
    });
    expect(db.logs[0]).toMatchObject({
      status: "imported",
      eventName: "QualifiedLead",
      eventOccurredAt: new Date("2026-07-11T03:00:00.000Z"),
      errorCode: null,
      errorMessage: null,
    });
  });

  it("stores final external events without click context as not eligible", async () => {
    const { db, service } = createHarness();

    const result = await service.recordExternalConversion({
      workspaceId: "workspace_1",
      externalConnectorId: "connector_1",
      sourceEventId: "qualified-lead-without-click",
      sourceTrigger: "external_mysql:kinbox_mysql",
      eventName: "QualifiedLead",
      eventId: "event_without_click_1",
      dedupeKey: "external:connector_1:qualified:event_without_click_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      businessSource: "organic",
      adId: null,
      ctwaClid: null,
      eventOccurredAt: new Date("2026-07-11T14:00:00.000Z"),
      sourcePayload: {
        schema: "external_event_row_v1",
        adId: null,
        ctwaClid: null,
      },
      deliveryStatus: "not_eligible",
    });

    expect(result).toMatchObject({
      status: "created",
      deliveryStatus: "not_eligible",
    });
    expect(db.logs[0]).toMatchObject({
      status: "not_eligible",
      errorCode: "MissingAdId",
      sourcePayload: {
        schema: "external_event_row_v1",
        adId: null,
        ctwaClid: null,
      },
    });
  });

  it("does not let an external retry bypass the event cutover", async () => {
    const adapter = { sendEvent: vi.fn() };
    const { db, service } = createHarness(adapter);
    await service.recordExternalConversion({
      workspaceId: "workspace_1",
      externalConnectorId: "connector_1",
      sourceEventId: "qualified_1",
      sourceTrigger: "external_mysql:kinbox_mysql",
      eventName: "QualifiedLead",
      eventId: "qualified_ctwa_1",
      dedupeKey: "external:connector_1:qualified:1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      businessSource: "paid",
      adId: "ad_1",
      ctwaClid: "ctwa_1",
      eventOccurredAt: new Date("2026-07-11T14:00:00.000Z"),
    });

    const result = await service.sendReadyEvent("conversion_1");

    expect(result).toEqual({
      conversionEventLogId: "conversion_1",
      workspaceId: "workspace_1",
      status: "skipped",
    });
    expect(db.logs[0]).toMatchObject({ status: "shadow_observed" });
    expect(adapter.sendEvent).not.toHaveBeenCalled();
  });

  it("rejects a cross-tenant ready event before calling Meta CAPI", async () => {
    const adapter = { sendEvent: vi.fn() };
    const { service } = createHarness(adapter);
    await service.recordAutomaticLeadSubmitted({
      workspaceId: "workspace_2",
      leadId: "lead_workspace_2",
      phoneHash: "phone_hash_workspace_2",
      adId: "ad_2",
      ctwaClid: "ctwa_2",
    });

    await expect(
      service.sendReadyEvent("conversion_1", {
        workspaceId: "workspace_1",
      }),
    ).rejects.toThrow("Evento de conversao nao encontrado");

    expect(adapter.sendEvent).not.toHaveBeenCalled();
  });

  it("sends an external event only when its active cutover predates it", async () => {
    const adapter = {
      sendEvent: vi.fn(async () => ({
        status: "sent" as const,
        responseSummary: { events_received: 1 },
        errorMessage: null,
        errorCode: null,
      })),
    };
    const { db, service } = createHarness(adapter);
    db.destinations.push({
      workspaceId: "workspace_1",
      pixelId: "pixel_1",
      pageId: "page_1",
    });
    db.cutovers.push({
      id: "cutover_1",
      connectorId: "connector_1",
      eventType: "qualified_lead",
      status: "active",
      activatedAt: new Date("2026-07-11T13:00:00.000Z"),
    });
    await service.recordExternalConversion({
      workspaceId: "workspace_1",
      externalConnectorId: "connector_1",
      sourceEventId: "qualified_1",
      sourceTrigger: "external_mysql:kinbox_mysql",
      eventName: "QualifiedLead",
      eventId: "qualified_ctwa_1",
      dedupeKey: "external:connector_1:qualified:1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      businessSource: "paid",
      adId: "ad_1",
      ctwaClid: "ctwa_1",
      eventOccurredAt: new Date("2026-07-11T14:00:00.000Z"),
    });

    const result = await service.sendReadyEvent("conversion_1");

    expect(result.status).toBe("sent");
    expect(adapter.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "qualified_ctwa_1" }),
    );
  });

  it("promotes one historical purchase when the live ledger event arrives", async () => {
    const { db, service } = createHarness();
    const common = {
      workspaceId: "workspace_1",
      externalConnectorId: "connector_1",
      sourceTrigger: "external_mysql:kinbox_mysql",
      eventName: "Purchase" as const,
      eventId:
        "external:connector_1:kinbox_mysql:purchase:phone_hash_1:2026-07-12",
      dedupeKey:
        "external:connector_1:kinbox_mysql:purchase:phone_hash_1:2026-07-12",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      businessSource: "paid" as const,
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      valueCents: 400_000,
      valueSource: "configured_average" as const,
      currency: "BRL",
    };

    await service.recordExternalConversion({
      ...common,
      sourceEventId: "historical-lead:1:purchase",
      eventOccurredAt: new Date("2026-07-12T03:00:00.000Z"),
      deliveryStatus: "imported",
    });
    const result = await service.recordExternalConversion({
      ...common,
      sourceEventId: "ledger-purchase-42",
      eventOccurredAt: new Date("2026-07-12T15:30:00.000Z"),
    });

    expect(result).toEqual({
      conversionEventLogId: "conversion_1",
      status: "created",
      deliveryStatus: "ready_to_send",
    });
    expect(db.logs).toHaveLength(1);
    expect(db.logs[0]).toMatchObject({
      sourceEventId: "ledger-purchase-42",
      status: "ready_to_send",
      eventOccurredAt: new Date("2026-07-12T15:30:00.000Z"),
      valueCents: 400_000,
      valueSource: "configured_average",
      businessSource: "paid",
      errorCode: null,
    });
  });

  it("classifies purchases by first purchase per workspace customer identity", async () => {
    const { db, service } = createHarness();
    const firstOccurredAt = new Date("2026-07-02T10:15:00.000Z");
    const secondOccurredAt = new Date("2026-07-03T10:15:00.000Z");
    const purchaseRule = {
      id: "rule_purchase",
      workspaceId: "workspace_1",
      name: "Compra",
      triggerType: "keyword" as const,
      triggerValue: "comprar",
      matchMode: "contains" as const,
      eventName: "Purchase" as const,
      pixelId: "pixel_1",
      defaultValueCents: 19900,
      active: true,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z",
    };

    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      eventOccurredAt: firstOccurredAt,
      rules: [purchaseRule],
    });
    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_2",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      eventOccurredAt: secondOccurredAt,
      rules: [{ ...purchaseRule, id: "rule_purchase_2" }],
    });

    expect(db.logs[0]).toMatchObject({
      eventName: "Purchase",
      eventOccurredAt: firstOccurredAt,
      customerIdentityKey: "phone_hash_1",
      businessSource: "paid",
      purchaseKind: "first_purchase",
    });
    expect(db.logs[1]).toMatchObject({
      eventName: "Purchase",
      eventOccurredAt: secondOccurredAt,
      customerIdentityKey: "phone_hash_1",
      businessSource: "paid",
      purchaseKind: "repurchase",
    });
  });

  it("keeps purchaseKind null and skips classification when Purchase has no customer identity", async () => {
    const { db, service } = createHarness();

    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      rules: [
        {
          id: "rule_purchase",
          workspaceId: "workspace_1",
          name: "Compra",
          triggerType: "keyword",
          triggerValue: "comprar",
          matchMode: "contains",
          eventName: "Purchase",
          pixelId: "pixel_1",
          defaultValueCents: 19900,
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    expect(db.logs[0]).toMatchObject({
      eventName: "Purchase",
      phoneHash: null,
      customerIdentityKey: null,
      businessSource: "paid",
      purchaseKind: null,
    });
    expect(db.countQueries).toEqual([]);
  });

  it("blocks Purchase without value as pending_value", async () => {
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
          pixelId: "pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    expect(result.created).toEqual(["conversion_1"]);
    expect(db.logs[0]).toMatchObject({
      eventName: "Purchase",
      status: "pending_value",
      errorCode: "EventValueMissing",
      errorMessage: "Conversion event value is required",
      valueCents: null,
    });
  });

  it("records legacy unsupported event names as skipped without enqueueing them", async () => {
    const adapter = {
      sendEvent: vi.fn(),
    };
    const { db, service } = createHarness(adapter);

    const result = await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      rules: [
        {
          id: "rule_legacy",
          workspaceId: "workspace_1",
          name: "Legacy contact",
          triggerType: "keyword",
          triggerValue: "contato",
          matchMode: "contains",
          eventName: "Contact" as never,
          pixelId: "pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    await expect(service.listReadyLogIds(result.created)).resolves.toEqual([]);
    expect(result.created).toEqual(["conversion_1"]);
    expect(adapter.sendEvent).not.toHaveBeenCalled();
    expect(db.logs[0]).toMatchObject({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      sourceTrigger: "keyword",
      eventName: "Contact",
      status: "skipped",
      errorCode: "UnsupportedConversionEventName",
      errorMessage: "Unsupported conversion event name",
    });
  });

  it("records automatic LeadSubmitted once and dedupes the second call", async () => {
    const { db, service } = createHarness();
    const input = {
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
    };

    const first = await service.recordAutomaticLeadSubmitted(input);
    const second = await service.recordAutomaticLeadSubmitted(input);

    expect(first.created).toEqual(["conversion_1"]);
    expect(first.duplicates).toEqual([]);
    expect(second.created).toEqual([]);
    expect(second.duplicates).toEqual(["conversion_1"]);
    expect(db.logs).toHaveLength(1);
    expect(db.logs[0]).toMatchObject({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      sourceTrigger: "auto_lead",
      eventName: "LeadSubmitted",
      status: "ready_to_send",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      dedupeKey: "workspace_1:lead_1:auto_lead:LeadSubmitted:ad_1",
    });
  });

  it("sends ready conversion logs to Meta CAPI and stores provider response", async () => {
    const adapter = {
      calls: [] as Array<Record<string, unknown>>,
      sendEvent: async (input: Record<string, unknown>) => {
        adapter.calls.push(input);

        return {
          status: "sent" as const,
          requestPayload: {
            data: [
              {
                event_name: "Purchase",
                event_id: "workspace_1:lead_1:rule_1:Purchase:ad_1",
              },
            ],
          },
          responseSummary: {
            events_received: 1,
          },
          errorMessage: null,
          errorCode: null,
        };
      },
    };
    const { db, service } = createHarness(adapter);
    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      valueCents: 19900,
      currency: "BRL",
      contentName: "Plano mensal",
      customData: {
        order_id: "order_1",
      },
      rules: [
        {
          id: "rule_1",
          workspaceId: "workspace_1",
          name: "Compra",
          triggerType: "keyword",
          triggerValue: "quero comprar",
          matchMode: "contains",
          eventName: "Purchase",
          pixelId: "pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    const result = await service.sendReadyEvent("conversion_1");

    expect(result).toEqual({
      conversionEventLogId: "conversion_1",
      workspaceId: "workspace_1",
      status: "sent",
    });
    expect(db.logs[0]).toMatchObject({
      status: "sent",
      providerResponseSummary: {
        events_received: 1,
      },
      providerRequestPayload: {
        data: [
          {
            event_name: "Purchase",
            event_id: "workspace_1:lead_1:rule_1:Purchase:ad_1",
          },
        ],
      },
      errorMessage: null,
    });
    expect(db.logs[0].sentAt).toBeInstanceOf(Date);
    expect(adapter.calls[0]).toMatchObject({
      accessToken: "workspace-oauth-token",
      pixelId: "pixel_1",
      pageId: null,
      eventName: "Purchase",
      dedupeKey: "workspace_1:lead_1:rule_1:Purchase:ad_1",
      ctwaClid: "clid_1",
      valueCents: 19900,
      currency: "BRL",
      contentName: "Plano mensal",
      customData: {
        order_id: "order_1",
      },
      testEventCode: null,
    });
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        operation: "meta.capi.send_event",
        status: "success",
        providerRequestId: "conversion_1",
        leadId: "lead_1",
        adId: "ad_1",
        jobId: "conversion_1",
      }),
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain(
      "workspace-oauth-token",
    );
  });

  it("routes a manual event through the exact account connection and destination", async () => {
    const adapter = {
      sendEvent: vi.fn(async () => ({
        status: "sent" as const,
        requestPayload: { data: [{ event_name: "QualifiedLead" }] },
        responseSummary: { events_received: 1 },
        errorMessage: null,
        errorCode: null,
      })),
    };
    const connectionResolver = {
      hasNormalizedConnections: vi.fn(async () => true),
      resolveCapiRoute: vi.fn(async () => ({
        source: "manual" as const,
        workspaceId: "workspace_manual",
        accessToken: "manual-token-exact",
        reportingAccountId: "reporting_1",
        adAccountId: "act_1",
        businessConnectionId: "connection_1",
        credentialId: "credential_1",
        conversionDestinationId: "destination_1",
        pixelId: "pixel_manual",
        pageId: "page_manual",
      })),
    };
    const { db, service } = createHarness(adapter, connectionResolver);

    await service.recordAutomaticLeadSubmitted({
      workspaceId: "workspace_manual",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "campaign_1",
      adId: "ad_1",
      ctwaClid: "ctwa_1",
    });

    await expect(service.sendReadyEvent("conversion_1")).resolves.toMatchObject(
      {
        status: "sent",
        workspaceId: "workspace_manual",
      },
    );
    expect(connectionResolver.resolveCapiRoute).toHaveBeenCalledWith({
      workspaceId: "workspace_manual",
      metaAccountId: undefined,
      campaignId: "campaign_1",
      adId: "ad_1",
    });
    expect(adapter.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "manual-token-exact",
        pixelId: "pixel_manual",
        pageId: "page_manual",
      }),
    );
    expect(db.logs[0]).toMatchObject({
      status: "sent",
      metaAccountId: "act_1",
      metaBusinessConnectionId: "connection_1",
      metaConversionDestinationId: "destination_1",
    });
    expect(db.integrationLogs[0]?.requestSummary).toMatchObject({
      routeSource: "manual",
      reportingAccountId: "reporting_1",
      adAccountId: "act_1",
      businessConnectionId: "connection_1",
      conversionDestinationId: "destination_1",
    });
    expect(JSON.stringify(db.integrationLogs)).not.toContain(
      "manual-token-exact",
    );

    db.logs[0]!.status = "ready_to_send";
    connectionResolver.resolveCapiRoute.mockClear();
    await service.sendReadyEvent("conversion_1");
    expect(connectionResolver.resolveCapiRoute).toHaveBeenCalledWith({
      workspaceId: "workspace_manual",
      metaAccountId: "act_1",
      campaignId: "campaign_1",
      adId: "ad_1",
      businessConnectionId: "connection_1",
      conversionDestinationId: "destination_1",
    });
  });

  it("blocks an ambiguous manual route without calling Meta or guessing a token", async () => {
    const adapter = { sendEvent: vi.fn() };
    const connectionResolver = {
      hasNormalizedConnections: vi.fn(async () => true),
      resolveCapiRoute: vi.fn(async () => {
        throw new Error(
          "Nao foi possivel determinar com seguranca qual conexao Meta deve enviar este evento",
        );
      }),
    };
    const { db, service } = createHarness(adapter, connectionResolver);

    await service.recordAutomaticLeadSubmitted({
      workspaceId: "workspace_manual",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      adId: "ad_without_snapshot",
      ctwaClid: "ctwa_1",
    });

    await expect(service.sendReadyEvent("conversion_1")).resolves.toMatchObject(
      {
        status: "not_configured",
        workspaceId: "workspace_manual",
      },
    );
    expect(adapter.sendEvent).not.toHaveBeenCalled();
    expect(db.logs[0]).toMatchObject({
      status: "not_configured",
      errorCode: "MissingMetaDestination",
      errorMessage:
        "Nao foi possivel determinar com seguranca qual conexao Meta deve enviar este evento",
    });
    expect(db.diagnosticEvents[0]?.summaryPayload).toMatchObject({
      routeSource: "manual",
      businessConnectionId: null,
      conversionDestinationId: null,
    });
  });

  it("keeps an OAuth workspace on the original legacy delivery methods", async () => {
    const adapter = {
      sendEvent: vi.fn(async () => ({
        status: "sent" as const,
        requestPayload: null,
        responseSummary: { events_received: 1 },
        errorMessage: null,
        errorCode: null,
      })),
    };
    const connectionResolver = {
      hasNormalizedConnections: vi.fn(async () => false),
      resolveCapiRoute: vi.fn(),
      getLegacyCompatibilityProjection: vi.fn(async () => ({
        source: "legacy_oauth" as const,
        workspaceId: "workspace_barbieri",
        businessId: "business_barbieri",
        adAccountId: "act_legacy",
        pixelId: "pixel_barbieri",
        destinationPixelId: "pixel_barbieri",
        destinationPageId: "page_barbieri",
        credentialFingerprint: "fingerprint:workspace-oauth-token",
      })),
    };
    const { db, service } = createHarness(adapter, connectionResolver);
    db.destinations.push({
      workspaceId: "workspace_barbieri",
      pixelId: "pixel_barbieri",
      pageId: "page_barbieri",
    });

    await service.recordAutomaticLeadSubmitted({
      workspaceId: "workspace_barbieri",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "ctwa_1",
    });
    await service.sendReadyEvent("conversion_1");

    expect(connectionResolver.resolveCapiRoute).not.toHaveBeenCalled();
    expect(
      connectionResolver.getLegacyCompatibilityProjection,
    ).toHaveBeenCalledWith("workspace_barbieri", "capi");
    expect(adapter.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "workspace-oauth-token",
        pixelId: "pixel_barbieri",
        pageId: "page_barbieri",
      }),
    );
    expect(db.logs[0]).not.toHaveProperty("metaBusinessConnectionId");
    expect(db.logs[0]).not.toHaveProperty("metaConversionDestinationId");
    expect(db.integrationLogs[0]?.requestSummary).toMatchObject({
      routeSource: "legacy_oauth",
      legacyShadowParity: {
        comparisonStatus: "matched",
        credentialFingerprintMatch: true,
        adAccountMatch: true,
        pixelMatch: true,
        pageMatch: true,
        parity: true,
      },
    });
    expect(JSON.stringify(db.integrationLogs)).not.toContain(
      "fingerprint:workspace-oauth-token",
    );
  });

  it("creates and sends a manual test conversion with Meta test event code", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890);
    const adapter = {
      calls: [] as Array<Record<string, unknown>>,
      sendEvent: async (input: Record<string, unknown>) => {
        adapter.calls.push(input);

        return {
          status: "sent" as const,
          responseSummary: {
            events_received: 1,
          },
          errorMessage: null,
          errorCode: null,
        };
      },
    };
    const { db, service } = createHarness(adapter);
    db.destinations.push({
      workspaceId: "workspace_1",
      pixelId: "workspace_pixel_1",
      pageId: "page_1",
    });

    const result = await service.sendManualTestEvent({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      eventName: "QualifiedLead",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      testEventCode: "TEST12345",
    });

    expect(result).toEqual({
      conversionEventLogId: "conversion_1",
      workspaceId: "workspace_1",
      status: "sent",
    });
    const manualTestKeyPattern =
      /^workspace_1:lead_1:manual_test:QualifiedLead:ad_1:1234567890:[0-9a-f-]{36}$/;
    expect(db.logs[0]).toMatchObject({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      sourceTrigger: "manual_test",
      eventName: "QualifiedLead",
      status: "sent",
      eventId: expect.stringMatching(manualTestKeyPattern),
      dedupeKey: expect.stringMatching(manualTestKeyPattern),
      adId: "ad_1",
      ctwaClid: "clid_1",
      attributionStatus: "manual_test",
      customData: Prisma.JsonNull,
      errorCode: null,
      errorMessage: null,
    });
    expect(adapter.calls[0]).toMatchObject({
      pixelId: "workspace_pixel_1",
      pageId: "page_1",
      eventName: "QualifiedLead",
      dedupeKey: db.logs[0]?.dedupeKey,
      testEventCode: "TEST12345",
    });
    expect(db.logs[0]?.eventId).toBe(db.logs[0]?.dedupeKey);
  });

  it("creates distinct manual test conversions when Date.now matches", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890);
    const adapter = {
      calls: [] as Array<Record<string, unknown>>,
      sendEvent: async (input: Record<string, unknown>) => {
        adapter.calls.push(input);

        return {
          status: "sent" as const,
          responseSummary: {
            events_received: 1,
          },
          errorMessage: null,
          errorCode: null,
        };
      },
    };
    const { db, service } = createHarness(adapter);
    db.destinations.push({
      workspaceId: "workspace_1",
      pixelId: "workspace_pixel_1",
      pageId: "page_1",
    });

    const input = {
      workspaceId: "workspace_1",
      leadId: "lead_1",
      eventName: "QualifiedLead" as const,
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      testEventCode: "TEST12345",
    };

    const first = await service.sendManualTestEvent(input);
    const second = await service.sendManualTestEvent(input);

    expect(first).toMatchObject({
      conversionEventLogId: "conversion_1",
      workspaceId: "workspace_1",
      status: "sent",
    });
    expect(second).toMatchObject({
      conversionEventLogId: "conversion_2",
      workspaceId: "workspace_1",
      status: "sent",
    });
    expect(db.logs).toHaveLength(2);
    expect(db.logs[0]?.dedupeKey).not.toBe(db.logs[1]?.dedupeKey);
    expect(db.logs[0]?.eventId).not.toBe(db.logs[1]?.eventId);
    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[0]?.dedupeKey).toBe(db.logs[0]?.dedupeKey);
    expect(adapter.calls[1]?.dedupeKey).toBe(db.logs[1]?.dedupeKey);
  });

  it("records a manual test conversion without sending when initial status is blocked", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890);
    const adapter = {
      sendEvent: vi.fn(),
    };
    const { db, service } = createHarness(adapter);

    const result = await service.sendManualTestEvent({
      workspaceId: "workspace_1",
      eventName: "Purchase",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      testEventCode: "TEST12345",
    });

    expect(result).toEqual({
      conversionEventLogId: "conversion_1",
      workspaceId: "workspace_1",
      status: "not_configured",
    });
    expect(adapter.sendEvent).not.toHaveBeenCalled();
    expect(db.logs[0]).toMatchObject({
      sourceTrigger: "manual_test",
      eventName: "Purchase",
      status: "pending_value",
      attributionStatus: "manual_test",
      errorCode: "EventValueMissing",
      errorMessage: "Conversion event value is required",
    });
  });

  it("uses workspace conversion destination instead of rule pixel when sending CAPI", async () => {
    const adapter = {
      calls: [] as Array<Record<string, unknown>>,
      sendEvent: async (input: Record<string, unknown>) => {
        adapter.calls.push(input);

        return {
          status: "sent" as const,
          responseSummary: {
            events_received: 1,
          },
          errorMessage: null,
          errorCode: null,
        };
      },
    };
    const { db, service } = createHarness(adapter);
    db.destinations.push({
      workspaceId: "workspace_1",
      pixelId: "workspace_pixel_1",
      pageId: "page_1",
    });
    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      rules: [
        {
          id: "rule_1",
          workspaceId: "workspace_1",
          name: "Lead qualificado",
          triggerType: "keyword",
          triggerValue: "quero comprar",
          matchMode: "contains",
          eventName: "QualifiedLead",
          pixelId: "legacy_rule_pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    await service.sendReadyEvent("conversion_1");

    expect(adapter.calls[0]).toMatchObject({
      accessToken: "workspace-oauth-token",
      pixelId: "workspace_pixel_1",
      pageId: "page_1",
    });
    expect(db.integrationLogs[0].requestSummary).toMatchObject({
      conversionEventLogId: "conversion_1",
      eventName: "QualifiedLead",
      pixelId: "workspace_pixel_1",
      pageId: "page_1",
      adId: "ad_1",
    });
  });

  it("stores MissingCtwaClid before attempting to send", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          events_received: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const { db, service } = createHarness(
      new MetaCapiAdapter({}, fetchMock as never),
    );
    db.destinations.push({
      workspaceId: "workspace_1",
      pixelId: "workspace_pixel_1",
      pageId: "page_1",
    });
    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      rules: [
        {
          id: "rule_1",
          workspaceId: "workspace_1",
          name: "Lead qualificado",
          triggerType: "keyword",
          triggerValue: "quero comprar",
          matchMode: "contains",
          eventName: "QualifiedLead",
          pixelId: "pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    const result = await service.sendReadyEvent("conversion_1");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversionEventLogId: "conversion_1",
      workspaceId: null,
      status: "skipped",
    });
    expect(db.logs[0]).toMatchObject({
      status: "pending_meta_context",
      pixelId: "pixel_1",
      errorMessage: "Meta CAPI ctwa_clid not available",
      errorCode: "MissingCtwaClid",
    });
    expect(db.integrationLogs).toEqual([]);
    expect(db.diagnosticEvents).toEqual([]);
  });

  it("does not create duplicate conversion logs for the same dedupe key", async () => {
    const { db, service } = createHarness();
    const input = {
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      rules: [
        {
          id: "rule_1",
          workspaceId: "workspace_1",
          name: "Lead qualificado",
          triggerType: "keyword" as const,
          triggerValue: "quero comprar",
          matchMode: "contains" as const,
          eventName: "QualifiedLead" as const,
          pixelId: "pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    };

    const first = await service.recordRuleMatches(input);
    const second = await service.recordRuleMatches(input);

    expect(first.created).toEqual(["conversion_1"]);
    expect(second.created).toEqual([]);
    expect(second.duplicates).toEqual(["conversion_1"]);
    expect(db.logs).toHaveLength(1);
  });

  it("lists only ready conversion log ids", async () => {
    const { service } = createHarness();
    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      rules: [
        {
          id: "rule_1",
          workspaceId: "workspace_1",
          name: "Lead qualificado",
          triggerType: "keyword",
          triggerValue: "quero comprar",
          matchMode: "contains",
          eventName: "QualifiedLead",
          pixelId: "pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });
    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_2",
      phoneHash: "phone_hash_2",
      adId: "ad_1",
      ctwaClid: "clid_2",
      rules: [
        {
          id: "rule_2",
          workspaceId: "workspace_1",
          name: "Compra",
          triggerType: "keyword",
          triggerValue: "comprar",
          matchMode: "contains",
          eventName: "Purchase",
          pixelId: "pixel_1",
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z",
        },
      ],
    });

    await expect(
      service.listReadyLogIds(["conversion_1", "conversion_2", "missing"]),
    ).resolves.toEqual(["conversion_1"]);
  });
});
