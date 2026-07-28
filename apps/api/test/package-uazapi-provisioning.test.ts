import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackageUazapiProvisioningService } from "../src/billing/package-uazapi-provisioning.service";

const reservedSeatDto = {
  id: "seat_1",
  workspaceId: "workspace_1",
  subscriptionId: "contract_1",
  provider: "uazapi",
  status: "reserved",
  normalizedPhone: null,
  whatsappInstanceId: "instance_1",
  inboundWebhookChannelId: null,
  reservationExpiresAt: "2099-07-26T15:00:00.000Z",
  activatedAt: null,
  suspendedAt: null,
  releasedAt: null,
} as const;

const activeSeatDto = {
  ...reservedSeatDto,
  status: "active",
  reservationExpiresAt: null,
  activatedAt: "2026-07-26T14:00:00.000Z",
} as const;

const reservedSeatRecord = {
  ...reservedSeatDto,
  reservationExpiresAt: new Date("2099-07-26T15:00:00.000Z"),
  activatedAt: null,
  suspendedAt: null,
  releasedAt: null,
  createdAt: new Date("2026-07-26T14:00:00.000Z"),
  updatedAt: new Date("2026-07-26T14:00:00.000Z"),
  releaseReason: null,
};

function createHarness() {
  const prisma = {
    whatsappInstance: {
      create: vi.fn().mockResolvedValue({ id: "instance_1" }),
      delete: vi.fn().mockResolvedValue({ id: "instance_1" }),
      update: vi.fn().mockResolvedValue({ id: "instance_1" }),
      findFirst: vi.fn().mockResolvedValue({
        id: "instance_1",
        name: "Vendas",
        workspaceId: "workspace_1",
        provider: "uazapi",
        status: "active",
        providerInstanceId: "provider_1",
        providerTokenEncrypted: "encrypted",
        providerTokenIv: "iv",
        providerTokenTag: "tag",
        webhookTokenHash: "webhook_hash",
        updatedAt: new Date("2026-07-26T14:00:00.000Z"),
      }),
    },
    whatsappSeat: {
      findFirst: vi.fn().mockResolvedValue(reservedSeatRecord),
      update: vi.fn().mockResolvedValue({
        ...reservedSeatRecord,
        status: "released",
        releasedAt: new Date("2026-07-27T12:00:00.000Z"),
        releaseReason: "uazapi_instance_removed_by_user",
      }),
    },
    billingContractAudit: {
      create: vi.fn().mockResolvedValue({ id: "contract_audit_1" }),
    },
    integrationLog: {
      create: vi.fn().mockResolvedValue({ id: "integration_log_1" }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit_log_1" }),
    },
    $transaction: vi
      .fn()
      .mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
  };
  const configuration = {
    isPackageBillingEnabled: () => true,
    isUazapiProvisioningEnabled: () => true,
  };
  const contracts = {
    getCurrentAccessContract: vi.fn().mockResolvedValue({ id: "contract_1" }),
  };
  const seats = {
    reserveSeat: vi.fn().mockResolvedValue(reservedSeatDto),
    activateSeat: vi.fn().mockResolvedValue(activeSeatDto),
    releaseSeat: vi.fn().mockResolvedValue({
      ...reservedSeatDto,
      status: "released",
    }),
    mapSeat: vi.fn().mockReturnValue(reservedSeatDto),
  };
  const uazapi = {
    createInstance: vi.fn().mockResolvedValue({
      status: "created",
      providerInstanceId: "provider_1",
      instanceToken: "secret",
      message: null,
    }),
    configureInstanceWebhook: vi.fn().mockResolvedValue({
      status: "configured",
      message: null,
    }),
    connectInstance: vi.fn().mockResolvedValue({
      providerInstanceId: "provider_1",
      connectionStatus: "qr_required",
      qrCode: "qr-code",
      connectedPhone: null,
      message: "Leia o QR code",
    }),
    getInstanceStatus: vi.fn().mockResolvedValue({
      providerInstanceId: "provider_1",
      connectionStatus: "connected",
      qrCode: null,
      connectedPhone: "5549998347468",
      message: "Conectado",
    }),
    deleteInstance: vi.fn().mockResolvedValue({
      status: "deleted",
      alreadyMissing: false,
      message: "Instance Deleted",
    }),
  };
  const tokenEncryption = {
    encrypt: vi.fn().mockReturnValue({
      encryptedAccessToken: "encrypted",
      tokenIv: "iv",
      tokenTag: "tag",
    }),
    decrypt: vi.fn().mockReturnValue("secret"),
  };
  const service = new PackageUazapiProvisioningService(
    prisma as never,
    configuration as never,
    contracts as never,
    seats as never,
    uazapi as never,
    tokenEncryption as never,
  );

  return {
    configuration,
    contracts,
    prisma,
    seats,
    service,
    tokenEncryption,
    uazapi,
  };
}

describe("PackageUazapiProvisioningService", () => {
  beforeEach(() => {
    vi.stubEnv("API_PUBLIC_URL", "https://api.example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes the local placeholder when capacity reservation fails", async () => {
    const harness = createHarness();
    harness.seats.reserveSeat.mockRejectedValueOnce(
      new Error("capacity_exceeded"),
    );

    await expect(
      harness.service.provision("workspace_1", "Vendas", "user_1"),
    ).rejects.toThrow("capacity_exceeded");

    expect(harness.prisma.whatsappInstance.delete).toHaveBeenCalledWith({
      where: { id: "instance_1" },
    });
    expect(harness.uazapi.createInstance).not.toHaveBeenCalled();
  });

  it("keeps the seat reserved while the provider is waiting for the QR code", async () => {
    const harness = createHarness();

    const result = await harness.service.provision(
      "workspace_1",
      "Vendas",
      "user_1",
    );

    expect(result.seat.status).toBe("reserved");
    expect(result.connection.connectionStatus).toBe("qr_required");
    expect(result.connection.qrCode).toBe("qr-code");
    expect(harness.seats.activateSeat).not.toHaveBeenCalled();
  });

  it("activates the reserved seat when the provider connects immediately", async () => {
    const harness = createHarness();
    harness.uazapi.connectInstance.mockResolvedValueOnce({
      providerInstanceId: "provider_1",
      connectionStatus: "connected",
      qrCode: null,
      connectedPhone: "5549998347468",
      message: "Conectado",
    });

    const result = await harness.service.provision(
      "workspace_1",
      "Vendas",
      "user_1",
    );

    expect(result.seat.status).toBe("active");
    expect(harness.seats.activateSeat).toHaveBeenCalledWith(
      "workspace_1",
      "seat_1",
      "5549998347468",
      "user_1",
    );
  });

  it("releases the reservation when provider connection setup fails", async () => {
    const harness = createHarness();
    harness.uazapi.connectInstance.mockResolvedValueOnce({
      providerInstanceId: "provider_1",
      connectionStatus: "error",
      qrCode: null,
      connectedPhone: null,
      message: "Falha no provedor",
    });

    await expect(
      harness.service.provision("workspace_1", "Vendas", "user_1"),
    ).rejects.toThrow("Nao foi possivel preparar a conexao Uazapi");

    expect(harness.seats.releaseSeat).toHaveBeenCalledWith(
      "workspace_1",
      "seat_1",
      "uazapi_provisioning_failed",
      "user_1",
    );
    expect(harness.prisma.whatsappInstance.update).toHaveBeenLastCalledWith({
      where: { id: "instance_1" },
      data: { status: "error" },
    });
  });

  it("promotes a reserved seat only after status polling confirms connected", async () => {
    const harness = createHarness();

    const result = await harness.service.getProvisioningStatus(
      "workspace_1",
      "instance_1",
      "user_1",
    );

    expect(result.connection.connectionStatus).toBe("connected");
    expect(result.seat.status).toBe("active");
    expect(harness.seats.activateSeat).toHaveBeenCalledWith(
      "workspace_1",
      "seat_1",
      "5549998347468",
      "user_1",
    );
  });

  it("refreshes an active seat so a missing provider phone can be recovered", async () => {
    const harness = createHarness();
    harness.prisma.whatsappSeat.findFirst.mockResolvedValueOnce({
      ...reservedSeatRecord,
      status: "active",
      reservationExpiresAt: null,
      activatedAt: new Date("2026-07-26T14:00:00.000Z"),
    });
    harness.seats.mapSeat.mockReturnValueOnce(activeSeatDto);

    const result = await harness.service.getProvisioningStatus(
      "workspace_1",
      "instance_1",
      "user_1",
    );

    expect(result.seat.status).toBe("active");
    expect(harness.seats.activateSeat).toHaveBeenCalledWith(
      "workspace_1",
      "seat_1",
      "5549998347468",
      "user_1",
    );
  });

  it("renews the QR code on the existing instance and seat", async () => {
    const harness = createHarness();
    harness.uazapi.getInstanceStatus.mockResolvedValueOnce({
      providerInstanceId: "provider_1",
      connectionStatus: "qr_required",
      qrCode: "expired-qr",
      connectedPhone: null,
      message: "QR expirado",
    });
    harness.uazapi.connectInstance.mockResolvedValueOnce({
      providerInstanceId: "provider_1",
      connectionStatus: "qr_required",
      qrCode: "fresh-qr",
      connectedPhone: null,
      message: "Leia o novo QR code",
    });

    const result = await harness.service.refreshProvisioningQr(
      "workspace_1",
      "instance_1",
      "user_1",
    );

    expect(result.connection.qrCode).toBe("fresh-qr");
    expect(result.seat.id).toBe("seat_1");
    expect(harness.uazapi.createInstance).not.toHaveBeenCalled();
    expect(harness.seats.reserveSeat).not.toHaveBeenCalled();
    expect(harness.uazapi.connectInstance).toHaveBeenCalledWith(
      "provider_1",
      "secret",
    );
  });

  it("does not reconnect when QR renewal finds an already connected instance", async () => {
    const harness = createHarness();

    const result = await harness.service.refreshProvisioningQr(
      "workspace_1",
      "instance_1",
      "user_1",
    );

    expect(result.connection.connectionStatus).toBe("connected");
    expect(result.seat.status).toBe("active");
    expect(harness.uazapi.connectInstance).not.toHaveBeenCalled();
    expect(harness.seats.activateSeat).toHaveBeenCalledWith(
      "workspace_1",
      "seat_1",
      "5549998347468",
      "user_1",
    );
  });

  it("releases an expired reservation and reserves the same instance again", async () => {
    const harness = createHarness();
    harness.prisma.whatsappSeat.findFirst.mockResolvedValueOnce({
      ...reservedSeatRecord,
      reservationExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    harness.uazapi.getInstanceStatus.mockResolvedValueOnce({
      providerInstanceId: "provider_1",
      connectionStatus: "qr_required",
      qrCode: null,
      connectedPhone: null,
      message: "QR expirado",
    });

    const result = await harness.service.refreshProvisioningQr(
      "workspace_1",
      "instance_1",
      "user_1",
    );

    expect(harness.seats.releaseSeat).toHaveBeenCalledWith(
      "workspace_1",
      "seat_1",
      "uazapi_qr_reservation_expired",
      "user_1",
    );
    expect(harness.seats.reserveSeat).toHaveBeenCalledWith(
      "workspace_1",
      {
        provider: "uazapi",
        whatsappInstanceId: "instance_1",
        inboundWebhookChannelId: null,
        normalizedPhone: null,
      },
      "user_1",
    );
    expect(result.connection.qrCode).toBe("qr-code");
  });

  it("requires the exact instance name before removing a number", async () => {
    const harness = createHarness();

    await expect(
      harness.service.removeInstance(
        "workspace_1",
        "instance_1",
        "Nome incorreto",
        "user_1",
      ),
    ).rejects.toThrow(
      "Digite o nome exato da instancia para confirmar a remocao",
    );

    expect(harness.uazapi.deleteInstance).not.toHaveBeenCalled();
    expect(harness.prisma.whatsappSeat.update).not.toHaveBeenCalled();
  });

  it("keeps the instance and seat active when Uazapi does not confirm removal", async () => {
    const harness = createHarness();
    harness.uazapi.deleteInstance.mockResolvedValueOnce({
      status: "error",
      alreadyMissing: false,
      message: "Uazapi HTTP 503",
    });

    await expect(
      harness.service.removeInstance(
        "workspace_1",
        "instance_1",
        "Vendas",
        "user_1",
      ),
    ).rejects.toThrow(
      "A Uazapi nao confirmou a remocao. O numero continua conectado e ocupando a vaga",
    );

    expect(harness.prisma.whatsappSeat.update).not.toHaveBeenCalled();
    expect(harness.prisma.whatsappInstance.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "disconnected" }),
      }),
    );
  });

  it("does not leave an occupied seat behind when the local instance is already disconnected", async () => {
    const harness = createHarness();
    harness.prisma.whatsappInstance.findFirst.mockResolvedValueOnce({
      id: "instance_1",
      name: "Vendas",
      workspaceId: "workspace_1",
      provider: "uazapi",
      status: "disconnected",
      providerInstanceId: "provider_1",
      providerTokenEncrypted: "encrypted",
      providerTokenIv: "iv",
      providerTokenTag: "tag",
      webhookTokenHash: "webhook_hash",
      updatedAt: new Date("2026-07-26T14:00:00.000Z"),
    });

    await harness.service.removeInstance(
      "workspace_1",
      "instance_1",
      "Vendas",
      "user_1",
    );

    expect(harness.uazapi.deleteInstance).toHaveBeenCalledWith("secret");
    expect(harness.prisma.whatsappSeat.update).toHaveBeenCalledWith({
      where: { id: "seat_1" },
      data: expect.objectContaining({ status: "released" }),
    });
  });

  it("deletes the provider instance, releases its seat and preserves local history", async () => {
    const harness = createHarness();

    const result = await harness.service.removeInstance(
      "workspace_1",
      "instance_1",
      "Vendas",
      "user_1",
    );

    expect(harness.uazapi.deleteInstance).toHaveBeenCalledWith("secret");
    expect(harness.prisma.whatsappSeat.update).toHaveBeenCalledWith({
      where: { id: "seat_1" },
      data: expect.objectContaining({
        status: "released",
        releaseReason: "uazapi_instance_removed_by_user",
        reservationExpiresAt: null,
      }),
    });
    expect(harness.prisma.whatsappInstance.update).toHaveBeenCalledWith({
      where: { id: "instance_1" },
      data: {
        status: "disconnected",
        providerTokenEncrypted: null,
        providerTokenIv: null,
        providerTokenTag: null,
        webhookTokenHash: null,
      },
    });
    expect(harness.prisma.billingContractAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        subscriptionId: "contract_1",
        action: "seat.released",
      }),
    });
    expect(result).toMatchObject({
      whatsappInstanceId: "instance_1",
      instanceName: "Vendas",
      releasedSeatId: "seat_1",
      providerAlreadyMissing: false,
    });
  });
});
