import { describe, expect, it } from "vitest";
import { DiagnosticsService } from "../src/diagnostics/diagnostics.service";

function createHarness() {
  const events: Array<Record<string, unknown>> = [];
  const prisma = {
    diagnosticEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const event = {
          id: `diag_${events.length + 1}`,
          occurredAt: data.occurredAt ?? new Date("2026-07-02T03:00:00.000Z"),
          createdAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        events.push(event);
        return event;
      },
      findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        events
          .filter((event) =>
            Object.entries(where).every(([key, value]) => event[key] === value)
          )
          .slice(0, take),
      findUnique: async ({ where }: { where: { id: string } }) =>
        events.find((event) => event.id === where.id) ?? null
    }
  };

  return {
    events,
    service: new DiagnosticsService(prisma as never)
  };
}

describe("diagnostics service", () => {
  it("records diagnostic events with sensitive payload fields redacted", async () => {
    const { events, service } = createHarness();

    const event = await service.recordEvent({
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      severity: "error",
      status: "error",
      title: "Meta recusou evento",
      message: "Parametro currency ausente",
      errorCode: "MISSING_CURRENCY",
      summaryPayload: {
        authorization: "Bearer secret",
        nested: {
          refreshToken: "secret-refresh",
          currency: null
        }
      }
    });

    expect(event.errorCode).toBe("MISSING_CURRENCY");
    expect(events[0]?.summaryPayload).toEqual({
      authorization: "[redacted]",
      nested: {
        refreshToken: "[redacted]",
        currency: null
      }
    });
  });

  it("lists events using normalized filters", async () => {
    const { service } = createHarness();
    await service.recordEvent({
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      severity: "error",
      status: "error",
      title: "Erro Meta",
      message: "Falha"
    });
    await service.recordEvent({
      workspaceId: "workspace_2",
      source: "asaas",
      eventType: "payment",
      severity: "info",
      status: "success",
      title: "Pagamento aprovado",
      message: "OK"
    });

    const events = await service.listEvents({
      workspaceId: "workspace_1",
      source: "meta",
      limit: 10
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe("meta");
  });
});
