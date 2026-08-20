import { describe, expect, it, vi } from "vitest";
import { workspaceOpsAlertSettingsInputSchema } from "@wpptrack/shared";
import { OpsAlertService } from "../src/ops-alerts/ops-alerts.service";

const now = new Date("2026-08-20T12:00:00.000Z");

function makePrisma(input: { recentSent?: boolean; instances?: Array<Record<string, unknown>>; connections?: Array<Record<string, unknown>> } = {}) {
  return {
    workspaceOpsAlertSettings: {
      findMany: vi.fn(async () => [{ workspaceId: "ws_1", alertPhoneE164: "5511999999999", disconnectAlerts: true, webhookSilenceAlerts: true, silenceThresholdHours: 24, debounceHours: 6, workspace: { name: "Acme" } }]),
      upsert: vi.fn(async ({ create }) => create),
    },
    whatsappInstance: { findMany: vi.fn(async () => input.instances ?? []) },
    inboundWebhookConnection: { findMany: vi.fn(async () => input.connections ?? []) },
    workspaceOpsAlertDelivery: {
      findFirst: vi.fn(async () => input.recentSent ? { id: "sent_1" } : null),
      create: vi.fn(async () => ({ id: "delivery_1" })),
    },
  };
}

describe("workspace ops alerts", () => {
  it("requires a phone when settings are enabled and normalizes it", () => {
    expect(workspaceOpsAlertSettingsInputSchema.safeParse({ enabled: true, alertPhone: "" }).success).toBe(false);
    expect(workspaceOpsAlertSettingsInputSchema.parse({ enabled: true, alertPhone: "+55 (11) 99999-9999" }).alertPhone).toBe("5511999999999");
  });

  it("notifies a disconnected UAZAPI instance once", async () => {
    const prisma = makePrisma({ instances: [{ id: "instance_1", name: "Vendas" }] });
    const connections = { getStatus: vi.fn(async () => ({ connectionStatus: "disconnected" })) };
    const notifier = { sendText: vi.fn(async () => true) };
    const service = new OpsAlertService(prisma as never, connections as never, notifier as never);

    await expect(service.runScan(now)).resolves.toEqual({ checked: 1, notified: 1, skipped: 0 });
    expect(notifier.sendText).toHaveBeenCalledWith("5511999999999", expect.stringContaining('instancia "Vendas"'));
    expect(prisma.workspaceOpsAlertDelivery.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ alertKey: "disconnect:instance_1", status: "sent" }) }));
  });

  it("debounces a second identical alert within the configured window", async () => {
    const prisma = makePrisma({ recentSent: true, instances: [{ id: "instance_1", name: "Vendas" }] });
    const notifier = { sendText: vi.fn(async () => true) };
    const service = new OpsAlertService(prisma as never, { getStatus: vi.fn(async () => ({ connectionStatus: "disconnected" })) } as never, notifier as never);

    await expect(service.runScan(now)).resolves.toEqual({ checked: 1, notified: 0, skipped: 1 });
    expect(notifier.sendText).not.toHaveBeenCalled();
    expect(prisma.workspaceOpsAlertDelivery.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "skipped", detail: "debounced" }) }));
  });

  it("alerts when a production webhook has been silent longer than its threshold", async () => {
    const prisma = makePrisma({ connections: [{ id: "connection_1", displayName: "Umbler", status: "production", createdAt: new Date("2026-08-01T00:00:00.000Z"), lastDeliveryAt: new Date("2026-08-18T10:00:00.000Z") }] });
    const notifier = { sendText: vi.fn(async () => true) };
    const service = new OpsAlertService(prisma as never, { getStatus: vi.fn() } as never, notifier as never);

    await expect(service.runScan(now)).resolves.toEqual({ checked: 1, notified: 1, skipped: 0 });
    expect(notifier.sendText).toHaveBeenCalledWith("5511999999999", expect.stringContaining("Sem webhook ha 50h"));
  });

  it("records notifier failures without throwing from the scan", async () => {
    const prisma = makePrisma({ instances: [{ id: "instance_1", name: "Vendas" }] });
    const service = new OpsAlertService(prisma as never, { getStatus: vi.fn(async () => ({ connectionStatus: "disconnected" })) } as never, { sendText: vi.fn(async () => false) } as never);

    await expect(service.runScan(now)).resolves.toEqual({ checked: 1, notified: 0, skipped: 1 });
    expect(prisma.workspaceOpsAlertDelivery.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed", detail: "notify_failed" }) }));
  });
});
