import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PackageBillingWebhookService } from "../src/billing/package-billing-webhook.service";

const contract = {
  id: "contract_1",
  workspaceId: "workspace_1",
  planId: "plan_1",
  planNameSnapshot: "Pacote",
  asaasSubscriptionId: "sub_asaas_1"
};

const subscriptionWebhook = {
  id: "evt_asaas_1",
  event: "SUBSCRIPTION_UPDATED",
  subscription: {
    id: "sub_asaas_1",
    externalReference: "signed-reference"
  }
};

function duplicateError() {
  return new Prisma.PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "6.19.3"
  });
}

function createHarness() {
  const prisma = {
    workspaceSubscription: {
      findFirst: vi.fn().mockResolvedValue(contract),
      update: vi.fn().mockResolvedValue(contract)
    },
    billingProviderEvent: {
      create: vi.fn().mockResolvedValue({
        id: "provider_event_1",
        status: "processing"
      }),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn().mockResolvedValue({
        id: "provider_event_1",
        status: "processed"
      })
    },
    billingInvoice: {
      findFirst: vi.fn()
    }
  };
  const configuration = {
    isPackageBillingEnabled: () => true
  };
  const asaas = {
    parseContractExternalReference: vi.fn().mockReturnValue({
      workspaceId: "workspace_1",
      subscriptionId: "contract_1"
    })
  };
  const service = new PackageBillingWebhookService(
    prisma as never,
    configuration as never,
    asaas as never,
    {} as never,
    {} as never,
    {} as never
  );

  return { prisma, service };
}

describe("PackageBillingWebhookService", () => {
  it("does not process an event that was already completed", async () => {
    const { prisma, service } = createHarness();
    prisma.billingProviderEvent.create.mockRejectedValueOnce(duplicateError());
    prisma.billingProviderEvent.findUnique.mockResolvedValueOnce({
      id: "provider_event_1",
      status: "processed",
      updatedAt: new Date()
    });

    const result = await service.tryProcess(subscriptionWebhook);

    expect(result).toMatchObject({
      handled: true,
      status: "duplicate",
      workspaceId: "workspace_1"
    });
    expect(prisma.billingProviderEvent.updateMany).not.toHaveBeenCalled();
    expect(prisma.workspaceSubscription.update).not.toHaveBeenCalled();
  });

  it("claims and retries the same provider event after a failed attempt", async () => {
    const { prisma, service } = createHarness();
    prisma.billingProviderEvent.create.mockRejectedValueOnce(duplicateError());
    prisma.billingProviderEvent.findUnique
      .mockResolvedValueOnce({
        id: "provider_event_1",
        status: "failed",
        updatedAt: new Date()
      })
      .mockResolvedValueOnce({
        id: "provider_event_1",
        status: "processing",
        updatedAt: new Date()
      });
    prisma.billingProviderEvent.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.tryProcess(subscriptionWebhook);

    expect(result).toMatchObject({
      handled: true,
      status: "processed",
      workspaceId: "workspace_1"
    });
    expect(prisma.billingProviderEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "provider_event_1",
        OR: [
          { status: "failed" },
          {
            status: "processing",
            updatedAt: { lte: expect.any(Date) }
          }
        ]
      },
      data: expect.objectContaining({
        status: "processing",
        processedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null
      })
    });
    expect(prisma.workspaceSubscription.update).toHaveBeenCalledWith({
      where: { id: "contract_1" },
      data: { asaasSubscriptionId: "sub_asaas_1" }
    });
  });

  it("does not expose customer or payment secrets in the stored payload", async () => {
    const { prisma, service } = createHarness();

    await service.tryProcess({
      ...subscriptionWebhook,
      access_token: "must-not-be-persisted",
      customer: {
        cpfCnpj: "12345678901",
        email: "payer@example.test"
      },
      subscription: {
        ...subscriptionWebhook.subscription,
        creditCardToken: "must-not-be-persisted"
      }
    });

    const payload =
      prisma.billingProviderEvent.create.mock.calls[0]?.[0]?.data
        ?.payloadRedacted;
    expect(JSON.stringify(payload)).not.toContain("must-not-be-persisted");
    expect(JSON.stringify(payload)).not.toContain("12345678901");
    expect(JSON.stringify(payload)).not.toContain("payer@example.test");
    expect(payload).toMatchObject({
      eventId: "evt_asaas_1",
      eventType: "SUBSCRIPTION_UPDATED",
      resourceId: "sub_asaas_1",
      resourceType: "subscription"
    });
  });
});
