import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import type { InboundWebhookDiagnosticsService } from "../src/inbound-webhooks/inbound-webhook-diagnostics.service";
import type { InboundWebhookChannelRoutesService } from "../src/inbound-webhooks/inbound-webhook-channel-routes.service";
import { InboundWebhookObservationService } from "../src/inbound-webhooks/inbound-webhook-observation.service";
import type { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";
import type { InboundWebhookProductionIntakeService } from "../src/inbound-webhooks/inbound-webhook-production-intake.service";
import {
  buildInboundWebhookEventDedupeKey,
  type InboundWebhookParser,
  type InboundWebhookParserResult,
} from "../src/inbound-webhooks/providers/inbound-webhook-parser";
import { InboundWebhookParserRegistry } from "../src/inbound-webhooks/providers/inbound-webhook-parser.registry";

type MutableRecord = Record<string, any>;

type DiscoveryPayload = {
  eventId: string;
  messageId: string;
  organizationId: string;
  providerChannelId: string;
  connectedPhone: string;
  channelName: string | null;
};

class DiscoveryParser implements InboundWebhookParser {
  readonly provider = "umbler";
  readonly parserVersion = "v1";

  parse(payload: unknown): InboundWebhookParserResult {
    const input = payload as DiscoveryPayload;
    const occurredAt = new Date("2026-07-17T20:00:00.000Z");
    const connectedPhoneSuffix = input.connectedPhone
      .replace(/\D/g, "")
      .slice(-4);
    const classification = "ignored_no_ctwa" as const;
    const classificationReason = "ctwa_missing";

    return {
      provider: this.provider,
      parserVersion: this.parserVersion,
      externalDeliveryId: input.eventId,
      providerEventType: "Message",
      classification,
      classificationReason,
      events: [
        {
          provider: this.provider,
          providerEventType: "Message",
          externalEventId: input.eventId,
          externalMessageId: input.messageId,
          dedupeKey: buildInboundWebhookEventDedupeKey({
            provider: this.provider,
            organizationId: input.organizationId,
            providerChannelId: input.providerChannelId,
            externalMessageId: input.messageId,
          }),
          organizationId: input.organizationId,
          occurredAt,
          channel: {
            providerChannelId: input.providerChannelId,
            connectedPhone: input.connectedPhone,
            name: input.channelName,
          },
          contact: {
            externalContactId: `contact_${input.messageId}`,
            phoneNumber: "+15550001111",
            name: null,
          },
          message: {
            direction: "inbound",
            authorType: "contact",
            messageType: "Text",
            text: null,
            isPrivate: false,
          },
          adId: null,
          ad: null,
          ctwaClid: null,
          hasCtwa: false,
          classification,
          classificationReason,
          normalizedSummary: {
            provider: this.provider,
            providerEventType: "Message",
            externalEventId: input.eventId,
            externalMessageId: input.messageId,
            organizationId: input.organizationId,
            providerChannelId: input.providerChannelId,
            connectedPhoneSuffix,
            occurredAt: occurredAt.toISOString(),
            adId: null,
            hasCtwa: false,
            messageDirection: "inbound",
            messageAuthorType: "contact",
            messageType: "Text",
            classification,
            classificationReason,
          },
        },
      ],
      normalizedSummary: {
        provider: this.provider,
        parserVersion: this.parserVersion,
        providerEventType: "Message",
        externalDeliveryId: input.eventId,
        classification,
        classificationReason,
        eventCount: 1,
      },
      error: null,
    };
  }
}

function createHarness() {
  const deliveries = new Map<string, MutableRecord>();
  const connections = new Map<string, MutableRecord>();
  const channels = new Map<string, MutableRecord>();
  const events = new Map<string, MutableRecord>();
  const payloads = new Map<string, DiscoveryPayload>();
  let channelSequence = 0;

  const addConnection = (id: string) => {
    connections.set(id, {
      id,
      workspaceId: "workspace_1",
      provider: "umbler",
      parserReleaseId: `release_${id}`,
      status: "observation",
      removedAt: null,
      lastSuccessfulParseAt: null,
      parserRelease: {
        id: `release_${id}`,
        provider: "umbler",
        version: "v1",
        status: "observation_only",
      },
    });
  };
  const addDelivery = (
    id: string,
    connectionId: string,
    payload: DiscoveryPayload,
  ) => {
    deliveries.set(id, {
      id,
      workspaceId: "workspace_1",
      connectionId,
      provider: "umbler",
      parserVersion: "v1",
      status: "queued",
      classification: null,
      encryptedPayload: `encrypted_${id}`,
      payloadIv: "payload_iv",
      payloadTag: "payload_tag",
      encryptionKeyVersion: 1,
      payloadExpiresAt: new Date("2026-07-24T20:00:00.000Z"),
      normalizedSummary: null,
      parseErrorCode: null,
      routingErrorCode: null,
      processedAt: null,
      updatedAt: new Date("2026-07-17T20:00:00.000Z"),
    });
    payloads.set(id, payload);
  };

  addConnection("connection_1");
  addConnection("connection_2");

  const prisma = {
    inboundWebhookDelivery: {
      findFirst: vi.fn(async ({ where }: MutableRecord) => {
        const delivery = deliveries.get(where.id);
        const connection = delivery
          ? connections.get(delivery.connectionId)
          : null;

        return delivery &&
          connection &&
          delivery.workspaceId === where.workspaceId &&
          delivery.connectionId === where.connectionId
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
        const statuses =
          typeof where.status === "string" ? [where.status] : where.status?.in;

        if (
          !delivery ||
          delivery.workspaceId !== where.workspaceId ||
          delivery.connectionId !== where.connectionId ||
          (statuses && !statuses.includes(delivery.status))
        ) {
          return { count: 0 };
        }

        Object.assign(delivery, data);
        return { count: 1 };
      }),
    },
    inboundWebhookConnection: {
      findFirst: vi.fn(async ({ where }: MutableRecord) => {
        const connection = connections.get(where.id);
        return connection &&
          connection.workspaceId === where.workspaceId &&
          connection.parserReleaseId === where.parserReleaseId &&
          matchesStatus(connection.status, where.status) &&
          connection.removedAt === where.removedAt
          ? { id: connection.id }
          : null;
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
    },
    inboundWebhookChannel: {
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
    },
    inboundWebhookEvent: {
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
    },
    $transaction: vi.fn(async (operation: (tx: unknown) => unknown) =>
      operation(prisma),
    ),
  };
  const encryption = {
    decrypt: vi.fn((_payload: unknown, context: { deliveryId: string }) =>
      Buffer.from(JSON.stringify(payloads.get(context.deliveryId)), "utf8"),
    ),
  };
  const diagnostics = {
    recordObservation: vi.fn(async () => undefined),
  };
  const channelRoutes = {
    reevaluateUnresolvedEvents: vi.fn(async () => undefined),
  };
  const productionIntake = {
    enqueueDelivery: vi.fn(async () => undefined),
  };
  const providerConversions = {
    observeDelivery: vi.fn(async () => ({
      executionIds: [],
      eligibleExecutionIds: [],
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
    new InboundWebhookParserRegistry([new DiscoveryParser()]),
    diagnostics as unknown as InboundWebhookDiagnosticsService,
    channelRoutes as unknown as InboundWebhookChannelRoutesService,
    productionIntake as unknown as InboundWebhookProductionIntakeService,
    providerConversions as never,
    productionQueue as never,
  );

  return {
    addDelivery,
    channels,
    connections,
    deliveries,
    events,
    service,
  };
}

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

describe("inbound webhook channel discovery", () => {
  it("discovers several channels and updates mutable metadata without duplicates", async () => {
    const harness = createHarness();
    harness.addDelivery("delivery_1", "connection_1", {
      eventId: "provider_event_1",
      messageId: "message_1",
      organizationId: "organization_1",
      providerChannelId: "provider_channel_1",
      connectedPhone: "+15550002222",
      channelName: "Support",
    });
    harness.addDelivery("delivery_2", "connection_1", {
      eventId: "provider_event_2",
      messageId: "message_2",
      organizationId: "organization_1",
      providerChannelId: "provider_channel_2",
      connectedPhone: "+15550003333",
      channelName: "Sales",
    });
    harness.addDelivery("delivery_3", "connection_1", {
      eventId: "provider_event_3",
      messageId: "message_3",
      organizationId: "organization_1",
      providerChannelId: "provider_channel_1",
      connectedPhone: "+15550004444",
      channelName: "Priority Support",
    });

    for (const deliveryId of ["delivery_1", "delivery_2", "delivery_3"]) {
      await harness.service.processDelivery({
        deliveryId,
        workspaceId: "workspace_1",
        connectionId: "connection_1",
      });
    }

    expect(harness.channels).toHaveLength(2);
    expect(
      harness.channels.get("connection_1:organization_1:provider_channel_1"),
    ).toMatchObject({
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      organizationId: "organization_1",
      providerChannelId: "provider_channel_1",
      connectedPhone: "+15550004444",
      channelName: "Priority Support",
      status: "discovered",
    });
    expect(
      harness.channels.get("connection_1:organization_1:provider_channel_1")
        ?.lastSeenAt,
    ).toBeInstanceOf(Date);
    expect(harness.events).toHaveLength(3);
  });

  it("isolates the same provider channel identity by connection", async () => {
    const harness = createHarness();
    const channelIdentity = {
      organizationId: "organization_1",
      providerChannelId: "provider_channel_shared",
      connectedPhone: "+15550002222",
      channelName: "Shared Provider Label",
    };
    harness.addDelivery("delivery_1", "connection_1", {
      eventId: "provider_event_1",
      messageId: "message_1",
      ...channelIdentity,
    });
    harness.addDelivery("delivery_2", "connection_2", {
      eventId: "provider_event_2",
      messageId: "message_2",
      ...channelIdentity,
    });

    await harness.service.processDelivery({
      deliveryId: "delivery_1",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
    });
    await harness.service.processDelivery({
      deliveryId: "delivery_2",
      workspaceId: "workspace_1",
      connectionId: "connection_2",
    });

    expect(harness.channels).toHaveLength(2);
    expect(
      harness.channels.get(
        "connection_1:organization_1:provider_channel_shared",
      )?.id,
    ).not.toBe(
      harness.channels.get(
        "connection_2:organization_1:provider_channel_shared",
      )?.id,
    );
  });
});
