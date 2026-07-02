import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WhatsappConnectionsService } from "../src/integrations/whatsapp-connections.service";

function createHarness() {
  const db = {
    auditLogs: [] as Array<Record<string, unknown>>,
    integrationLogs: [] as Array<Record<string, unknown>>,
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
        providerTokenEncrypted: "encrypted-instance-token",
        providerTokenIv: "iv",
        providerTokenTag: "tag",
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
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `audit_${db.auditLogs.length + 1}`,
          ...data
        };
        db.auditLogs.push(log);
        return log;
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
    })),
    listLabels: vi.fn(async () => ({
      status: "success",
      message: null,
      labels: [
        {
          id: "label_uuid_1",
          name: "Venda fechada",
          colorHex: "#fed428",
          labelId: "10"
        }
      ]
    }))
  };

  const tokenEncryption = {
    decrypt: vi.fn(() => "instance-token-1")
  };

  return {
    db,
    service: new WhatsappConnectionsService(
      prisma as never,
      uazapiAdapter as never,
      tokenEncryption as never
    ),
    tokenEncryption,
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
    const { db, service, uazapiAdapter } = createHarness();

    const status = await service.getStatus("workspace_1", "wpp_active");

    expect(uazapiAdapter.getInstanceStatus).toHaveBeenCalledWith(
      "provider_instance_1",
      "instance-token-1"
    );
    expect(status).toMatchObject({
      whatsappInstanceId: "wpp_active",
      provider: "uazapi",
      billingStatus: "active",
      connectionStatus: "connected",
      qrCode: null
    });
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        operation: "uazapi.instance.status",
        status: "success",
        providerRequestId: "provider_instance_1",
        providerErrorMessage: null,
        jobId: "wpp_active"
      })
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain("qr-code-text");
    expect(JSON.stringify(db.integrationLogs)).not.toContain("secret");
  });

  it("connects active whatsapp instances and persists provider instance id", async () => {
    const { db, service } = createHarness();
    db.instances[1].providerInstanceId = null;

    const result = await service.connectInstance("workspace_1", "wpp_active");

    expect(result.connectionStatus).toBe("qr_required");
    expect(result.qrCode).toBe("qr-code-text");
    expect(db.instances[1].providerInstanceId).toBe("provider_instance_1");
  });

  it("audits whatsapp connect requests without exposing provider id or QR", async () => {
    const { db, service } = createHarness();
    db.instances[1].providerInstanceId = null;

    await service.connectInstance("workspace_1", "wpp_active", "user_1");

    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "whatsapp_instance.connect_requested",
        targetType: "WhatsappInstance",
        targetId: "wpp_active",
        resultStatus: "qr_required",
        beforeSummary: expect.objectContaining({
          provider: "uazapi",
          providerInstanceConfigured: false,
          providerInstanceIdHash: null
        }),
        afterSummary: expect.objectContaining({
          provider: "uazapi",
          providerInstanceConfigured: true,
          providerInstanceIdHash: expect.any(String),
          connectionStatus: "qr_required",
          hasQrCode: true
        })
      })
    );
    expect(JSON.stringify(db.auditLogs)).not.toContain("provider_instance_1");
    expect(JSON.stringify(db.auditLogs)).not.toContain("qr-code-text");
  });

  it("does not expose instances from another workspace", async () => {
    const { service } = createHarness();

    await expect(
      service.getStatus("workspace_2", "wpp_active")
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lists WhatsApp labels for active instances with operational logging", async () => {
    const { db, service, uazapiAdapter } = createHarness();

    const labels = await service.listLabels("workspace_1", "wpp_active");

    expect(uazapiAdapter.listLabels).toHaveBeenCalledWith(
      "provider_instance_1",
      "instance-token-1"
    );
    expect(labels).toEqual([
      {
        id: "label_uuid_1",
        name: "Venda fechada",
        colorHex: "#fed428",
        labelId: "10"
      }
    ]);
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        operation: "uazapi.labels.list",
        status: "success",
        providerRequestId: "provider_instance_1",
        jobId: "wpp_active"
      })
    );
  });
});
