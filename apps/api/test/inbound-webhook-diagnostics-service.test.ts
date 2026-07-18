import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import { InboundWebhookDiagnosticsService } from "../src/inbound-webhooks/inbound-webhook-diagnostics.service";

function createHarness() {
  const webhookLogs = new Map<string, Record<string, unknown>>();
  const diagnosticEvents: Array<Record<string, unknown>> = [];
  const transaction = {
    webhookLog: {
      findUnique: vi.fn(
        async ({ where }: { where: { idempotencyKey: string } }) =>
          webhookLogs.get(where.idempotencyKey) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record = {
          id: `webhook_${webhookLogs.size + 1}`,
          ...data,
        };
        webhookLogs.set(String(data.idempotencyKey), record);
        return { id: record.id };
      }),
    },
    diagnosticEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        diagnosticEvents.push(data);
        return { id: `diagnostic_${diagnosticEvents.length}` };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
    diagnosticEvent: transaction.diagnosticEvent,
  };

  return {
    diagnosticEvents,
    prisma,
    service: new InboundWebhookDiagnosticsService(
      prisma as unknown as PrismaService,
    ),
    transaction,
    webhookLogs,
  };
}

describe("InboundWebhookDiagnosticsService", () => {
  it("persists one redacted observation diagnostic per delivery", async () => {
    const harness = createHarness();
    const input = {
      workspaceId: "workspace_1",
      deliveryId: "delivery_1",
      connectionId: "connection_1",
      eventType: "Message",
      parserVersion: "v1",
      classification: "eligible_route_unresolved" as const,
      routeStatus: "unresolved" as const,
      processingStatus: "processed" as const,
      eventCount: 1,
      errorCode: null,
      events: [
        {
          channelId: "channel_1",
          connectedPhoneSuffix: "4321",
          adId: "ad_1",
          hasCtwa: true,
          classification: "eligible_route_unresolved" as const,
          routeStatus: "unresolved" as const,
        },
      ],
    };

    await harness.service.recordObservation(input);
    await harness.service.recordObservation(input);

    expect(harness.transaction.webhookLog.create).toHaveBeenCalledOnce();
    expect(harness.transaction.diagnosticEvent.create).toHaveBeenCalledOnce();
    expect(harness.webhookLogs.size).toBe(1);
    expect(harness.diagnosticEvents).toHaveLength(1);

    const serialized = JSON.stringify({
      webhook: [...harness.webhookLogs.values()][0],
      diagnostic: harness.diagnosticEvents[0],
    });
    expect(serialized).toContain("channel_1");
    expect(serialized).toContain("4321");
    expect(serialized).not.toContain("raw_message_private_marker");
    expect(serialized).not.toContain("5511999994321");
    expect(serialized).not.toContain("ctwa-private-value");
  });

  it("stores only allowlisted maintenance identifiers", async () => {
    const harness = createHarness();

    await harness.service.recordMaintenance({
      workspaceId: "workspace_1",
      deliveryId: "delivery_1",
      connectionId: "connection_1",
      errorCode: "inbound_webhook_payload_unavailable",
      operation: "payload_retention",
      severity: "warning",
      status: "requires_review",
      title: "Inbound webhook requer revisao",
      message: "Uma entrega aceita nao pode ser processada automaticamente.",
    });

    expect(harness.diagnosticEvents).toHaveLength(1);
    expect(harness.diagnosticEvents[0]).toMatchObject({
      workspaceId: "workspace_1",
      source: "umbler",
      eventType: "inbound_webhook_maintenance",
      errorCode: "inbound_webhook_payload_unavailable",
      summaryPayload: {
        deliveryId: "delivery_1",
        connectionId: "connection_1",
        operation: "payload_retention",
        errorCode: "inbound_webhook_payload_unavailable",
      },
    });
  });
});
