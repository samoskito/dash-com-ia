import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboundWebhookReplayService } from "../src/inbound-webhook-replay/inbound-webhook-replay.service";
import { InboundWebhookParserRegistry } from "../src/inbound-webhooks/providers/inbound-webhook-parser.registry";

const workspaceId = "workspace_1";
const connectionId = "connection_1";
const channelId = "channel_1";
const now = new Date("2026-07-18T15:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});
const replayEnv = {
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  API_PUBLIC_URL: "http://localhost:3333",
  INBOUND_WEBHOOKS_ENABLED: "true",
  INBOUND_WEBHOOK_REPLAY_ENABLED: "true",
  INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
};
const connection = {
  id: connectionId,
  workspaceId,
  provider: "umbler" as const,
  displayName: "observacao inicial",
  parserReleaseId: "parser_1",
  secretHash: null,
  status: "observation" as const,
  createdByUserId: "owner_1",
  lastDeliveryAt: now,
  lastSuccessfulParseAt: now,
  removedAt: null,
  createdAt: new Date("2026-07-17T15:00:00.000Z"),
  updatedAt: now,
  parserRelease: {
    id: "parser_1",
    provider: "umbler" as const,
    version: "v1",
    status: "certified" as const,
    certifiedByUserId: "owner_1",
    certifiedAt: now,
    createdAt: new Date("2026-07-17T15:00:00.000Z"),
    updatedAt: now,
  },
};
const owner = {
  id: "owner_1",
  email: "owner@example.com",
  role: "platform_owner" as const,
};

function createService(input: {
  prisma: Record<string, unknown>;
  payloadEncryption?: Record<string, unknown>;
  leads?: Record<string, unknown>;
  conversions?: Record<string, unknown>;
  conversionQueue?: Record<string, unknown>;
  replayQueue?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
}) {
  return new InboundWebhookReplayService(
    input.prisma as never,
    (input.payloadEncryption ?? { decrypt: vi.fn() }) as never,
    new InboundWebhookParserRegistry(),
    (input.leads ?? { upsertFromWhatsappWebhook: vi.fn() }) as never,
    (input.conversions ?? { recordExternalConversion: vi.fn() }) as never,
    (input.conversionQueue ?? { enqueueSend: vi.fn() }) as never,
    (input.replayQueue ?? { enqueueBatch: vi.fn() }) as never,
    input.env ?? replayEnv,
  );
}

function resolvedRoute(adId: string) {
  return {
    adId,
    classification: "eligible_route_resolved",
    resolvedBusinessConnectionId: "business_1",
    resolvedReportingAccountId: "reporting_1",
    resolvedConversionDestinationId: "destination_1",
    resolvedBusinessConnection: {
      status: "active",
      credential: {
        status: "active",
      },
    },
    resolvedReportingAccount: {
      active: true,
      adAccountId: "act_1",
      businessConnectionId: "business_1",
    },
    resolvedConversionDestination: {
      status: "configured",
    },
    channel: {
      routes: [
        {
          metaBusinessConnectionId: "business_1",
          metaReportingAccountId: "reporting_1",
          metaConversionDestinationId: "destination_1",
        },
      ],
    },
  };
}

describe("inbound webhook replay service", () => {
  it("returns a redacted preview and counts only fully eligible events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const availableDelivery = {
      payloadExpiresAt: new Date("2026-07-20T15:00:00.000Z"),
      encryptedPayload: "private-ciphertext",
      payloadIv: "private-iv",
      payloadTag: "private-tag",
      encryptionKeyVersion: 1,
    };
    const resolved = {
      adId: "ad_1",
      classification: "eligible_route_resolved",
      resolvedBusinessConnectionId: "business_1",
      resolvedReportingAccountId: "reporting_1",
      resolvedConversionDestinationId: "destination_1",
      resolvedBusinessConnection: {
        status: "active",
        credential: {
          status: "active",
        },
      },
      resolvedReportingAccount: {
        active: true,
        adAccountId: "act_1",
        businessConnectionId: "business_1",
      },
      resolvedConversionDestination: {
        status: "configured",
      },
      channel: {
        routes: [
          {
            metaBusinessConnectionId: "business_1",
            metaReportingAccountId: "reporting_1",
            metaConversionDestinationId: "destination_1",
          },
        ],
      },
    };
    const events = [
      {
        ...resolved,
        occurredAt: new Date("2026-07-18T12:00:00.000Z"),
        replayItem: null,
        delivery: availableDelivery,
      },
      {
        ...resolved,
        classification: "eligible_route_unresolved",
        resolvedBusinessConnectionId: null,
        resolvedReportingAccountId: null,
        resolvedConversionDestinationId: null,
        occurredAt: new Date("2026-07-18T12:10:00.000Z"),
        replayItem: null,
        delivery: availableDelivery,
      },
      {
        ...resolved,
        occurredAt: new Date("2026-07-18T12:20:00.000Z"),
        replayItem: null,
        delivery: {
          ...availableDelivery,
          payloadExpiresAt: new Date("2026-07-17T15:00:00.000Z"),
        },
      },
      {
        ...resolved,
        occurredAt: new Date("2026-07-18T12:30:00.000Z"),
        replayItem: null,
        delivery: {
          ...availableDelivery,
          encryptedPayload: null,
        },
      },
      {
        ...resolved,
        occurredAt: new Date("2026-07-18T12:40:00.000Z"),
        replayItem: {
          id: "item_existing",
          status: "materialized",
        },
        delivery: availableDelivery,
      },
      {
        ...resolved,
        occurredAt: new Date("2026-07-18T12:50:00.000Z"),
        replayItem: {
          id: "item_failed",
          status: "failed",
        },
        delivery: {
          ...availableDelivery,
          payloadExpiresAt: new Date("2026-07-19T15:00:00.000Z"),
        },
      },
    ];
    const prisma = {
      inboundWebhookConnection: {
        findFirst: vi.fn(async () => connection),
      },
      inboundWebhookEvent: {
        findMany: vi.fn(async () => events),
      },
      inboundWebhookChannel: {
        findMany: vi.fn(async () => [
          {
            id: channelId,
            channelName: "Comercial",
            connectedPhone: "5511999990001",
          },
        ]),
      },
      inboundWebhookReplayBatch: {
        findMany: vi.fn(async () => [
          {
            id: "batch_preview",
            workspaceId,
            connectionId,
            requestedByUserId: owner.id,
            selection: "canary_1",
            requestedLimit: 1,
            status: "completed_with_failures",
            totalItems: 1,
            materializedCount: 0,
            duplicateCount: 0,
            skippedCount: 0,
            failedCount: 1,
            retryableFailedCount: 3,
            retryCount: 0,
            startedAt: now,
            completedAt: now,
            lastRetriedAt: null,
            createdAt: now,
            updatedAt: now,
            items: [{ id: "item_failed" }],
          },
        ]),
      },
      metaAd: {
        findMany: vi.fn(async () => [
          {
            adId: "ad_1",
            adAccountId: "act_1",
          },
        ]),
      },
    };
    const service = createService({ prisma });

    const preview = await service.getPreview(connectionId);

    expect(preview.counts).toEqual({
      totalCtwa: 6,
      routeResolved: 5,
      routeUnresolved: 1,
      payloadAvailable: 4,
      payloadExpired: 1,
      payloadUnavailable: 1,
      alreadyMaterialized: 1,
      eligible: 1,
    });
    expect(preview.replayEnabled).toBe(true);
    expect(preview.oldestOccurredAt).toBe("2026-07-18T12:00:00.000Z");
    expect(preview.newestOccurredAt).toBe("2026-07-18T12:50:00.000Z");
    expect(preview.nextPayloadExpiresAt).toBe("2026-07-19T15:00:00.000Z");
    expect(preview.recentBatches).toHaveLength(1);
    expect(preview.recentBatches[0]).toMatchObject({
      id: "batch_preview",
      retryableFailedCount: 1,
    });
    expect(JSON.stringify(preview)).not.toContain("private-ciphertext");
    expect(JSON.stringify(preview)).not.toContain("private-iv");
    expect(JSON.stringify(preview)).not.toContain("private-tag");
  });

  it("does not authorize a replay while the deployment gate is off", async () => {
    const service = createService({
      prisma: {},
      env: {
        ...replayEnv,
        INBOUND_WEBHOOK_REPLAY_ENABLED: "false",
      },
    });

    await expect(
      service.authorizeReplay(
        connectionId,
        connection.displayName,
        "canary_1",
        channelId,
        owner,
        null,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("creates a scoped batch with identifiers only", async () => {
    const batch = {
      id: "batch_1",
      workspaceId,
      connectionId,
      channelId,
      requestedByUserId: owner.id,
      selection: "canary_5" as const,
      requestedLimit: 5,
      status: "queued" as const,
      totalItems: 0,
      materializedCount: 0,
      duplicateCount: 0,
      skippedCount: 0,
      failedCount: 0,
      retryableFailedCount: 0,
      retryCount: 0,
      startedAt: null,
      completedAt: null,
      lastRetriedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const auditCreate = vi.fn(async () => undefined);
    const itemCreateMany = vi.fn(async () => ({ count: 5 }));
    const batchUpdate = vi.fn(async ({ data }) => ({
      ...batch,
      ...data,
    }));
    const tx = {
      inboundWebhookReplayBatch: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => batch),
        update: batchUpdate,
      },
      inboundWebhookEvent: {
        findMany: vi.fn(async () => [
          {
            id: "event_1",
            ...resolvedRoute("ad_1"),
          },
          {
            id: "event_2",
            ...resolvedRoute("ad_2"),
          },
          {
            id: "event_3",
            ...resolvedRoute("ad_3"),
          },
          {
            id: "event_4",
            ...resolvedRoute("ad_4"),
          },
          {
            id: "event_5",
            ...resolvedRoute("ad_5"),
          },
          {
            id: "event_6",
            ...resolvedRoute("ad_6"),
          },
          {
            id: "event_stale_route",
            ...resolvedRoute("ad_7"),
            channel: {
              routes: [
                {
                  metaBusinessConnectionId: "business_other",
                  metaReportingAccountId: "reporting_other",
                  metaConversionDestinationId: "destination_other",
                },
              ],
            },
          },
        ]),
      },
      metaAd: {
        findMany: vi.fn(async () => [
          { adId: "ad_1", adAccountId: "act_1" },
          { adId: "ad_2", adAccountId: "act_1" },
          { adId: "ad_3", adAccountId: "act_1" },
          { adId: "ad_4", adAccountId: "act_1" },
          { adId: "ad_5", adAccountId: "act_1" },
          { adId: "ad_6", adAccountId: "act_1" },
          { adId: "ad_7", adAccountId: "act_1" },
        ]),
      },
      inboundWebhookReplayItem: {
        createMany: itemCreateMany,
      },
      auditLog: {
        create: auditCreate,
      },
    };
    const prisma = {
      inboundWebhookConnection: {
        findFirst: vi.fn(async () => connection),
      },
      inboundWebhookChannel: {
        count: vi.fn(async () => 1),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    const enqueueBatch = vi.fn(async () => ({
      jobId: "replay_batch_1",
      status: "queued",
    }));
    const service = createService({
      prisma,
      replayQueue: { enqueueBatch },
    });

    await expect(
      service.authorizeReplay(
        connectionId,
        connection.displayName,
        "canary_5",
        channelId,
        owner,
        "127.0.0.1",
      ),
    ).resolves.toMatchObject({
      id: "batch_1",
      totalItems: 5,
      status: "queued",
      selection: "canary_5",
      requestedLimit: 5,
    });
    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [
        {
          workspaceId,
          batchId: "batch_1",
          eventId: "event_1",
          status: "queued",
        },
        {
          workspaceId,
          batchId: "batch_1",
          eventId: "event_2",
          status: "queued",
        },
        {
          workspaceId,
          batchId: "batch_1",
          eventId: "event_3",
          status: "queued",
        },
        {
          workspaceId,
          batchId: "batch_1",
          eventId: "event_4",
          status: "queued",
        },
        {
          workspaceId,
          batchId: "batch_1",
          eventId: "event_5",
          status: "queued",
        },
      ],
      skipDuplicates: true,
    });
    expect(enqueueBatch).toHaveBeenCalledWith({
      workspaceId,
      batchId: "batch_1",
    });
    expect(JSON.stringify(enqueueBatch.mock.calls)).not.toContain("phone");
    expect(JSON.stringify(enqueueBatch.mock.calls)).not.toContain("payload");
  });

  it("maps a concurrent active-batch collision to a safe conflict", async () => {
    const enqueueBatch = vi.fn();
    const service = createService({
      prisma: {
        inboundWebhookConnection: {
          findFirst: vi.fn(async () => connection),
        },
        inboundWebhookChannel: {
          count: vi.fn(async () => 1),
        },
        $transaction: vi.fn(async () => {
          throw { code: "P2002" };
        }),
      },
      replayQueue: { enqueueBatch },
    });

    await expect(
      service.authorizeReplay(
        connectionId,
        connection.displayName,
        "canary_1",
        channelId,
        owner,
        null,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enqueueBatch).not.toHaveBeenCalled();
  });

  it("requeues only retained failures from the transient allowlist", async () => {
    const batch = {
      id: "batch_retry",
      workspaceId,
      connectionId,
      requestedByUserId: owner.id,
      selection: "canary_5" as const,
      requestedLimit: 5,
      status: "completed_with_failures" as const,
      totalItems: 5,
      materializedCount: 3,
      duplicateCount: 0,
      skippedCount: 0,
      failedCount: 2,
      retryableFailedCount: 2,
      retryCount: 0,
      startedAt: now,
      completedAt: now,
      lastRetriedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const batchFindFirst = vi
      .fn()
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce(null);
    const itemFindMany = vi.fn(async () => [
      { id: "item_retry_1" },
      { id: "item_retry_2" },
    ]);
    const itemUpdateMany = vi.fn(async () => ({ count: 2 }));
    const batchUpdate = vi.fn(async ({ data }) => ({
      ...batch,
      ...data,
      status: "queued" as const,
      failedCount: 0,
      retryableFailedCount: 0,
      retryCount: 1,
      completedAt: null,
      lastRetriedAt: now,
    }));
    const tx = {
      inboundWebhookReplayBatch: {
        findFirst: batchFindFirst,
        update: batchUpdate,
      },
      inboundWebhookReplayItem: {
        findMany: itemFindMany,
        updateMany: itemUpdateMany,
      },
      auditLog: {
        create: vi.fn(async () => undefined),
      },
    };
    const enqueueBatch = vi.fn(async () => ({
      jobId: "replay_batch_retry",
      status: "queued",
    }));
    const service = createService({
      prisma: {
        inboundWebhookConnection: {
          findFirst: vi.fn(async () => connection),
        },
        $transaction: vi.fn(async (callback) => callback(tx)),
      },
      replayQueue: { enqueueBatch },
    });

    await expect(
      service.retryTransientFailures(
        connectionId,
        batch.id,
        connection.displayName,
        owner,
        "127.0.0.1",
      ),
    ).resolves.toMatchObject({
      id: batch.id,
      status: "queued",
      retryCount: 1,
      failedCount: 0,
    });
    expect(itemFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId,
        batchId: batch.id,
        status: "failed",
        errorCode: {
          in: [
            "inbound_webhook_replay_disabled",
            "inbound_webhook_replay_queue_unavailable",
            "inbound_webhook_replay_unexpected",
          ],
        },
        event: {
          delivery: {
            payloadExpiresAt: { gt: expect.any(Date) },
            encryptedPayload: { not: null },
            payloadIv: { not: null },
            payloadTag: { not: null },
            encryptionKeyVersion: { not: null },
          },
        },
      }),
      select: { id: true },
    });
    expect(itemUpdateMany).toHaveBeenCalledWith({
      where: {
        workspaceId,
        batchId: batch.id,
        id: {
          in: ["item_retry_1", "item_retry_2"],
        },
      },
      data: {
        status: "queued",
        errorCode: null,
        processedAt: null,
      },
    });
    expect(enqueueBatch).toHaveBeenCalledWith({
      workspaceId,
      batchId: batch.id,
    });
  });

  it("materializes one event through existing lead and CAPI pipelines exactly once", async () => {
    const payload = readFileSync(
      resolve(__dirname, "fixtures/umbler/message-with-ctwa.json"),
    );
    const parsed = new InboundWebhookParserRegistry()
      .resolve({
        provider: "umbler",
        parserVersion: "v1",
        parserReleaseStatus: "certified",
      })
      .parse(JSON.parse(payload.toString("utf8"))).events[0]!;
    const itemState = {
      status: "queued",
      leadId: null as string | null,
      conversionEventLogId: null as string | null,
      errorCode: null as string | null,
      attemptCount: 0,
      lastAttemptedAt: null as Date | null,
      processedAt: null as Date | null,
    };
    const batch = {
      id: "batch_1",
      workspaceId,
      connectionId,
      requestedByUserId: owner.id,
      selection: "canary_1" as const,
      requestedLimit: 1,
      status: "queued",
      totalItems: 1,
      materializedCount: 0,
      duplicateCount: 0,
      skippedCount: 0,
      failedCount: 0,
      retryableFailedCount: 0,
      retryCount: 0,
      startedAt: null as Date | null,
      completedAt: null as Date | null,
      lastRetriedAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    };
    const replayItem = {
      id: "item_1",
      workspaceId,
      batchId: batch.id,
      eventId: "event_1",
      createdAt: now,
      updatedAt: now,
      ...itemState,
      event: {
        id: "event_1",
        workspaceId,
        connectionId,
        deliveryId: "delivery_1",
        channelId: "channel_1",
        provider: "umbler",
        externalEventId: parsed.externalEventId,
        externalMessageId: parsed.externalMessageId,
        dedupeKey: parsed.dedupeKey,
        occurredAt: parsed.occurredAt,
        contactIdentityHash: "stored-contact-hash",
        adId: parsed.adId,
        hasCtwa: true,
        classification: "eligible_route_resolved",
        classificationReason: "route_resolved",
        normalizedSummary: parsed.normalizedSummary,
        createdAt: now,
        updatedAt: now,
        resolvedBusinessConnectionWorkspaceId: workspaceId,
        resolvedBusinessConnectionId: "business_1",
        resolvedReportingAccountWorkspaceId: workspaceId,
        resolvedReportingAccountId: "reporting_1",
        resolvedConversionDestinationWorkspaceId: workspaceId,
        resolvedConversionDestinationId: "destination_1",
        delivery: {
          id: "delivery_1",
          workspaceId,
          connectionId,
          parserVersion: "v1",
          encryptedPayload: "ciphertext",
          payloadIv: "iv",
          payloadTag: "tag",
          encryptionKeyVersion: 1,
          payloadExpiresAt: new Date("2026-07-25T15:00:00.000Z"),
        },
        connection,
        resolvedBusinessConnection: {
          id: "business_1",
          workspaceId,
          status: "active",
          credential: {
            status: "active",
          },
        },
        resolvedReportingAccount: {
          id: "reporting_1",
          workspaceId,
          active: true,
          businessConnectionId: "business_1",
          adAccountId: "act_1",
        },
        resolvedConversionDestination: {
          id: "destination_1",
          workspaceId,
          status: "configured",
        },
        channel: {
          routes: [
            {
              metaBusinessConnectionId: "business_1",
              metaReportingAccountId: "reporting_1",
              metaConversionDestinationId: "destination_1",
            },
          ],
        },
      },
    };
    const itemUpdate = vi.fn(async ({ data }) => {
      const attemptIncrement = data.attemptCount?.increment ?? 0;
      Object.assign(itemState, {
        ...data,
        attemptCount: itemState.attemptCount + attemptIncrement,
      });
      return { ...replayItem, ...itemState };
    });
    const batchUpdate = vi.fn(async ({ data }) => {
      Object.assign(batch, data);
      return { ...batch };
    });
    const prisma = {
      inboundWebhookReplayBatch: {
        findFirst: vi.fn(async () => ({ ...batch })),
        update: batchUpdate,
      },
      inboundWebhookReplayItem: {
        findMany: vi.fn(async () =>
          ["queued", "processing"].includes(itemState.status)
            ? [{ id: replayItem.id }]
            : [],
        ),
        findFirst: vi.fn(async () => ({
          ...replayItem,
          ...itemState,
        })),
        update: itemUpdate,
        count: vi.fn(async ({ where }) =>
          itemState.status === where.status ? 1 : 0,
        ),
      },
      metaAd: {
        findFirst: vi.fn(async () => ({
          campaignId: "campaign_1",
          adSetId: "adset_1",
          adAccountId: "act_1",
        })),
      },
      auditLog: {
        create: vi.fn(async () => undefined),
      },
      $transaction: vi.fn(async (callback) => callback(prisma)),
    };
    const upsertLead = vi.fn(async () => ({ id: "lead_1" }));
    const recordConversion = vi.fn(
      async (_input: {
        sourcePayload: Record<string, unknown>;
        [key: string]: unknown;
      }) => ({
        conversionEventLogId: "conversion_1",
        status: "created",
        deliveryStatus: "ready_to_send",
      }),
    );
    const enqueueSend = vi.fn(async () => ({
      conversionEventLogId: "conversion_1",
      jobId: "conversion-send_conversion_1",
      status: "queued",
    }));
    const service = createService({
      prisma,
      payloadEncryption: {
        decrypt: vi.fn(() => payload),
      },
      leads: {
        upsertFromWhatsappWebhook: upsertLead,
      },
      conversions: {
        recordExternalConversion: recordConversion,
      },
      conversionQueue: {
        enqueueSend,
      },
    });

    const result = await service.processBatch({
      workspaceId,
      batchId: batch.id,
    });

    expect(result).toMatchObject({
      status: "completed",
      totalItems: 1,
      materializedCount: 1,
      duplicateCount: 0,
      failedCount: 0,
    });
    expect(upsertLead).toHaveBeenCalledOnce();
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        source: "umbler",
        preserveExistingSource: true,
        preserveEarliestFirstMessageAt: true,
        campaignId: "campaign_1",
        adSetId: "adset_1",
        adId: parsed.adId,
        occurredAt: parsed.occurredAt,
      }),
    );
    expect(recordConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        externalConnectorId: null,
        sourceTrigger: "inbound_webhook:umbler",
        eventName: "LeadSubmitted",
        leadId: "lead_1",
        businessSource: "paid",
        metaAccountId: "act_1",
        metaBusinessConnectionId: "business_1",
        metaConversionDestinationId: "destination_1",
        eventOccurredAt: parsed.occurredAt,
      }),
    );
    const conversionInput = recordConversion.mock.calls[0]![0];
    expect(JSON.stringify(conversionInput.sourcePayload)).not.toContain(
      parsed.contact.phoneNumber,
    );
    expect(JSON.stringify(conversionInput.sourcePayload)).not.toContain(
      parsed.contact.name,
    );
    expect(JSON.stringify(conversionInput.sourcePayload)).not.toContain(
      parsed.ctwaClid,
    );
    expect(enqueueSend).toHaveBeenCalledWith("conversion_1", workspaceId);

    await service.processBatch({
      workspaceId,
      batchId: batch.id,
    });
    expect(upsertLead).toHaveBeenCalledOnce();
    expect(recordConversion).toHaveBeenCalledOnce();
    expect(enqueueSend).toHaveBeenCalledOnce();
  });
});
