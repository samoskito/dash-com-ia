import { InternalServerErrorException } from "@nestjs/common";
import {
  backofficeInboundWebhookDeliveryListSchema,
  backofficeInboundWebhookPayloadSchema,
} from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { BackofficeInboundWebhooksService } from "../src/inbound-webhooks/backoffice-inbound-webhooks.service";
import { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";
import { InboundWebhookQueueService } from "../src/inbound-webhooks/inbound-webhook-queue.service";

const connectionSecretHash = "internal-secret-hash-do-not-leak";
const oneTimeWebhookUrl =
  "https://api.example.com/webhooks/inbound/connection_1?token=do-not-leak";
const rawPayload = {
  Type: "Message",
  EventId: "umbler_event_1",
  Payload: {
    Type: "Chat",
    Content: {
      Organization: { Id: "organization_1" },
      Channel: {
        Id: "channel_1",
        PhoneNumber: "5511999999999",
      },
    },
  },
};

type PayloadState = "available" | "expired" | "cleared" | "corrupt";

function runtimeEnvironment() {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "https://api.example.com",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 37).toString("base64"),
  };
}

function eventRecord(deliveryId: string) {
  const occurredAt = new Date("2026-07-17T20:00:00.000Z");

  return {
    id: `event_for_${deliveryId}`,
    workspaceId: "workspace_1",
    connectionId: "connection_1",
    deliveryId,
    channelId: "channel_1",
    provider: "umbler" as const,
    externalEventId: "umbler_event_1",
    externalMessageId: "message_1",
    dedupeKey: `sha256:${"b".repeat(64)}`,
    occurredAt,
    contactIdentityHash: `sha256:${"c".repeat(64)}`,
    adId: "ad_1",
    hasCtwa: true,
    classification: "eligible_route_resolved" as const,
    classificationReason: "paid_ctwa_candidate",
    resolvedBusinessConnectionWorkspaceId: "workspace_1",
    resolvedBusinessConnectionId: "meta_business_1",
    resolvedReportingAccountWorkspaceId: "workspace_1",
    resolvedReportingAccountId: "meta_account_1",
    resolvedConversionDestinationWorkspaceId: "workspace_1",
    resolvedConversionDestinationId: "meta_destination_1",
    channel: {
      id: "channel_1",
      channelName: "Comercial",
      connectedPhone: "+5511999999999",
    },
    normalizedSummary: {
      provider: "umbler",
      providerEventType: "Message",
      externalEventId: "umbler_event_1",
      externalMessageId: "message_1",
      organizationId: "organization_1",
      providerChannelId: "channel_1",
      connectedPhoneSuffix: "9999",
      occurredAt: occurredAt.toISOString(),
      adId: "ad_1",
      hasCtwa: true,
      classification: "eligible_route_resolved",
      classificationReason: "paid_ctwa_candidate",
    },
    createdAt: new Date("2026-07-17T20:00:02.000Z"),
    updatedAt: new Date("2026-07-17T20:00:02.000Z"),
  };
}

function deliveryRecord(
  encryption: InboundWebhookPayloadEncryptionService,
  state: PayloadState,
  id = "delivery_1",
) {
  const context = {
    workspaceId: "workspace_1",
    connectionId: "connection_1",
    deliveryId: id,
  };
  const encrypted = encryption.encrypt(
    Buffer.from(JSON.stringify(rawPayload), "utf8"),
    context,
  );
  const events = [eventRecord(id)];
  const cleared = state === "cleared";

  return {
    id,
    workspaceId: "workspace_1",
    connectionId: "connection_1",
    provider: "umbler" as const,
    ingressKey: "umbler_event_1",
    externalDeliveryId: "umbler_event_1",
    providerEventType: "Message",
    parserVersion: "v1",
    purpose: "message_observation" as const,
    status: "processed" as const,
    classification: "eligible_route_resolved" as const,
    firstReceivedAt: new Date("2026-07-17T20:00:00.000Z"),
    lastReceivedAt: new Date("2026-07-17T20:00:01.000Z"),
    attemptCount: 1,
    providerAttempt: 1,
    encryptedPayload: cleared
      ? null
      : state === "corrupt"
        ? `${encrypted.encryptedPayload.slice(0, -4)}AAAA`
        : encrypted.encryptedPayload,
    payloadIv: cleared ? null : encrypted.payloadIv,
    payloadTag: cleared ? null : encrypted.payloadTag,
    encryptionKeyVersion: cleared ? null : encrypted.encryptionKeyVersion,
    payloadExpiresAt:
      state === "expired"
        ? new Date("2000-07-24T20:00:00.000Z")
        : new Date("2099-07-24T20:00:00.000Z"),
    providerConversionsObservedAt: null,
    normalizedSummary: {
      provider: "umbler",
      parserVersion: "v1",
      providerEventType: "Message",
      externalDeliveryId: "umbler_event_1",
      classification: "eligible_route_resolved",
      classificationReason: "paid_ctwa_candidate",
      eventCount: 1,
    },
    parseErrorCode: null,
    routingErrorCode: null,
    queuedAt: new Date("2026-07-17T20:00:00.500Z"),
    processedAt: new Date("2026-07-17T20:00:02.000Z"),
    createdAt: new Date("2026-07-17T20:00:00.000Z"),
    updatedAt: new Date("2026-07-17T20:00:02.000Z"),
    connection: {
      id: "connection_1",
      displayName: "Umbler Comercial",
      secretHash: connectionSecretHash,
      webhookUrl: oneTimeWebhookUrl,
      parserRelease: {
        id: "inbound_parser_umbler_v1",
        status: "observation_only" as const,
      },
    },
    workspace: {
      name: "Cliente Teste",
    },
    events,
    _count: {
      events: events.length,
    },
  };
}

function createHarness(state: PayloadState = "available") {
  const encryption = new InboundWebhookPayloadEncryptionService(
    runtimeEnvironment(),
  );
  const delivery = deliveryRecord(encryption, state);
  const deliveries = new Map([[delivery.id, delivery]]);
  const audits: Array<Record<string, unknown>> = [];
  const receivedAtMatches = (
    candidate: typeof delivery,
    filter?: { gte?: Date; lte?: Date },
  ) =>
    (!filter?.gte ||
      candidate.lastReceivedAt.getTime() >= filter.gte.getTime()) &&
    (!filter?.lte ||
      candidate.lastReceivedAt.getTime() <= filter.lte.getTime());
  const inboundWebhookDelivery = {
    findMany: vi.fn(async ({ where, skip = 0, take }) =>
      [...deliveries.values()]
        .filter(
          (candidate) =>
            (!where.workspaceId ||
              candidate.workspaceId === where.workspaceId) &&
            (!where.connectionId ||
              candidate.connectionId === where.connectionId) &&
            (!where.provider || candidate.provider === where.provider) &&
            (!where.purpose || candidate.purpose === where.purpose) &&
            receivedAtMatches(candidate, where.lastReceivedAt) &&
            (!where.status || candidate.status === where.status) &&
            (!where.classification ||
              candidate.classification === where.classification) &&
            (!where.OR ||
              where.OR.some(
                (condition: {
                  classification?: string;
                  events?: { some?: { classification?: string } };
                }) =>
                  condition.classification === candidate.classification ||
                  candidate.events.some(
                    (event) =>
                      event.classification ===
                      condition.events?.some?.classification,
                  ),
              )),
        )
        .sort(
          (left, right) =>
            right.lastReceivedAt.getTime() - left.lastReceivedAt.getTime() ||
            right.id.localeCompare(left.id),
        )
        .slice(skip, skip + take),
    ),
    count: vi.fn(
      async ({ where }) =>
        [...deliveries.values()].filter(
          (candidate) =>
            (!where.workspaceId ||
              candidate.workspaceId === where.workspaceId) &&
            (!where.connectionId ||
              candidate.connectionId === where.connectionId) &&
            (!where.provider || candidate.provider === where.provider) &&
            (!where.purpose || candidate.purpose === where.purpose) &&
            (!where.id || candidate.id === where.id) &&
            (!where.status || candidate.status === where.status) &&
            (!where.classification ||
              candidate.classification === where.classification),
        ).length,
    ),
    findUnique: vi.fn(async ({ where, select }) => {
      const found = deliveries.get(where.id);

      if (!found) {
        return null;
      }

      return select?.workspaceId && Object.keys(select).length === 1
        ? { workspaceId: found.workspaceId }
        : found;
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      let count = 0;

      for (const candidate of deliveries.values()) {
        if (
          candidate.id === where.id &&
          candidate.workspaceId === where.workspaceId &&
          candidate.connectionId === where.connectionId &&
          candidate.status === where.status
        ) {
          Object.assign(candidate, data);
          count += 1;
        }
      }

      return { count };
    }),
  };
  const inboundWebhookEvent = {
    count: vi.fn(
      async ({ where }) =>
        [...deliveries.values()]
          .flatMap((candidate) => candidate.events)
          .filter(
            (candidate) =>
              (!where.workspaceId ||
                candidate.workspaceId === where.workspaceId) &&
              (!where.connectionId ||
                candidate.connectionId === where.connectionId) &&
              (!where.provider || candidate.provider === where.provider) &&
              (!where.classification ||
                candidate.classification === where.classification),
          ).length,
    ),
  };
  const prisma = {
    inboundWebhookDelivery,
    inboundWebhookEvent,
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
    auditLog: {
      create: vi.fn(async ({ data }) => {
        audits.push(data);
        return {
          id: `audit_${audits.length}`,
          createdAt: new Date(),
          ...data,
        };
      }),
    },
  };
  const queue = {
    enqueueDelivery: vi.fn(async () => ({
      jobId: "inbound-webhook-delivery_1",
      status: "queued" as const,
    })),
  };
  const service = new BackofficeInboundWebhooksService(
    prisma as unknown as PrismaService,
    encryption,
    queue as unknown as InboundWebhookQueueService,
  );

  return {
    audits,
    delivery,
    encryption,
    prisma,
    queue,
    service,
  };
}

const owner = {
  id: "platform_owner_1",
  actorType: "platform_owner",
  sourceIp: "203.0.113.10",
};

describe("inbound webhook payload access", () => {
  it("queues one retained processed delivery to recover provider conversions and audits the request", async () => {
    const harness = createHarness();

    const result = await harness.service.reprocessProviderConversions(
      harness.delivery.id,
      owner,
    );

    expect(result).toEqual({
      deliveryId: harness.delivery.id,
      status: "queued",
    });
    expect(harness.queue.enqueueDelivery).toHaveBeenCalledWith({
      deliveryId: harness.delivery.id,
      connectionId: harness.delivery.connectionId,
      workspaceId: harness.delivery.workspaceId,
      forceProviderConversions: true,
    });
    expect(
      harness.prisma.inboundWebhookDelivery.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: harness.delivery.id,
        workspaceId: harness.delivery.workspaceId,
        connectionId: harness.delivery.connectionId,
        status: "processed",
      },
      data: {
        providerConversionsObservedAt: null,
      },
    });
    expect(harness.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: harness.delivery.workspaceId,
        actorUserId: owner.id,
        actorType: owner.actorType,
        action: "inbound_webhook.provider_conversions.reprocess",
        targetId: harness.delivery.id,
        resultStatus: "requested",
      }),
    });
  });

  it("forces a new conversion read even when the delivery was already observed", async () => {
    const harness = createHarness();
    Reflect.set(
      harness.delivery,
      "providerConversionsObservedAt",
      new Date("2026-07-23T13:00:00.000Z"),
    );

    const result = await harness.service.reprocessProviderConversions(
      harness.delivery.id,
      owner,
    );

    expect(result.status).toBe("queued");
    expect(harness.delivery.providerConversionsObservedAt).toBeNull();
    expect(harness.queue.enqueueDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        forceProviderConversions: true,
      }),
    );
  });

  it("refuses conversion recovery after the retained payload expires", async () => {
    const harness = createHarness("expired");

    await expect(
      harness.service.reprocessProviderConversions(harness.delivery.id, owner),
    ).rejects.toThrow("O payload desta entrega nao esta mais disponivel");
    expect(harness.queue.enqueueDelivery).not.toHaveBeenCalled();
  });

  it("lists redacted delivery metadata with parser release status", async () => {
    const harness = createHarness();

    const result = await harness.service.listDeliveries({
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      provider: "umbler",
      status: "processed",
      classification: "eligible_route_resolved",
      limit: 25,
      offset: 0,
    });

    expect(
      backofficeInboundWebhookDeliveryListSchema.safeParse(result).success,
    ).toBe(true);
    expect(result).toEqual([
      expect.objectContaining({
        id: "delivery_1",
        parserVersion: "v1",
        parserReleaseStatus: "observation_only",
        payloadAvailable: true,
        eventCount: 1,
        purpose: "message_observation",
      }),
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(connectionSecretHash);
    expect(serialized).not.toContain(oneTimeWebhookUrl);
    expect(serialized).not.toContain("secretHash");
    expect(serialized).not.toContain("webhookUrl");
    expect(serialized).not.toContain("encryptedPayload");
    expect(harness.prisma.inboundWebhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
      }),
    );
    expect(harness.audits).toHaveLength(0);
  });

  it("filters deliveries by the exact Sao Paulo minute", async () => {
    const harness = createHarness();

    const matching = await harness.service.listDeliveries({
      receivedFrom: "2026-07-17T17:00",
      receivedUntil: "2026-07-17T17:00",
      limit: 25,
      offset: 0,
    });
    const previousMinute = await harness.service.listDeliveries({
      receivedFrom: "2026-07-17T16:59",
      receivedUntil: "2026-07-17T16:59",
      limit: 25,
      offset: 0,
    });

    expect(matching).toHaveLength(1);
    expect(previousMinute).toHaveLength(0);
    expect(
      harness.prisma.inboundWebhookDelivery.findMany,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          lastReceivedAt: {
            gte: new Date("2026-07-17T20:00:00.000Z"),
            lte: new Date("2026-07-17T20:00:59.999Z"),
          },
        }),
      }),
    );
  });

  it("decrypts a valid non-expired JSON payload and audits the owner access", async () => {
    const harness = createHarness();

    const result = await harness.service.getPayload("delivery_1", owner);

    expect(
      backofficeInboundWebhookPayloadSchema.safeParse(result).success,
    ).toBe(true);
    expect(result).toMatchObject({
      delivery: {
        id: "delivery_1",
        workspaceId: "workspace_1",
        parserReleaseStatus: "observation_only",
        payloadAvailable: true,
        eventCount: 1,
      },
      payload: rawPayload,
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        id: "event_for_delivery_1",
        deliveryId: "delivery_1",
        connectedPhoneSuffix: "9999",
        classification: "eligible_route_resolved",
      }),
    ]);
    expect(harness.audits).toEqual([
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "platform_owner_1",
        actorType: "platform_owner",
        action: "inbound_webhook.payload.read",
        targetType: "inbound_webhook_delivery",
        targetId: "delivery_1",
        sourceIp: "203.0.113.10",
        resultStatus: "success",
        reason: null,
      }),
    ]);
    const serialized = JSON.stringify({
      response: result,
      audits: harness.audits,
    });
    expect(serialized).not.toContain(connectionSecretHash);
    expect(serialized).not.toContain(oneTimeWebhookUrl);
    expect(serialized).not.toContain("secretHash");
    expect(serialized).not.toContain("webhookUrl");
  });

  it("summarizes normalized events independently from the delivery list limit", async () => {
    const harness = createHarness();

    const summary = await harness.service.summarizeDeliveries({
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      provider: "umbler",
    });

    expect(summary).toEqual({
      all: 1,
      ctwaPending: 0,
      ctwaRouted: 1,
      failed: 0,
      noCtwa: 0,
      automationCallbacks: 0,
      awaitingParser: 0,
    });
    expect(harness.prisma.inboundWebhookEvent.count).toHaveBeenCalledTimes(4);
    expect(harness.prisma.inboundWebhookDelivery.count).toHaveBeenCalledTimes(
      3,
    );
  });

  it.each([
    {
      state: "expired" as const,
      reason: "payload_expired",
    },
    {
      state: "cleared" as const,
      reason: "payload_cleared",
    },
  ])(
    "returns metadata without raw JSON and audits an $state payload",
    async ({ state, reason }) => {
      const harness = createHarness(state);
      const decrypt = vi.spyOn(harness.encryption, "decrypt");

      const result = await harness.service.getPayload("delivery_1", owner);

      expect(result.delivery.payloadAvailable).toBe(false);
      expect(result.payload).toBeNull();
      expect(result.events).toHaveLength(1);
      expect(decrypt).not.toHaveBeenCalled();
      expect(harness.audits).toEqual([
        expect.objectContaining({
          workspaceId: "workspace_1",
          actorUserId: "platform_owner_1",
          targetId: "delivery_1",
          sourceIp: "203.0.113.10",
          resultStatus: "unavailable",
          reason,
        }),
      ]);
      expect(
        backofficeInboundWebhookPayloadSchema.safeParse(result).success,
      ).toBe(true);
    },
  );

  it("audits a sanitized failure when encrypted payload decryption fails", async () => {
    const harness = createHarness("corrupt");

    await expect(
      harness.service.getPayload("delivery_1", owner),
    ).rejects.toMatchObject({
      status: 500,
      message: "Payload indisponivel",
    });

    expect(harness.audits).toEqual([
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "platform_owner_1",
        actorType: "platform_owner",
        targetId: "delivery_1",
        sourceIp: "203.0.113.10",
        resultStatus: "failed",
        reason: "payload_decryption_failed",
      }),
    ]);
    expect(JSON.stringify(harness.audits)).not.toContain(connectionSecretHash);
    expect(JSON.stringify(harness.audits)).not.toContain(oneTimeWebhookUrl);
  });

  it.each([
    {
      actorUserId: "platform_operator_1",
      actorType: "platform_operator",
      sourceIp: "198.51.100.20",
    },
    {
      actorUserId: "workspace_admin_1",
      actorType: "workspace_user",
      sourceIp: "198.51.100.21",
    },
  ])(
    "audits denied raw access by $actorType without decrypting",
    async ({ actorUserId, actorType, sourceIp }) => {
      const harness = createHarness();
      const decrypt = vi.spyOn(harness.encryption, "decrypt");

      await harness.service.recordDeniedPayloadAccess({
        deliveryId: "delivery_1",
        actorUserId,
        actorType,
        sourceIp,
      });

      expect(decrypt).not.toHaveBeenCalled();
      expect(harness.audits).toEqual([
        expect.objectContaining({
          workspaceId: "workspace_1",
          actorUserId,
          actorType,
          action: "inbound_webhook.payload.read",
          targetType: "inbound_webhook_delivery",
          targetId: "delivery_1",
          sourceIp,
          resultStatus: "denied",
          reason: "platform_owner_required",
        }),
      ]);
      const serialized = JSON.stringify(harness.audits);
      expect(serialized).not.toContain(connectionSecretHash);
      expect(serialized).not.toContain(oneTimeWebhookUrl);
    },
  );

  it("uses the generic payload failure instead of leaking decrypt details", async () => {
    const harness = createHarness("corrupt");

    let thrown: unknown;
    try {
      await harness.service.getPayload("delivery_1", owner);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InternalServerErrorException);
    expect((thrown as Error).message).toBe("Payload indisponivel");
    expect((thrown as Error).message).not.toContain("decrypt");
    expect((thrown as Error).message).not.toContain("AES");
  });
});
