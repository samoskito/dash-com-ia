import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { InboundWebhookJobPayload } from "../src/common/queue/queue.constants";
import { hashPhoneIdentity } from "../src/common/phone/phone-identity";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import type { InboundWebhookDiagnosticsService } from "../src/inbound-webhooks/inbound-webhook-diagnostics.service";
import type { InboundWebhookChannelRoutesService } from "../src/inbound-webhooks/inbound-webhook-channel-routes.service";
import {
  InboundWebhookObservationError,
  InboundWebhookObservationService,
} from "../src/inbound-webhooks/inbound-webhook-observation.service";
import { InboundWebhookProcessor } from "../src/inbound-webhooks/inbound-webhook.processor";
import type { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";
import type { InboundWebhookProductionIntakeService } from "../src/inbound-webhooks/inbound-webhook-production-intake.service";
import {
  buildInboundWebhookEventDedupeKey,
  type InboundWebhookParser,
} from "../src/inbound-webhooks/providers/inbound-webhook-parser";
import { InboundWebhookParserRegistry } from "../src/inbound-webhooks/providers/inbound-webhook-parser.registry";
import { UmblerV1Parser } from "../src/inbound-webhooks/providers/umbler/umbler-v1.parser";
import type { UmblerV1Envelope } from "../src/inbound-webhooks/providers/umbler/umbler-v1.types";

const fixturePath = resolve(
  __dirname,
  "fixtures",
  "umbler",
  "message-with-ctwa.json",
);

function loadFixture(): UmblerV1Envelope {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as UmblerV1Envelope;
}

type MutableRecord = Record<string, any>;

function matchesStatus(
  actual: string,
  expected: string | { in?: string[] } | undefined,
): boolean {
  if (!expected) {
    return true;
  }

  return typeof expected === "string"
    ? actual === expected
    : (expected.in?.includes(actual) ?? true);
}

function createHarness(parser?: InboundWebhookParser) {
  const deliveries = new Map<string, MutableRecord>();
  const connections = new Map<string, MutableRecord>();
  const channels = new Map<string, MutableRecord>();
  const events = new Map<string, MutableRecord>();
  const rawPayloads = new Map<string, unknown>();
  let channelSequence = 0;

  const addConnection = (
    id: string,
    workspaceId = "workspace_1",
    overrides: MutableRecord = {},
  ) => {
    const connection = {
      id,
      workspaceId,
      provider: "umbler",
      displayName: `Connection ${id}`,
      parserReleaseId: `parser_release_${id}`,
      status: "observation",
      removedAt: null,
      lastSuccessfulParseAt: null,
      parserRelease: {
        id: `parser_release_${id}`,
        provider: "umbler",
        version: "v1",
        status: "observation_only",
      },
      ...overrides,
    };
    connections.set(id, connection);
    return connection;
  };

  addConnection("connection_1");

  const addDelivery = (
    id: string,
    payload: unknown,
    overrides: MutableRecord = {},
  ) => {
    const connectionId = overrides.connectionId ?? "connection_1";
    const connection = connections.get(connectionId);

    if (!connection) {
      throw new Error("Test connection is missing");
    }

    const delivery = {
      id,
      workspaceId: overrides.workspaceId ?? connection.workspaceId,
      connectionId,
      provider: "umbler",
      ingressKey: `ingress_${id}`,
      externalDeliveryId: null,
      providerEventType: null,
      parserVersion: "v1",
      status: "queued",
      classification: null,
      encryptedPayload: `encrypted_${id}`,
      payloadIv: "payload_iv",
      payloadTag: "payload_tag",
      encryptionKeyVersion: 1,
      payloadExpiresAt: new Date("2026-07-24T20:00:00.000Z"),
      normalizedSummary: {
        identitySource: "provider_event_id",
      },
      parseErrorCode: null,
      routingErrorCode: null,
      processedAt: null,
      providerConversionsObservedAt: null,
      updatedAt: new Date("2026-07-17T20:00:00.000Z"),
      ...overrides,
    };
    deliveries.set(id, delivery);
    rawPayloads.set(id, payload);
    return delivery;
  };

  const inboundWebhookDelivery = {
    findFirst: vi.fn(async ({ where }: MutableRecord) => {
      const delivery = deliveries.get(where.id);

      if (
        !delivery ||
        delivery.workspaceId !== where.workspaceId ||
        delivery.connectionId !== where.connectionId
      ) {
        return null;
      }

      const connection = connections.get(delivery.connectionId);

      return connection
        ? {
            ...delivery,
            workspace: { id: delivery.workspaceId },
            connection: {
              ...connection,
              parserRelease: { ...connection.parserRelease },
            },
          }
        : null;
    }),
    updateMany: vi.fn(async ({ where, data }: MutableRecord) => {
      const delivery = deliveries.get(where.id);

      if (
        !delivery ||
        delivery.workspaceId !== where.workspaceId ||
        delivery.connectionId !== where.connectionId ||
        (where.updatedAt &&
          delivery.updatedAt.getTime() !== where.updatedAt.getTime()) ||
        !matchesStatus(delivery.status, where.status)
      ) {
        return { count: 0 };
      }

      Object.assign(
        delivery,
        Object.fromEntries(
          Object.entries(data).filter(([, value]) => value !== undefined),
        ),
      );
      return { count: 1 };
    }),
  };
  const inboundWebhookConnection = {
    findFirst: vi.fn(async ({ where }: MutableRecord) => {
      const connection = connections.get(where.id);

      if (
        !connection ||
        connection.workspaceId !== where.workspaceId ||
        connection.parserReleaseId !== where.parserReleaseId ||
        !matchesStatus(connection.status, where.status) ||
        connection.removedAt !== where.removedAt
      ) {
        return null;
      }

      return { id: connection.id };
    }),
    updateMany: vi.fn(async ({ where, data }: MutableRecord) => {
      const connection = connections.get(where.id);

      if (
        !connection ||
        connection.workspaceId !== where.workspaceId ||
        connection.parserReleaseId !== where.parserReleaseId ||
        !matchesStatus(connection.status, where.status) ||
        connection.removedAt !== where.removedAt
      ) {
        return { count: 0 };
      }

      Object.assign(connection, data);
      return { count: 1 };
    }),
  };
  const inboundWebhookChannel = {
    upsert: vi.fn(async ({ where, create, update }: MutableRecord) => {
      const identity = where.connectionId_organizationId_providerChannelId;
      const key = [
        identity.connectionId,
        identity.organizationId,
        identity.providerChannelId,
      ].join(":");
      const existing = channels.get(key);

      if (existing) {
        Object.assign(existing, update);
        return { ...existing };
      }

      const channel = {
        id: `channel_${++channelSequence}`,
        ...create,
      };
      channels.set(key, channel);
      return { ...channel };
    }),
  };
  const inboundWebhookEvent = {
    createMany: vi.fn(async ({ data }: MutableRecord) => {
      let count = 0;

      for (const event of data as MutableRecord[]) {
        const key = `${event.connectionId}:${event.dedupeKey}`;

        if (!events.has(key)) {
          events.set(key, { ...event });
          count += 1;
        }
      }

      return { count };
    }),
    findMany: vi.fn(async ({ where }: MutableRecord) =>
      [...events.values()]
        .filter(
          (event) =>
            event.workspaceId === where.workspaceId &&
            event.connectionId === where.connectionId &&
            event.deliveryId === where.deliveryId &&
            (!where.classification?.in ||
              where.classification.in.includes(event.classification)),
        )
        .map((event) => ({ channelId: event.channelId })),
    ),
  };
  const prisma = {
    inboundWebhookDelivery,
    inboundWebhookConnection,
    inboundWebhookChannel,
    inboundWebhookEvent,
    $transaction: vi.fn(async (operation: (tx: unknown) => unknown) =>
      operation(prisma),
    ),
  };
  const encryption = {
    decrypt: vi.fn(
      (
        _payload: unknown,
        context: {
          workspaceId: string;
          connectionId: string;
          deliveryId: string;
        },
      ) => {
        const payload = rawPayloads.get(context.deliveryId);

        if (payload === undefined) {
          throw new Error("Missing test payload");
        }

        return Buffer.from(JSON.stringify(payload), "utf8");
      },
    ),
  };
  const diagnostics = {
    recordObservation: vi.fn(
      async (
        _input: Parameters<
          InboundWebhookDiagnosticsService["recordObservation"]
        >[0],
      ) => undefined,
    ),
  };
  const registry = new InboundWebhookParserRegistry(
    parser ? [parser] : undefined,
  );
  const channelRoutes = {
    reevaluateUnresolvedEvents: vi.fn(async () => undefined),
  };
  const productionIntake = {
    enqueueDelivery: vi.fn(async () => undefined),
  };
  const providerConversions = {
    observeDelivery: vi.fn(async () => ({
      executionIds: [] as string[],
      eligibleExecutionIds: [] as string[],
    })),
  };
  const productionQueue = {
    enqueueProviderConversion: vi.fn(async () => ({
      jobId: "provider-conversion-test",
      status: "queued" as const,
    })),
  };
  const service = new InboundWebhookObservationService(
    prisma as unknown as PrismaService,
    encryption as unknown as InboundWebhookPayloadEncryptionService,
    registry,
    diagnostics as unknown as InboundWebhookDiagnosticsService,
    channelRoutes as unknown as InboundWebhookChannelRoutesService,
    productionIntake as unknown as InboundWebhookProductionIntakeService,
    providerConversions as never,
    productionQueue as never,
  );

  return {
    addConnection,
    addDelivery,
    channels,
    connections,
    deliveries,
    diagnostics,
    encryption,
    events,
    prisma,
    productionQueue,
    providerConversions,
    service,
  };
}

function jobPayload(
  overrides: Partial<InboundWebhookJobPayload> = {},
): InboundWebhookJobPayload {
  return {
    deliveryId: "delivery_1",
    connectionId: "connection_1",
    workspaceId: "workspace_1",
    ...overrides,
  };
}

class MultiEventParser implements InboundWebhookParser {
  readonly provider = "umbler";
  readonly parserVersion = "v1";
  private readonly base = new UmblerV1Parser();

  parse(payload: unknown) {
    const result = this.base.parse(payload);
    const first = result.events[0]!;
    const secondChannelId = "channel_fixture_002";
    const secondMessageId = "message_fixture_002";
    const second = {
      ...first,
      externalMessageId: secondMessageId,
      dedupeKey: buildInboundWebhookEventDedupeKey({
        provider: this.provider,
        organizationId: first.organizationId,
        providerChannelId: secondChannelId,
        externalMessageId: secondMessageId,
      }),
      channel: {
        providerChannelId: secondChannelId,
        connectedPhone: "+15550003333",
        name: "Synthetic Sales Channel",
      },
      normalizedSummary: {
        ...first.normalizedSummary,
        externalMessageId: secondMessageId,
        providerChannelId: secondChannelId,
        connectedPhoneSuffix: "3333",
      },
    };

    return {
      ...result,
      events: [first, second],
      normalizedSummary: {
        ...result.normalizedSummary,
        eventCount: 2,
      },
    };
  }
}

describe("inbound webhook observation processor", () => {
  it("delegates BullMQ jobs using the identifier-only payload", async () => {
    const observation = {
      processDelivery: vi.fn(async (_input: InboundWebhookJobPayload) => ({
        deliveryId: "delivery_1",
        status: "processed" as const,
        classification: "ignored_no_ctwa" as const,
        parsedEventCount: 1,
        persistedEventCount: 1,
        idempotent: false,
      })),
    };
    const processor = new InboundWebhookProcessor(observation as never);
    const data = jobPayload();

    await processor.process({ data } as never);

    expect(observation.processDelivery).toHaveBeenCalledWith(data);
    expect(
      Object.keys(observation.processDelivery.mock.calls[0][0]).sort(),
    ).toEqual(["connectionId", "deliveryId", "workspaceId"]);
  });

  it("claims, decrypts with tenant-bound AES context and persists only redacted observation data", async () => {
    const harness = createHarness();
    const body = loadFixture();
    harness.addDelivery("delivery_1", body);

    const result = await harness.service.processDelivery(jobPayload());

    expect(result).toMatchObject({
      deliveryId: "delivery_1",
      status: "processed",
      classification: "eligible_route_unresolved",
      parsedEventCount: 1,
      persistedEventCount: 1,
      idempotent: false,
    });
    expect(harness.encryption.decrypt).toHaveBeenCalledWith(
      {
        encryptedPayload: "encrypted_delivery_1",
        payloadIv: "payload_iv",
        payloadTag: "payload_tag",
        encryptionKeyVersion: 1,
      },
      {
        workspaceId: "workspace_1",
        connectionId: "connection_1",
        deliveryId: "delivery_1",
      },
    );
    expect(
      harness.prisma.inboundWebhookDelivery.updateMany.mock.calls[0][0],
    ).toMatchObject({
      where: {
        id: "delivery_1",
        workspaceId: "workspace_1",
        connectionId: "connection_1",
        updatedAt: new Date("2026-07-17T20:00:00.000Z"),
        status: { in: ["pending", "queued", "processing"] },
      },
      data: {
        status: "processing",
        updatedAt: expect.any(Date),
      },
    });

    const delivery = harness.deliveries.get("delivery_1")!;
    const persistedEvent = [...harness.events.values()][0]!;
    expect(delivery).toMatchObject({
      status: "processed",
      classification: "eligible_route_unresolved",
      parseErrorCode: null,
      routingErrorCode: null,
      providerConversionsObservedAt: expect.any(Date),
    });
    expect(delivery.processedAt).toBeInstanceOf(Date);
    expect(delivery.normalizedSummary).toEqual(
      new UmblerV1Parser().parse(body).normalizedSummary,
    );
    expect(
      harness.connections.get("connection_1")?.lastSuccessfulParseAt,
    ).toBeInstanceOf(Date);
    expect(persistedEvent).toMatchObject({
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      deliveryId: "delivery_1",
      provider: "umbler",
      contactIdentityHash: hashPhoneIdentity(
        body.Payload.Content.Contact.PhoneNumber,
      ),
      adId: body.Payload.Content.LastMessage.Ad?.SourceId,
      hasCtwa: true,
      classification: "eligible_route_unresolved",
    });
    expect(persistedEvent).not.toHaveProperty("ctwaClid");
    expect(persistedEvent).not.toHaveProperty("contact");
    expect(persistedEvent).not.toHaveProperty("ad");

    expect(harness.diagnostics.recordObservation).toHaveBeenCalledOnce();
    const diagnosticInput =
      harness.diagnostics.recordObservation.mock.calls[0][0];
    expect(diagnosticInput).toMatchObject({
      workspaceId: "workspace_1",
      deliveryId: "delivery_1",
      connectionId: "connection_1",
      eventType: "Message",
      parserVersion: "v1",
      classification: "eligible_route_unresolved",
      processingStatus: "processed",
    });

    const redactedPersistence = JSON.stringify({
      delivery: delivery.normalizedSummary,
      event: persistedEvent,
      diagnostic: diagnosticInput,
    });

    for (const forbidden of [
      body.Payload.Content.LastMessage.Ad?.CTWaCLId,
      body.Payload.Content.LastMessage.Content,
      body.Payload.Content.Contact.PhoneNumber,
      body.Payload.Content.LastMessage.Ad?.SourceUrl,
      body.Payload.Content.LastMessage.Ad?.ThumbnailUrl,
      body.Payload.Content.LastMessage.Ad?.MediaUrl,
    ]) {
      expect(redactedPersistence).not.toContain(forbidden);
    }

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "processed",
      idempotent: true,
    });
    expect(harness.encryption.decrypt).toHaveBeenCalledOnce();
    expect(harness.events).toHaveLength(1);
    expect(harness.diagnostics.recordObservation).toHaveBeenCalledOnce();
  });

  it("processes a Gupshup delivery as raw observation without creating canonical events", async () => {
    const harness = createHarness();
    harness.addConnection("connection_gupshup", "workspace_1", {
      provider: "gupshup",
      parserReleaseId: "parser_release_gupshup",
      parserRelease: {
        id: "parser_release_gupshup",
        provider: "gupshup",
        version: "v1",
        status: "observation_only",
      },
    });
    harness.addDelivery(
      "delivery_gupshup",
      {
        app: "client-app",
        timestamp: 1_721_111_222_333,
        version: 2,
        type: "message",
        payload: {
          id: "wamid.gupshup-observation-1",
          source: "5511999990000",
          type: "text",
          payload: {
            text: "Mensagem privada",
          },
        },
      },
      {
        connectionId: "connection_gupshup",
        provider: "gupshup",
      },
    );

    const result = await harness.service.processDelivery({
      deliveryId: "delivery_gupshup",
      connectionId: "connection_gupshup",
      workspaceId: "workspace_1",
    });

    expect(result).toEqual({
      deliveryId: "delivery_gupshup",
      status: "processed",
      classification: "unsupported_event",
      parsedEventCount: 0,
      persistedEventCount: 0,
      idempotent: false,
    });
    expect(harness.events.size).toBe(0);
    expect(harness.channels.size).toBe(0);
    expect(harness.deliveries.get("delivery_gupshup")).toMatchObject({
      status: "processed",
      classification: "unsupported_event",
      providerEventType: "message",
      externalDeliveryId: "wamid.gupshup-observation-1",
      parseErrorCode: null,
      routingErrorCode: null,
    });
    expect(harness.diagnostics.recordObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gupshup",
        eventType: "message",
        eventCount: 0,
      }),
    );
  });

  it("rejects cross-tenant or cross-connection jobs before decrypting", async () => {
    const harness = createHarness();
    harness.addDelivery("delivery_1", loadFixture());

    for (const payload of [
      jobPayload({ workspaceId: "workspace_other" }),
      jobPayload({ connectionId: "connection_other" }),
    ]) {
      await expect(
        harness.service.processDelivery(payload),
      ).rejects.toMatchObject({
        code: "inbound_webhook_context_invalid",
      });
    }

    expect(harness.encryption.decrypt).not.toHaveBeenCalled();
    expect(harness.deliveries.get("delivery_1")?.status).toBe("queued");
  });

  it("keeps an unsupported parser release inspectable without decrypting", async () => {
    const harness = createHarness();
    const connection = harness.connections.get("connection_1")!;
    connection.parserRelease = {
      ...connection.parserRelease,
      status: "retired",
    };
    harness.addDelivery("delivery_1", loadFixture());

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "failed",
      classification: null,
      parsedEventCount: 0,
      persistedEventCount: 0,
    });

    expect(harness.encryption.decrypt).not.toHaveBeenCalled();
    expect(harness.deliveries.get("delivery_1")).toMatchObject({
      status: "failed",
      parseErrorCode: "inbound_webhook_parser_retired",
    });
    expect(harness.deliveries.get("delivery_1")?.processedAt).toBeInstanceOf(
      Date,
    );
    expect(
      harness.connections.get("connection_1")?.lastSuccessfulParseAt,
    ).toBeNull();
  });

  it("persists zero or multiple canonical events from an allowlisted parser", async () => {
    const zeroHarness = createHarness();
    const unsupported = loadFixture();
    unsupported.Type = "ContactUpdated";
    zeroHarness.addDelivery("delivery_1", unsupported);

    await expect(
      zeroHarness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "processed",
      classification: "unsupported_event",
      parsedEventCount: 0,
      persistedEventCount: 0,
    });
    expect(zeroHarness.events).toHaveLength(0);

    const multipleHarness = createHarness(new MultiEventParser());
    multipleHarness.addDelivery("delivery_1", loadFixture());

    await expect(
      multipleHarness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "processed",
      parsedEventCount: 2,
      persistedEventCount: 2,
    });
    expect(multipleHarness.events).toHaveLength(2);
    expect(multipleHarness.channels).toHaveLength(2);
  });

  it("deduplicates the same canonical message across different deliveries", async () => {
    const harness = createHarness();
    const first = loadFixture();
    const repeated = loadFixture();
    repeated.EventId = "delivery_fixture_retry_002";
    harness.addDelivery("delivery_1", first);
    harness.addDelivery("delivery_2", repeated);

    await harness.service.processDelivery(jobPayload());
    const second = await harness.service.processDelivery(
      jobPayload({ deliveryId: "delivery_2" }),
    );

    expect(second).toMatchObject({
      status: "processed",
      parsedEventCount: 1,
      persistedEventCount: 0,
    });
    expect(harness.events).toHaveLength(1);
    expect(harness.deliveries.get("delivery_2")).toMatchObject({
      status: "processed",
      classification: "eligible_route_unresolved",
    });
  });

  it("marks deterministic parser failures as inspectable failed deliveries", async () => {
    const harness = createHarness();
    const malformed = loadFixture();
    const privateMarker = "private_parser_failure_marker";
    (
      malformed.Payload.Content.LastMessage as unknown as {
        Id: unknown;
      }
    ).Id = { privateMarker };
    harness.addDelivery("delivery_1", malformed);

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "failed",
      classification: "invalid_payload",
      parsedEventCount: 0,
      persistedEventCount: 0,
    });

    const delivery = harness.deliveries.get("delivery_1")!;
    expect(delivery).toMatchObject({
      status: "failed",
      classification: "invalid_payload",
      parseErrorCode: "umbler_v1_invalid_payload",
    });
    expect(delivery.processedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(delivery.normalizedSummary)).not.toContain(
      privateMarker,
    );
    expect(
      harness.connections.get("connection_1")?.lastSuccessfulParseAt,
    ).toBeNull();
    expect(harness.events).toHaveLength(0);
    expect(
      JSON.stringify(harness.diagnostics.recordObservation.mock.calls[0][0]),
    ).not.toContain(privateMarker);
  });

  it("finishes processing once even when diagnostic persistence fails", async () => {
    const harness = createHarness();
    harness.addDelivery("delivery_1", loadFixture());
    harness.diagnostics.recordObservation.mockRejectedValueOnce(
      new Error("diagnostics unavailable"),
    );

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "processed",
      idempotent: false,
    });
    await expect(
      harness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "processed",
      idempotent: true,
    });

    expect(harness.encryption.decrypt).toHaveBeenCalledOnce();
    expect(harness.events).toHaveLength(1);
    expect(harness.diagnostics.recordObservation).toHaveBeenCalledOnce();
  });

  it("retries provider conversion observation after the delivery was persisted", async () => {
    const harness = createHarness();
    harness.addDelivery("delivery_1", loadFixture());
    harness.providerConversions.observeDelivery.mockRejectedValueOnce(
      new Error("temporary provider conversion failure"),
    );

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).rejects.toMatchObject({
      code: "inbound_webhook_provider_conversion_deferred",
    });
    expect(harness.deliveries.get("delivery_1")).toMatchObject({
      status: "processed",
      providerConversionsObservedAt: null,
    });

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "processed",
      idempotent: true,
    });

    expect(harness.providerConversions.observeDelivery).toHaveBeenCalledTimes(
      2,
    );
    expect(harness.encryption.decrypt).toHaveBeenCalledTimes(2);
    expect(harness.deliveries.get("delivery_1")).toMatchObject({
      status: "processed",
      providerConversionsObservedAt: expect.any(Date),
    });
  });

  it("forces provider conversion recovery for an already observed delivery", async () => {
    const harness = createHarness();
    const observedAt = new Date("2026-07-23T13:40:00.000Z");
    harness.addDelivery("delivery_1", loadFixture(), {
      status: "processed",
      classification: "eligible_route_resolved",
      providerConversionsObservedAt: observedAt,
    });
    harness.providerConversions.observeDelivery.mockResolvedValueOnce({
      executionIds: ["execution_1"],
      eligibleExecutionIds: ["execution_1"],
    });

    await expect(
      harness.service.processDelivery(
        jobPayload({ forceProviderConversions: true }),
      ),
    ).resolves.toMatchObject({
      status: "processed",
      idempotent: true,
    });

    expect(harness.providerConversions.observeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: "delivery_1",
        manualRecovery: true,
      }),
    );
    expect(
      harness.productionQueue.enqueueProviderConversion,
    ).toHaveBeenCalledWith({
      providerConversionExecutionId: "execution_1",
      workspaceId: "workspace_1",
    });
    expect(harness.encryption.decrypt).toHaveBeenCalledOnce();
    expect(
      harness.deliveries.get("delivery_1")?.providerConversionsObservedAt,
    ).not.toBe(observedAt);
  });

  it("reclaims a processing delivery after a transient database failure", async () => {
    const harness = createHarness();
    harness.addDelivery("delivery_1", loadFixture());
    harness.prisma.inboundWebhookConnection.findFirst.mockRejectedValueOnce(
      new Error("temporary database failure"),
    );

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).rejects.toMatchObject({
      code: "inbound_webhook_processing_state_changed",
    });
    expect(harness.deliveries.get("delivery_1")?.status).toBe("processing");
    expect(harness.encryption.decrypt).not.toHaveBeenCalled();

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).resolves.toMatchObject({
      status: "processed",
      idempotent: false,
    });
    expect(harness.encryption.decrypt).toHaveBeenCalledOnce();
    expect(harness.deliveries.get("delivery_1")?.status).toBe("processed");
  });

  it("exposes only a safe error code for an invalid job context", async () => {
    const harness = createHarness();

    await expect(
      harness.service.processDelivery(jobPayload()),
    ).rejects.toBeInstanceOf(InboundWebhookObservationError);

    try {
      await harness.service.processDelivery(jobPayload());
    } catch (error) {
      expect(error).toMatchObject({
        code: "inbound_webhook_context_invalid",
        message: "Inbound webhook processing context is invalid",
      });
      expect(String(error)).not.toContain("workspace_1");
      expect(String(error)).not.toContain("connection_1");
      expect(String(error)).not.toContain("delivery_1");
    }
  });
});
