import { describe, expect, it } from "vitest";
import { DiagnosticsService } from "../src/diagnostics/diagnostics.service";

function createHarness() {
  const db = {
    webhooks: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>
  };
  const prisma = {
    webhookLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const webhook = {
          id: `webhook_${db.webhooks.length + 1}`,
          receivedAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        db.webhooks.push(webhook);
        return webhook;
      }
    },
    diagnosticEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const event = {
          id: `diag_${db.events.length + 1}`,
          occurredAt: data.occurredAt ?? new Date("2026-07-02T03:00:00.000Z"),
          createdAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        db.events.push(event);
        return event;
      },
      findMany: async () => [],
      findUnique: async () => null
    }
  };

  return {
    db,
    service: new DiagnosticsService(prisma as never)
  };
}

describe("webhook diagnostic recording", () => {
  it("records sanitized webhook logs and linked diagnostic events", async () => {
    const { db, service } = createHarness();

    const result = await service.recordWebhookLog({
      workspaceId: "workspace_1",
      source: "uazapi",
      eventType: "message.received",
      externalEventId: "evt_1",
      idempotencyKey: "uazapi:evt_1",
      summaryPayload: {
        token: "secret-token",
        message: {
          text: "LeadSubmitted"
        }
      }
    });

    expect(result.webhookLogId).toBe("webhook_1");
    expect(db.webhooks[0]?.summaryPayload).toEqual({
      token: "[redacted]",
      message: {
        text: "LeadSubmitted"
      }
    });
    expect(db.events[0]).toMatchObject({
      webhookLogId: "webhook_1",
      source: "uazapi",
      eventType: "message.received",
      status: "received"
    });
  });
});
