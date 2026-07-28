import { describe, expect, it, vi } from "vitest";
import { WhatsappSeatService } from "../src/billing/whatsapp-seat.service";

const seatRecord = {
  id: "seat_1",
  workspaceId: "workspace_1",
  subscriptionId: "contract_1",
  provider: "uazapi",
  normalizedPhone: null,
  whatsappInstanceId: "instance_1",
  inboundWebhookChannelId: null,
  status: "reserved",
  reservationExpiresAt: new Date("2026-07-26T15:00:00.000Z"),
  activatedAt: null,
  suspendedAt: null,
  releasedAt: null,
  releaseReason: null,
  createdAt: new Date("2026-07-26T14:00:00.000Z"),
  updatedAt: new Date("2026-07-26T14:00:00.000Z")
};

function createReserveHarness(occupiedSeats = 0) {
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    whatsappSeat: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(occupiedSeats),
      create: vi.fn().mockResolvedValue(seatRecord),
      update: vi.fn()
    },
    workspaceSubscription: {
      findFirst: vi.fn().mockResolvedValue({
        id: "contract_1",
        workspaceId: "workspace_1",
        contractStatus: "active",
        accessEndsAt: null,
        includedWhatsappNumbersSnapshot: 1
      })
    },
    billingContractAudit: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" })
    }
  };
  const prisma = {
    whatsappSeat: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    $transaction: vi
      .fn()
      .mockImplementation(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction)
      )
  };
  const configuration = {
    reservationTtlMinutes: () => 10
  };
  const service = new WhatsappSeatService(
    prisma as never,
    configuration as never
  );

  return { prisma, service, transaction };
}

describe("WhatsappSeatService", () => {
  it("serializes capacity checks and audits a new reservation", async () => {
    const { service, transaction } = createReserveHarness();

    const result = await service.reserveSeat(
      "workspace_1",
      {
        provider: "uazapi",
        whatsappInstanceId: "instance_1",
        inboundWebhookChannelId: null,
        normalizedPhone: null
      },
      "user_1"
    );

    expect(result.status).toBe("reserved");
    expect(transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(transaction.billingContractAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        subscriptionId: "contract_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "seat.reserved"
      })
    });
  });

  it("rejects a reservation at the exact capacity boundary", async () => {
    const { service, transaction } = createReserveHarness(1);

    await expect(
      service.reserveSeat("workspace_1", {
        provider: "uazapi",
        whatsappInstanceId: "instance_2",
        inboundWebhookChannelId: null,
        normalizedPhone: null
      })
    ).rejects.toMatchObject({
      message: "Todas as vagas do pacote estao ocupadas"
    });

    expect(transaction.whatsappSeat.create).not.toHaveBeenCalled();
  });

  it("never releases a seat through a different workspace scope", async () => {
    const { prisma, service } = createReserveHarness();
    prisma.whatsappSeat.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.releaseSeat(
        "workspace_other",
        "seat_1",
        "manual_release",
        "user_2"
      )
    ).rejects.toMatchObject({
      message: "Vaga de WhatsApp nao encontrada"
    });

    expect(prisma.whatsappSeat.findFirst).toHaveBeenCalledWith({
      where: { id: "seat_1", workspaceId: "workspace_other" }
    });
  });

  it("expires reservations with a durable contract audit", async () => {
    const { prisma, service, transaction } = createReserveHarness();
    const now = new Date("2026-07-26T16:00:00.000Z");
    prisma.whatsappSeat.findMany = vi
      .fn()
      .mockResolvedValue([{ workspaceId: "workspace_1" }]);
    transaction.whatsappSeat.findMany.mockResolvedValueOnce([seatRecord]);
    transaction.whatsappSeat.update.mockResolvedValueOnce({
      ...seatRecord,
      status: "released",
      reservationExpiresAt: null,
      releasedAt: now,
      releaseReason: "reservation_expired"
    });

    const result = await service.expireAllReservations(now);

    expect(result).toBe(1);
    expect(transaction.billingContractAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        subscriptionId: "contract_1",
        actorType: "system",
        action: "seat.reservation_expired",
        reason: "reservation_expired"
      })
    });
  });

  it("does not reactivate an external channel seat under a suspended contract", async () => {
    const { service, transaction } = createReserveHarness();
    transaction.workspaceSubscription.findFirst.mockResolvedValueOnce({
      id: "contract_1",
      workspaceId: "workspace_1",
      contractStatus: "suspended",
      accessEndsAt: new Date("2026-07-28T19:29:53.233Z"),
      includedWhatsappNumbersSnapshot: 1
    });
    transaction.whatsappSeat.findFirst.mockResolvedValueOnce({
      ...seatRecord,
      provider: "umbler",
      whatsappInstanceId: null,
      inboundWebhookChannelId: "channel_1",
      status: "suspended"
    });

    await expect(
      service.activateExternalChannelSeat(transaction as never, {
        workspaceId: "workspace_1",
        channelId: "channel_1",
        provider: "umbler",
        normalizedPhone: "+5511999999999",
        actorUserId: "user_1"
      })
    ).rejects.toMatchObject({
      message: "Workspace sem contrato com acesso ativo"
    });

    expect(transaction.whatsappSeat.update).not.toHaveBeenCalled();
    expect(transaction.billingContractAudit.create).not.toHaveBeenCalled();
  });

  it("does not overbook capacity when a released external seat is activated again", async () => {
    const { service, transaction } = createReserveHarness(1);
    transaction.whatsappSeat.findFirst.mockResolvedValueOnce({
      ...seatRecord,
      provider: "umbler",
      whatsappInstanceId: null,
      inboundWebhookChannelId: "channel_1",
      status: "released",
      reservationExpiresAt: null,
      releasedAt: new Date("2026-07-28T18:00:00.000Z")
    });

    await expect(
      service.activateExternalChannelSeat(transaction as never, {
        workspaceId: "workspace_1",
        channelId: "channel_1",
        provider: "umbler",
        normalizedPhone: "+5511999999999",
        actorUserId: "user_1"
      })
    ).rejects.toMatchObject({
      message: "Todas as vagas do pacote estao ocupadas"
    });

    expect(transaction.whatsappSeat.update).not.toHaveBeenCalled();
  });
});
