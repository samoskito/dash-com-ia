import { describe, expect, it } from "vitest";
import { ConversionEventsService } from "../src/conversion-events/conversion-events.service";
import type { MetaCapiAdapter } from "../src/conversion-events/meta-capi.adapter";

function createHarness(metaCapiAdapter?: Pick<MetaCapiAdapter, "sendEvent">) {
  const db = {
    integrationLogs: [] as Array<Record<string, unknown>>,
    diagnosticEvents: [] as Array<Record<string, unknown>>,
    logs: [] as Array<Record<string, unknown>>
  };
  const prisma = {
    conversionEventLog: {
      findUnique: async ({ where }: { where: { id?: string; dedupeKey?: string } }) =>
        db.logs.find(
          (log) =>
            (where.id !== undefined && log.id === where.id) ||
            (where.dedupeKey !== undefined && log.dedupeKey === where.dedupeKey)
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `conversion_${db.logs.length + 1}`,
          createdAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        db.logs.push(log);
        return log;
      },
      update: async ({
        data,
        where
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const index = db.logs.findIndex((log) => log.id === where.id);
        db.logs[index] = {
          ...db.logs[index],
          ...data
        };
        return db.logs[index];
      }
    },
    integrationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `integration_${db.integrationLogs.length + 1}`,
          startedAt: data.startedAt ?? new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        db.integrationLogs.push(log);
        return log;
      }
    },
    diagnosticEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const event = {
          id: `diagnostic_${db.diagnosticEvents.length + 1}`,
          ...data
        };
        db.diagnosticEvents.push(event);
        return event;
      }
    }
  };

  return {
    db,
    service: new ConversionEventsService(
      prisma as never,
      (metaCapiAdapter ?? {
        sendEvent: async () => ({
          status: "not_configured" as const,
          responseSummary: null,
          errorMessage: "Meta CAPI token or pixel id not configured"
        })
      }) as never
    )
  };
}

describe("conversion events service", () => {
  it("records conversion logs for matched keyword and label rules without sending Meta events", async () => {
    const { db, service } = createHarness();

    const result = await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
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
          updatedAt: "2026-07-02T03:00:00.000Z"
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
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z"
        }
      ]
    });

    expect(result.created).toHaveLength(2);
    expect(db.logs[0]).toMatchObject({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      sourceTrigger: "keyword",
      eventName: "QualifiedLead",
      status: "ready_to_send",
      pixelId: "pixel_1",
      adId: "ad_1"
    });
    expect(db.logs[1]).toMatchObject({
      sourceTrigger: "whatsapp_label",
      eventName: "Purchase",
      status: "pending_meta_context"
    });
  });

  it("sends ready conversion logs to Meta CAPI and stores provider response", async () => {
    const adapter = {
      sendEvent: async () => ({
        status: "sent" as const,
        responseSummary: {
          events_received: 1
        },
        errorMessage: null
      })
    };
    const { db, service } = createHarness(adapter);
    await service.recordRuleMatches({
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
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
          updatedAt: "2026-07-02T03:00:00.000Z"
        }
      ]
    });

    const result = await service.sendReadyEvent("conversion_1");

    expect(result).toEqual({
      conversionEventLogId: "conversion_1",
      workspaceId: "workspace_1",
      status: "sent"
    });
    expect(db.logs[0]).toMatchObject({
      status: "sent",
      providerResponseSummary: {
        events_received: 1
      },
      errorMessage: null
    });
    expect(db.logs[0].sentAt).toBeInstanceOf(Date);
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        operation: "meta.capi.send_event",
        status: "success",
        providerRequestId: "conversion_1",
        leadId: "lead_1",
        adId: "ad_1",
        jobId: "conversion_1"
      })
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain("secret");
  });

  it("records diagnostics when Meta CAPI send is blocked by missing configuration", async () => {
    const { db, service } = createHarness();
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
          updatedAt: "2026-07-02T03:00:00.000Z"
        }
      ]
    });

    const result = await service.sendReadyEvent("conversion_1");

    expect(result).toEqual({
      conversionEventLogId: "conversion_1",
      workspaceId: "workspace_1",
      status: "not_configured"
    });
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        id: "integration_1",
        workspaceId: "workspace_1",
        source: "meta",
        operation: "meta.capi.send_event",
        status: "blocked",
        providerErrorMessage: "Meta CAPI token or pixel id not configured",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1"
      })
    );
    expect(db.diagnosticEvents).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        eventType: "meta.capi.send_event",
        severity: "warning",
        status: "blocked",
        integrationLogId: "integration_1",
        conversionEventLogId: "conversion_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        errorCode: "MetaCapiNotConfigured"
      })
    );
    expect(JSON.stringify(db.diagnosticEvents)).not.toContain("secret");
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
          updatedAt: "2026-07-02T03:00:00.000Z"
        }
      ]
    };

    const first = await service.recordRuleMatches(input);
    const second = await service.recordRuleMatches(input);

    expect(first.created).toEqual(["conversion_1"]);
    expect(second.created).toEqual([]);
    expect(second.duplicates).toEqual(["conversion_1"]);
    expect(db.logs).toHaveLength(1);
  });
});
