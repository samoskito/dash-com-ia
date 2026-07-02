import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WhatsappConnectionsService } from "../src/integrations/whatsapp-connections.service";

function createHarness() {
  const db = {
    instances: [
      {
        id: "wpp_pending",
        workspaceId: "workspace_1",
        name: "Comercial",
        provider: "uazapi",
        status: "pending_payment",
        providerInstanceId: null,
        createdAt: new Date("2026-07-02T03:00:00.000Z"),
        activations: [
          {
            paymentCharge: {
              checkoutUrl: "https://sandbox.asaas.com/i/pay_1"
            }
          }
        ]
      },
      {
        id: "wpp_active",
        workspaceId: "workspace_1",
        name: "Vendas",
        provider: "uazapi",
        status: "active",
        providerInstanceId: "provider_instance_1",
        createdAt: new Date("2026-07-02T03:01:00.000Z"),
        activations: []
      }
    ] as Array<Record<string, unknown>>
  };
  const prisma = {
    whatsappInstance: {
      findFirst: async ({
        where
      }: {
        where: { id: string; workspaceId: string };
      }) =>
        db.instances.find(
          (instance) =>
            instance.id === where.id && instance.workspaceId === where.workspaceId
        ) ?? null,
      findMany: async ({ where }: { where: { workspaceId: string } }) =>
        db.instances.filter((instance) => instance.workspaceId === where.workspaceId),
      update: async ({
        data,
        where
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const index = db.instances.findIndex(
          (instance) => instance.id === where.id
        );
        db.instances[index] = {
          ...db.instances[index],
          ...data
        };
        return db.instances[index];
      }
    }
  };
  const uazapiAdapter = {
    connectInstance: vi.fn(async () => ({
      providerInstanceId: "provider_instance_1",
      connectionStatus: "qr_required",
      qrCode: "qr-code-text",
      message: "Escaneie o QR Code"
    })),
    getInstanceStatus: vi.fn(async () => ({
      providerInstanceId: "provider_instance_1",
      connectionStatus: "connected",
      qrCode: null,
      message: "WhatsApp conectado"
    })),
    getQr: vi.fn(async () => ({
      providerInstanceId: "provider_instance_1",
      connectionStatus: "qr_required",
      qrCode: "qr-code-text",
      message: "Escaneie o QR Code"
    }))
  };

  return {
    db,
    service: new WhatsappConnectionsService(prisma as never, uazapiAdapter as never),
    uazapiAdapter
  };
}

describe("whatsapp connections service", () => {
  it("lists whatsapp instances for the current workspace", async () => {
    const { service } = createHarness();

    const instances = await service.listInstances("workspace_1");

    expect(instances).toEqual([
      {
        id: "wpp_pending",
        name: "Comercial",
        provider: "uazapi",
        billingStatus: "pending_payment",
        providerInstanceId: null,
        checkoutUrl: "https://sandbox.asaas.com/i/pay_1",
        createdAt: expect.any(String)
      },
      {
        id: "wpp_active",
        name: "Vendas",
        provider: "uazapi",
        billingStatus: "active",
        providerInstanceId: "provider_instance_1",
        checkoutUrl: null,
        createdAt: expect.any(String)
      }
    ]);
  });

  it("refuses to connect a whatsapp instance before payment activation", async () => {
    const { service, uazapiAdapter } = createHarness();

    await expect(
      service.connectInstance("workspace_1", "wpp_pending")
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(uazapiAdapter.connectInstance).not.toHaveBeenCalled();
  });

  it("returns sanitized status for active whatsapp instances", async () => {
    const { service, uazapiAdapter } = createHarness();

    const status = await service.getStatus("workspace_1", "wpp_active");

    expect(uazapiAdapter.getInstanceStatus).toHaveBeenCalledWith(
      "provider_instance_1"
    );
    expect(status).toMatchObject({
      whatsappInstanceId: "wpp_active",
      provider: "uazapi",
      billingStatus: "active",
      connectionStatus: "connected",
      qrCode: null
    });
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("connects active whatsapp instances and persists provider instance id", async () => {
    const { db, service } = createHarness();
    db.instances[1].providerInstanceId = null;

    const result = await service.connectInstance("workspace_1", "wpp_active");

    expect(result.connectionStatus).toBe("qr_required");
    expect(result.qrCode).toBe("qr-code-text");
    expect(db.instances[1].providerInstanceId).toBe("provider_instance_1");
  });

  it("does not expose instances from another workspace", async () => {
    const { service } = createHarness();

    await expect(
      service.getStatus("workspace_2", "wpp_active")
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
