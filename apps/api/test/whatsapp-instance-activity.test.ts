import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WhatsappConnectionsService } from "../src/integrations/whatsapp-connections.service";

const now = new Date("2026-07-10T12:00:00.000Z");

function instance(provider: "uazapi" | "cloud_api" = "uazapi") {
  return {
    id: "instance_1",
    workspaceId: "workspace_1",
    name: "Vendas",
    provider,
    status: "active",
    providerInstanceId: null,
    providerTokenEncrypted: null,
    providerTokenIv: null,
    providerTokenTag: null,
  };
}

function createPrisma() {
  return {
    whatsappInstance: { findFirst: vi.fn(async () => instance()) },
    lead: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    webhookLog: { findFirst: vi.fn() },
  };
}

function serviceFor(prisma: ReturnType<typeof createPrisma>) {
  return new WhatsappConnectionsService(prisma as never, {} as never, {} as never);
}

describe("WhatsappConnectionsService activity", () => {
  it("counts only UAZAPI CTWA leads within exact effective-time windows", async () => {
    const prisma = createPrisma();
    prisma.lead.count.mockResolvedValueOnce(2).mockResolvedValueOnce(4).mockResolvedValueOnce(9);
    prisma.lead.findFirst
      .mockResolvedValueOnce({ firstMessageAt: new Date("2026-07-09T12:00:00.000Z") })
      .mockResolvedValueOnce({ createdAt: new Date("2026-07-10T11:00:00.000Z") });
    prisma.webhookLog.findFirst.mockResolvedValue({
      receivedAt: new Date("2026-07-10T10:00:00.000Z"),
    });

    await expect(serviceFor(prisma).getActivity("workspace_1", "instance_1", now)).resolves.toEqual({
      leads24h: 2,
      leads7d: 4,
      leadsTotal: 9,
      lastLeadAt: "2026-07-10T11:00:00.000Z",
      lastWebhookAt: "2026-07-10T10:00:00.000Z",
    });

    const leadScope = {
      workspaceId: "workspace_1",
      whatsappInstanceId: "instance_1",
      source: "uazapi",
      ctwaClid: { not: null },
    };
    const expectedWindow = (since: string) => ({
      ...leadScope,
      OR: [
        { firstMessageAt: { gte: new Date(since), lte: now } },
        {
          firstMessageAt: null,
          createdAt: { gte: new Date(since), lte: now },
        },
      ],
    });

    // Both branches use the effective timestamp, so the upper bound excludes
    // future firstMessageAt and fallback createdAt values deterministically.
    expect(prisma.lead.count).toHaveBeenNthCalledWith(1, {
      where: expectedWindow("2026-07-09T12:00:00.000Z"),
    });
    expect(prisma.lead.count).toHaveBeenNthCalledWith(2, {
      where: expectedWindow("2026-07-03T12:00:00.000Z"),
    });
    expect(prisma.lead.count).toHaveBeenNthCalledWith(3, {
      where: leadScope,
    });
    expect(prisma.lead.findFirst).toHaveBeenNthCalledWith(1, {
      where: { ...leadScope, firstMessageAt: { not: null } },
      orderBy: { firstMessageAt: "desc" },
      select: { firstMessageAt: true },
    });
    expect(prisma.lead.findFirst).toHaveBeenNthCalledWith(2, {
      where: { ...leadScope, firstMessageAt: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    expect(prisma.webhookLog.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        whatsappInstanceId: "instance_1",
        source: "uazapi",
      },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    });
  });

  it("returns zeroes and nullable dates when the scoped instance has no data", async () => {
    const prisma = createPrisma();
    prisma.lead.count.mockResolvedValue(0);
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.webhookLog.findFirst.mockResolvedValue(null);

    await expect(serviceFor(prisma).getActivity("workspace_1", "instance_1", now)).resolves.toEqual({
      leads24h: 0,
      leads7d: 0,
      leadsTotal: 0,
      lastLeadAt: null,
      lastWebhookAt: null,
    });
  });

  it("does not turn database failures into fabricated activity", async () => {
    const prisma = createPrisma();
    prisma.lead.count.mockRejectedValue(new Error("database connection details"));

    await expect(serviceFor(prisma).getActivity("workspace_1", "instance_1", now)).rejects.toEqual(
      new InternalServerErrorException("Nao foi possivel consultar a atividade da instancia"),
    );
  });

  it("maps ownership database failures to the same opaque activity error", async () => {
    const prisma = createPrisma();
    prisma.whatsappInstance.findFirst.mockRejectedValue(
      new Error("Prisma connection details"),
    );

    await expect(serviceFor(prisma).getActivity("workspace_1", "instance_1", now)).rejects.toEqual(
      new InternalServerErrorException("Nao foi possivel consultar a atividade da instancia"),
    );
    expect(prisma.lead.count).not.toHaveBeenCalled();
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.webhookLog.findFirst).not.toHaveBeenCalled();
  });

  it("rejects foreign instances and non-UAZAPI instances before querying activity", async () => {
    const foreignPrisma = createPrisma();
    foreignPrisma.whatsappInstance.findFirst.mockResolvedValue(null as never);
    await expect(serviceFor(foreignPrisma).getActivity("workspace_1", "foreign", now)).rejects.toEqual(
      new NotFoundException("Instancia WhatsApp nao encontrada"),
    );
    expect(foreignPrisma.lead.count).not.toHaveBeenCalled();

    const cloudPrisma = createPrisma();
    cloudPrisma.whatsappInstance.findFirst.mockResolvedValue(instance("cloud_api"));
    await expect(serviceFor(cloudPrisma).getActivity("workspace_1", "instance_1", now)).rejects.toEqual(
      new ForbiddenException("Atividade disponivel apenas para instancias UAZAPI"),
    );
    expect(cloudPrisma.lead.count).not.toHaveBeenCalled();
  });
});
