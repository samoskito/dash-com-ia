import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  InboundWebhookIngestionService,
  MAX_INBOUND_WEBHOOK_PAYLOAD_BYTES,
  matchesInboundWebhookSecret,
  parseInboundWebhookProviderAttempt,
} from "../src/inbound-webhooks/inbound-webhook-ingestion.service";
import { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";

const secret = "umbler-observation-secret";
const secretHash = createHash("sha256").update(secret).digest("hex");

function runtimeEnvironment(enabled = true) {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: String(enabled),
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString("base64"),
  };
}

function createHarness(options?: {
  connectionId?: string;
  status?: "observation" | "paused";
  removed?: boolean;
  secretHash?: string | null;
  featureEnabled?: boolean;
}) {
  const now = new Date("2026-07-17T20:00:00.000Z");
  const connection = {
    id: options?.connectionId ?? "connection_1",
    workspaceId: "workspace_safe",
    provider: "umbler" as const,
    displayName: "Umbler Teste",
    parserReleaseId: "inbound_parser_umbler_v1",
    secretHash:
      options && "secretHash" in options ? options.secretHash : secretHash,
    status: options?.status ?? ("observation" as const),
    createdByUserId: "user_1",
    lastDeliveryAt: null as Date | null,
    lastSuccessfulParseAt: null,
    removedAt: options?.removed ? now : null,
    createdAt: now,
    updatedAt: now,
    parserRelease: {
      id: "inbound_parser_umbler_v1",
      provider: "umbler" as const,
      version: "v1",
      status: "observation_only" as const,
      certifiedByUserId: null,
      certifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  };
  const deliveries = new Map<string, Record<string, any>>();
  let failPersistence = false;

  const deliveryKey = (connectionId: string, ingressKey: string) =>
    `${connectionId}:${ingressKey}`;
  const inboundWebhookConnection = {
    findUnique: vi.fn(async ({ where }) =>
      where.id === connection.id ? connection : null,
    ),
    findFirst: vi.fn(async ({ where }) =>
      where.id === connection.id &&
      where.workspaceId === connection.workspaceId &&
      where.secretHash === connection.secretHash &&
      where.status === "observation" &&
      connection.removedAt === null
        ? { id: connection.id }
        : null,
    ),
    updateMany: vi.fn(async ({ where, data }) => {
      if (
        where.id !== connection.id ||
        where.workspaceId !== connection.workspaceId ||
        where.secretHash !== connection.secretHash ||
        where.status !== "observation" ||
        connection.removedAt !== null
      ) {
        return { count: 0 };
      }

      Object.assign(connection, data);
      return { count: 1 };
    }),
  };
  const inboundWebhookDelivery = {
    findUnique: vi.fn(async ({ where, select }) => {
      const key = where.connectionId_ingressKey;
      const delivery = deliveries.get(
        deliveryKey(key.connectionId, key.ingressKey),
      );

      if (!delivery) {
        return null;
      }

      return select?.id ? { id: delivery.id } : delivery;
    }),
    create: vi.fn(async ({ data }) => {
      if (failPersistence) {
        throw new Error("database unavailable");
      }

      const key = deliveryKey(data.connectionId, data.ingressKey);

      if (deliveries.has(key)) {
        throw new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "6.19.3",
        });
      }

      const delivery = {
        attemptCount: 1,
        classification: null,
        queuedAt: null,
        processedAt: null,
        ...data,
      };
      deliveries.set(key, delivery);
      return delivery;
    }),
    update: vi.fn(async ({ where, data, select }) => {
      const key = where.connectionId_ingressKey;
      const mapKey = deliveryKey(key.connectionId, key.ingressKey);
      const delivery = deliveries.get(mapKey);

      if (!delivery) {
        throw new Error("missing delivery");
      }

      delivery.attemptCount += data.attemptCount.increment;
      delivery.lastReceivedAt = data.lastReceivedAt;
      if (data.providerAttempt !== undefined) {
        delivery.providerAttempt = data.providerAttempt;
      }
      deliveries.set(mapKey, delivery);

      return select?.id ? { id: delivery.id } : delivery;
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const delivery = [...deliveries.values()].find(
        (candidate) =>
          candidate.id === where.id &&
          candidate.connectionId === where.connectionId &&
          candidate.workspaceId === where.workspaceId &&
          candidate.status === where.status,
      );

      if (!delivery) {
        return { count: 0 };
      }

      Object.assign(delivery, data);
      return { count: 1 };
    }),
  };
  const prisma = {
    inboundWebhookConnection,
    inboundWebhookDelivery,
    $transaction: vi.fn(async (operation) => operation(prisma)),
  };
  const queue = {
    enqueueDelivery: vi.fn(async (input) => ({
      jobId: `inbound-webhook_${input.deliveryId}`,
      status: "queued" as const,
    })),
  };
  const env = runtimeEnvironment(options?.featureEnabled ?? true);
  const encryption = new InboundWebhookPayloadEncryptionService(env);
  const service = new InboundWebhookIngestionService(
    prisma as unknown as PrismaService,
    env,
    encryption,
    queue as never,
  );

  return {
    connection,
    deliveries,
    encryption,
    prisma,
    queue,
    service,
    failPersistence() {
      failPersistence = true;
    },
  };
}

function requestInput(
  rawBody: Buffer,
  overrides?: Partial<Parameters<InboundWebhookIngestionService["ingest"]>[0]>,
) {
  return {
    connectionId: "connection_1",
    token: secret,
    contentType: "application/json; charset=utf-8",
    providerAttempt: "1",
    rawBody,
    ...overrides,
  };
}

describe("inbound webhook ingestion service", () => {
  it("uses constant-length secret comparison and one generic missing response", async () => {
    expect(matchesInboundWebhookSecret(secretHash, secret)).toBe(true);
    expect(matchesInboundWebhookSecret(secretHash, "wrong")).toBe(false);
    expect(matchesInboundWebhookSecret(null, secret)).toBe(false);
    expect(matchesInboundWebhookSecret(secretHash, ["repeated", "token"])).toBe(
      false,
    );

    const cases = [
      createHarness({ connectionId: "another_connection" }),
      createHarness({ status: "paused" }),
      createHarness({ removed: true }),
      createHarness({ secretHash: null }),
      createHarness({ featureEnabled: false }),
    ];

    for (const harness of cases) {
      await expect(
        harness.service.ingest(
          requestInput(Buffer.from('{"EventId":"evt_auth"}'), {
            token:
              harness.connection.secretHash === secretHash ? "wrong" : secret,
          }),
        ),
      ).rejects.toMatchObject({
        status: 404,
        message: "Webhook nao encontrado",
      });
      expect(harness.deliveries.size).toBe(0);
    }
  });

  it("rejects non-JSON media, invalid JSON and oversized bytes before persistence", async () => {
    const harness = createHarness();

    await expect(
      harness.service.ingest(
        requestInput(Buffer.from("{}"), {
          contentType: "text/plain",
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      harness.service.ingest(requestInput(Buffer.from("{invalid"))),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      harness.service.ingest(
        requestInput(Buffer.alloc(MAX_INBOUND_WEBHOOK_PAYLOAD_BYTES + 1, 32)),
      ),
    ).rejects.toMatchObject({ status: 413 });

    expect(harness.deliveries.size).toBe(0);
    expect(harness.queue.enqueueDelivery).not.toHaveBeenCalled();
  });

  it("encrypts and persists a valid Umbler EventId under connection tenancy", async () => {
    const harness = createHarness();
    const privateMarker = "private-contact-marker";
    const rawBody = Buffer.from(
      JSON.stringify({
        Type: "MessageUpdated",
        EventId: "umbler_event_1",
        workspaceId: "workspace_from_untrusted_body",
        Payload: {
          phone: "+55 11 99999-0000",
          message: privateMarker,
        },
      }),
      "utf8",
    );

    const result = await harness.service.ingest(requestInput(rawBody));

    expect(result).toMatchObject({
      status: "accepted",
      duplicate: false,
      queueStatus: "queued",
    });
    const delivery = [...harness.deliveries.values()][0];
    expect(delivery.workspaceId).toBe("workspace_safe");
    expect(delivery.connectionId).toBe("connection_1");
    expect(delivery.ingressKey).toBe("umbler_event_1");
    expect(delivery.externalDeliveryId).toBe("umbler_event_1");
    expect(delivery.providerEventType).toBe("MessageUpdated");
    expect(delivery.status).toBe("queued");
    expect(delivery.payloadExpiresAt.getTime()).toBe(
      delivery.firstReceivedAt.getTime() + 7 * 24 * 60 * 60 * 1_000,
    );
    expect(JSON.stringify(delivery.normalizedSummary)).not.toContain(
      privateMarker,
    );
    expect(JSON.stringify(delivery.normalizedSummary)).not.toContain("99999");
    expect(delivery.encryptedPayload).not.toContain(privateMarker);
    expect(
      harness.encryption
        .decrypt(
          {
            encryptedPayload: delivery.encryptedPayload,
            payloadIv: delivery.payloadIv,
            payloadTag: delivery.payloadTag,
            encryptionKeyVersion: delivery.encryptionKeyVersion,
          },
          {
            workspaceId: delivery.workspaceId,
            connectionId: delivery.connectionId,
            deliveryId: delivery.id,
          },
        )
        .equals(rawBody),
    ).toBe(true);
    expect(harness.queue.enqueueDelivery).toHaveBeenCalledWith({
      deliveryId: result.deliveryId,
      connectionId: "connection_1",
      workspaceId: "workspace_safe",
    });
    expect(
      Object.keys(harness.queue.enqueueDelivery.mock.calls[0][0]).sort(),
    ).toEqual(["connectionId", "deliveryId", "workspaceId"]);
  });

  it("falls back to a raw-body hash for a malformed Umbler envelope", async () => {
    const harness = createHarness();
    const rawBody = Buffer.from(
      JSON.stringify({
        Type: "UnexpectedEnvelope",
        Payload: { synthetic: true },
      }),
    );

    await harness.service.ingest(requestInput(rawBody));

    const delivery = [...harness.deliveries.values()][0];
    expect(delivery.ingressKey).toBe(
      `raw:${createHash("sha256").update(rawBody).digest("hex")}`,
    );
    expect(delivery.externalDeliveryId).toBeNull();
    expect(delivery.providerEventType).toBe("UnexpectedEnvelope");
    expect(delivery.normalizedSummary).toEqual({
      identitySource: "raw_body_sha256",
      rawBodyLength: rawBody.length,
    });
  });

  it("increments duplicate attempts without creating or enqueueing twice", async () => {
    const harness = createHarness();
    const firstBody = Buffer.from(
      JSON.stringify({
        Type: "MessageUpdated",
        EventId: "umbler_event_duplicate",
        Payload: { version: 1 },
      }),
    );
    const retryBody = Buffer.from(
      JSON.stringify({
        Type: "MessageUpdated",
        EventId: "umbler_event_duplicate",
        Payload: { version: 2 },
      }),
    );

    const first = await harness.service.ingest(requestInput(firstBody));
    const retry = await harness.service.ingest(
      requestInput(retryBody, { providerAttempt: " 2 " }),
    );

    expect(first.duplicate).toBe(false);
    expect(retry).toMatchObject({
      deliveryId: first.deliveryId,
      duplicate: true,
      queueStatus: "existing",
    });
    expect(harness.deliveries.size).toBe(1);
    const delivery = [...harness.deliveries.values()][0];
    expect(delivery.attemptCount).toBe(2);
    expect(delivery.providerAttempt).toBe(2);
    expect(harness.queue.enqueueDelivery).toHaveBeenCalledTimes(1);
  });

  it("keeps a durable pending row when queue publication fails", async () => {
    const harness = createHarness();
    harness.queue.enqueueDelivery.mockRejectedValueOnce(
      new Error("redis unavailable"),
    );

    const result = await harness.service.ingest(
      requestInput(
        Buffer.from(
          JSON.stringify({
            Type: "MessageUpdated",
            EventId: "umbler_event_pending",
          }),
        ),
      ),
    );

    expect(result).toMatchObject({
      status: "accepted",
      duplicate: false,
      queueStatus: "pending",
    });
    const delivery = [...harness.deliveries.values()][0];
    expect(delivery.status).toBe("pending");
    expect(delivery.queuedAt).toBeNull();
    expect(delivery.encryptedPayload).toBeTruthy();
    expect(delivery.payloadIv).toBeTruthy();
    expect(delivery.payloadTag).toBeTruthy();
    expect(delivery.encryptionKeyVersion).toBe(1);
  });

  it("returns a sanitized non-2xx response when persistence fails", async () => {
    const harness = createHarness();
    harness.failPersistence();

    await expect(
      harness.service.ingest(
        requestInput(
          Buffer.from(
            JSON.stringify({
              Type: "MessageUpdated",
              EventId: "umbler_event_db_failure",
            }),
          ),
        ),
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: "Webhook temporariamente indisponivel",
    });
    expect(harness.queue.enqueueDelivery).not.toHaveBeenCalled();
  });

  it("sanitizes connection and idempotency lookup failures", async () => {
    const connectionLookup = createHarness();
    connectionLookup.prisma.inboundWebhookConnection.findUnique.mockRejectedValueOnce(
      new Error("connection lookup leaked detail"),
    );

    await expect(
      connectionLookup.service.ingest(
        requestInput(
          Buffer.from(
            JSON.stringify({
              Type: "MessageUpdated",
              EventId: "umbler_event_connection_lookup_failure",
            }),
          ),
        ),
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: "Webhook temporariamente indisponivel",
    });

    const deliveryLookup = createHarness();
    deliveryLookup.prisma.inboundWebhookDelivery.findUnique.mockRejectedValueOnce(
      new Error("delivery lookup leaked detail"),
    );

    await expect(
      deliveryLookup.service.ingest(
        requestInput(
          Buffer.from(
            JSON.stringify({
              Type: "MessageUpdated",
              EventId: "umbler_event_delivery_lookup_failure",
            }),
          ),
        ),
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: "Webhook temporariamente indisponivel",
    });
    expect(deliveryLookup.queue.enqueueDelivery).not.toHaveBeenCalled();
  });

  it("parses x-attempt conservatively", () => {
    expect(parseInboundWebhookProviderAttempt("1")).toBe(1);
    expect(parseInboundWebhookProviderAttempt(" 42 ")).toBe(42);
    expect(parseInboundWebhookProviderAttempt("0")).toBeNull();
    expect(parseInboundWebhookProviderAttempt("-1")).toBeNull();
    expect(parseInboundWebhookProviderAttempt("1.5")).toBeNull();
    expect(parseInboundWebhookProviderAttempt("1000000")).toBeNull();
    expect(parseInboundWebhookProviderAttempt(["2"])).toBeNull();
  });
});
