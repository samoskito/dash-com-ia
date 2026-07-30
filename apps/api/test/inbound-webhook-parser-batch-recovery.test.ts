import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { ProviderConversionDecisionRepository } from "../src/conversion-rules/provider-conversion-decision.repository";
import {
  BackofficeInboundWebhooksService,
  type InboundWebhookPayloadActor,
} from "../src/inbound-webhooks/backoffice-inbound-webhooks.service";
import { InboundConversionAutomationIngestionService } from "../src/inbound-webhooks/inbound-conversion-automation-ingestion.service";
import { InboundWebhookObservationService } from "../src/inbound-webhooks/inbound-webhook-observation.service";
import { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";
import { InboundWebhookQueueService } from "../src/inbound-webhooks/inbound-webhook-queue.service";
import { InboundWebhookParserRegistry } from "../src/inbound-webhooks/providers/inbound-webhook-parser.registry";

const actor: InboundWebhookPayloadActor = {
  id: "platform_owner_1",
  actorType: "platform_owner",
  sourceIp: "127.0.0.1",
};

const connection = {
  id: "connection_1",
  workspaceId: "workspace_1",
  provider: "gupshup",
  displayName: "Unidade Itaborai",
  status: "observation",
  productionActivatedAt: null,
  lastDeliveryAt: new Date("2026-07-30T16:08:24.500Z"),
  lastSuccessfulParseAt: new Date("2026-07-30T16:08:24.500Z"),
  removedAt: null,
  createdAt: new Date("2026-07-20T22:08:33.552Z"),
  updatedAt: new Date("2026-07-30T16:08:24.500Z"),
  workspace: {
    id: "workspace_1",
    name: "MC Itaborai",
  },
  parserRelease: {
    provider: "gupshup",
    version: "v1",
    status: "certified",
  },
};

function createService(input?: {
  connection?: typeof connection;
  counts?: number[];
  candidates?: number;
  queueFailureAt?: number;
}) {
  const selectedConnection = input?.connection ?? connection;
  const candidateCount = input?.candidates ?? 10;
  const candidates = Array.from({ length: candidateCount }, (_, index) => ({
    id: `delivery_${String(index + 1).padStart(4, "0")}`,
    workspaceId: "workspace_1",
    connectionId: "connection_1",
    updatedAt: new Date(`2026-07-30T16:${String(index).padStart(2, "0")}:00Z`),
  }));
  const claimed = candidates.map(({ updatedAt: _updatedAt, ...candidate }) => ({
    ...candidate,
  }));
  const transaction = {
    inboundWebhookDelivery: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(candidates)
        .mockResolvedValueOnce(claimed),
      updateMany: vi.fn(async () => ({ count: candidateCount })),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: "audit_1" })),
    },
  };
  const count = vi.fn();

  for (const value of input?.counts ?? []) {
    count.mockResolvedValueOnce(value);
  }

  const prisma = {
    inboundWebhookConnection: {
      findUnique: vi.fn(async () => selectedConnection),
    },
    inboundWebhookDelivery: {
      count,
      updateMany: vi.fn(async () => ({ count: candidateCount })),
    },
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const enqueueDelivery = vi.fn(
    async ({ deliveryId }: { deliveryId: string }) => {
      const index = Number(deliveryId.split("_").at(-1));

      if (input?.queueFailureAt === index) {
        throw new Error("queue unavailable");
      }

      return {
        jobId: `job_${deliveryId}`,
        status: "queued" as const,
      };
    },
  );
  const queue = { enqueueDelivery };
  const service = new BackofficeInboundWebhooksService(
    prisma as unknown as PrismaService,
    {} as InboundWebhookPayloadEncryptionService,
    queue as unknown as InboundWebhookQueueService,
    new InboundWebhookParserRegistry(),
    {} as ProviderConversionDecisionRepository,
    {} as InboundWebhookObservationService,
    {} as InboundConversionAutomationIngestionService,
  );

  return {
    service,
    prisma,
    transaction,
    enqueueDelivery,
  };
}

describe("inbound webhook parser batch recovery", () => {
  it("returns a redacted inventory split between recoverable and expired payloads", async () => {
    const harness = createService({
      counts: [3_374, 2_058, 1_316, 0, 0],
    });

    const result =
      await harness.service.getParserRecoveryPreview("connection_1");

    expect(result).toEqual({
      workspace: {
        id: "workspace_1",
        name: "MC Itaborai",
      },
      connection: expect.objectContaining({
        id: "connection_1",
        provider: "gupshup",
        displayName: "Unidade Itaborai",
        parserVersion: "v1",
        parserReleaseStatus: "certified",
      }),
      counts: {
        awaitingParser: 3_374,
        recoverable: 2_058,
        expired: 1_316,
        unavailable: 0,
        inFlight: 0,
      },
      maxBatchSize: 500,
    });
    expect(JSON.stringify(result)).not.toContain("encryptedPayload");
    expect(JSON.stringify(result)).not.toContain("ctwaClid");
  });

  it("claims and queues only the selected canary through the normal parser queue", async () => {
    const harness = createService({
      counts: [2_058, 2_048],
      candidates: 10,
    });

    const result = await harness.service.reprocessParserBatch(
      "connection_1",
      {
        confirmation: "Unidade Itaborai",
        selection: "canary_10",
      },
      actor,
    );

    expect(result).toEqual({
      connectionId: "connection_1",
      selection: "canary_10",
      requestedLimit: 10,
      selected: 10,
      claimed: 10,
      queued: 10,
      existing: 0,
      queueFailures: 0,
      remainingRecoverable: 2_048,
    });
    expect(harness.enqueueDelivery).toHaveBeenCalledTimes(10);
    expect(
      harness.transaction.inboundWebhookDelivery.findMany,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 10,
        orderBy: [{ lastReceivedAt: "asc" }, { id: "asc" }],
      }),
    );
    expect(
      harness.transaction.inboundWebhookDelivery.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending",
          classification: null,
          processedAt: null,
        }),
      }),
    );
    expect(harness.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "inbound_webhook.parser.batch_reprocess",
        targetType: "inbound_webhook_connection",
        targetId: "connection_1",
        resultStatus: "requested",
      }),
    });
  });

  it("caps the remaining option at 500 and keeps queue failures protected for maintenance", async () => {
    const harness = createService({
      counts: [2_058, 1_559],
      candidates: 500,
      queueFailureAt: 500,
    });

    const result = await harness.service.reprocessParserBatch(
      "connection_1",
      {
        confirmation: "Unidade Itaborai",
        selection: "remaining",
      },
      actor,
    );

    expect(result).toMatchObject({
      requestedLimit: 500,
      selected: 500,
      claimed: 500,
      queued: 499,
      queueFailures: 1,
      remainingRecoverable: 1_559,
    });
    expect(harness.enqueueDelivery).toHaveBeenCalledTimes(500);
    expect(
      harness.prisma.inboundWebhookDelivery.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: expect.not.arrayContaining(["delivery_0500"]),
          },
        }),
        data: {
          status: "queued",
          queuedAt: expect.any(Date),
        },
      }),
    );
  });

  it("requires the exact connection name before claiming any delivery", async () => {
    const harness = createService({ counts: [] });

    await expect(
      harness.service.reprocessParserBatch(
        "connection_1",
        {
          confirmation: "Unidade Itaborai incorreta",
          selection: "canary_10",
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(harness.enqueueDelivery).not.toHaveBeenCalled();
  });

  it("refuses recovery when the pinned parser release is retired", async () => {
    const harness = createService({
      connection: {
        ...connection,
        parserRelease: {
          ...connection.parserRelease,
          status: "retired",
        },
      },
    });

    await expect(
      harness.service.getParserRecoveryPreview("connection_1"),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.prisma.inboundWebhookDelivery.count).not.toHaveBeenCalled();
  });
});
