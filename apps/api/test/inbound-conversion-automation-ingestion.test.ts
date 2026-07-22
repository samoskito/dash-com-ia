import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { InboundConversionAutomationIngestionService } from "../src/inbound-webhooks/inbound-conversion-automation-ingestion.service";
import { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";

const secret = "provider-conversion-secret";
const secretHash = createHash("sha256").update(secret).digest("hex");

function runtimeEnvironment(enabled = true) {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_CONVERSION_RULES_ENABLED: String(enabled),
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString("base64"),
  };
}

function createHarness(options?: {
  enabled?: boolean;
  active?: boolean;
  removed?: boolean;
}) {
  const now = new Date("2026-07-21T20:00:00.000Z");
  const endpoint = {
    id: "endpoint_1",
    workspaceId: "workspace_safe",
    providerRuleId: "provider_rule_1",
    secretHash,
    secretVersion: 1,
    lastDeliveryAt: null as Date | null,
    lastSuccessfulParseAt: null,
    rotatedAt: null,
    removedAt: options?.removed ? now : null,
    createdAt: now,
    updatedAt: now,
    providerRule: {
      id: "provider_rule_1",
      workspaceId: "workspace_safe",
      conversionRuleId: "rule_1",
      connectionId: "connection_1",
      parserReleaseId: "inbound_parser_umbler_automation_v1",
      mode: "observation" as const,
      productionActivatedAt: null,
      removedAt: null,
      createdByUserId: "user_1",
      createdAt: now,
      updatedAt: now,
      conversionRule: {
        id: "rule_1",
        workspaceId: "workspace_safe",
        name: "Lead qualificado Umbler",
        triggerType: "provider_automation" as const,
        triggerValue: "provider_automation",
        matchMode: "exact" as const,
        eventName: "QualifiedLead",
        pixelId: null,
        defaultValueCents: null,
        defaultCurrency: null,
        defaultContentName: null,
        defaultItems: null,
        active: options?.active ?? true,
        createdAt: now,
        updatedAt: now,
      },
      connection: {
        id: "connection_1",
        workspaceId: "workspace_safe",
        provider: "umbler" as const,
        displayName: "Umbler Teste",
        parserReleaseId: "inbound_parser_umbler_v1",
        secretHash: "connection-hash",
        status: "observation" as const,
        productionActivatedAt: null,
        createdByUserId: "user_1",
        lastDeliveryAt: null as Date | null,
        lastSuccessfulParseAt: null,
        removedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      parserRelease: {
        id: "inbound_parser_umbler_automation_v1",
        provider: "umbler" as const,
        version: "automation-v1",
        status: "observation_only" as const,
        certifiedByUserId: null,
        certifiedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    },
  };
  const deliveries = new Map<string, Record<string, any>>();
  const deliveryByIdentity = (connectionId: string, ingressKey: string) =>
    `${connectionId}:${ingressKey}`;

  const providerConversionRuleEndpoint = {
    findUnique: vi.fn(async ({ where }) =>
      where.id === endpoint.id ? endpoint : null,
    ),
    findFirst: vi.fn(async () =>
      endpoint.removedAt === null && endpoint.providerRule.conversionRule.active
        ? { id: endpoint.id }
        : null,
    ),
    updateMany: vi.fn(async ({ data }) => {
      endpoint.lastDeliveryAt = data.lastDeliveryAt;
      return { count: 1 };
    }),
  };
  const inboundWebhookConnection = {
    updateMany: vi.fn(async ({ data }) => {
      endpoint.providerRule.connection.lastDeliveryAt = data.lastDeliveryAt;
      return { count: 1 };
    }),
  };
  const inboundWebhookDelivery = {
    findUnique: vi.fn(async ({ where }) => {
      const identity = where.connectionId_ingressKey;
      const delivery = deliveries.get(
        deliveryByIdentity(identity.connectionId, identity.ingressKey),
      );
      return delivery ? { id: delivery.id } : null;
    }),
    create: vi.fn(async ({ data }) => {
      deliveries.set(deliveryByIdentity(data.connectionId, data.ingressKey), {
        attemptCount: 1,
        ...data,
      });
      return data;
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const delivery = [...deliveries.values()].find(
        (candidate) =>
          candidate.id === where.id &&
          candidate.workspaceId === where.workspaceId &&
          candidate.connectionId === where.connectionId &&
          candidate.providerRuleEndpointId === where.providerRuleEndpointId,
      );
      if (!delivery) return { count: 0 };
      delivery.attemptCount += data.attemptCount.increment;
      delivery.lastReceivedAt = data.lastReceivedAt;
      return { count: 1 };
    }),
  };
  const prisma = {
    providerConversionRuleEndpoint,
    inboundWebhookConnection,
    inboundWebhookDelivery,
    $transaction: vi.fn(async (operation) => operation(prisma)),
  };
  const env = runtimeEnvironment(options?.enabled ?? true);
  const encryption = new InboundWebhookPayloadEncryptionService(env);
  const service = new InboundConversionAutomationIngestionService(
    prisma as unknown as PrismaService,
    env,
    encryption,
  );

  return { deliveries, encryption, endpoint, service };
}

function input(rawBody: Buffer, token: unknown = secret) {
  return {
    endpointId: "endpoint_1",
    token,
    contentType: "application/json; charset=utf-8",
    providerAttempt: "1",
    rawBody,
  };
}

describe("inbound conversion automation ingestion", () => {
  it("fails closed for disabled, invalid, paused, or removed endpoints", async () => {
    const harnesses = [
      createHarness({ enabled: false }),
      createHarness({ active: false }),
      createHarness({ removed: true }),
    ];

    for (const harness of harnesses) {
      await expect(
        harness.service.ingest(input(Buffer.from("{}"))),
      ).rejects.toMatchObject({
        status: 404,
        message: "Webhook nao encontrado",
      });
      expect(harness.deliveries.size).toBe(0);
    }

    const invalidToken = createHarness();
    await expect(
      invalidToken.service.ingest(input(Buffer.from("{}"), "wrong")),
    ).rejects.toMatchObject({ status: 404, message: "Webhook nao encontrado" });
  });

  it("durably stores an encrypted automation delivery without trusting payload fields", async () => {
    const harness = createHarness();
    const rawBody = Buffer.from(
      JSON.stringify({
        workspaceId: "workspace_attacker",
        eventName: "Purchase",
        value: 1,
        Contact: { Id: "contact_1" },
      }),
    );

    const result = await harness.service.ingest(input(rawBody));

    expect(result).toMatchObject({
      status: "accepted",
      duplicate: false,
      observationStatus: "parser_pending_certification",
    });
    expect(harness.deliveries.size).toBe(1);
    const delivery = [...harness.deliveries.values()][0];
    expect(delivery).toMatchObject({
      id: result.deliveryId,
      workspaceId: "workspace_safe",
      connectionId: "connection_1",
      provider: "umbler",
      purpose: "conversion_automation",
      providerRuleEndpointWorkspaceId: "workspace_safe",
      providerRuleEndpointId: "endpoint_1",
      status: "processed",
      classification: "unsupported_event",
      parseErrorCode: "automation_parser_pending_certification",
    });
    expect(JSON.stringify(delivery.normalizedSummary)).not.toContain(
      "workspace_attacker",
    );
    expect(JSON.stringify(delivery.normalizedSummary)).not.toContain(
      "Purchase",
    );
    expect(delivery).not.toHaveProperty("rawBody");

    const decrypted = harness.encryption.decrypt(
      {
        encryptedPayload: delivery.encryptedPayload,
        payloadIv: delivery.payloadIv,
        payloadTag: delivery.payloadTag,
        encryptionKeyVersion: delivery.encryptionKeyVersion,
      },
      {
        workspaceId: "workspace_safe",
        connectionId: "connection_1",
        deliveryId: result.deliveryId,
      },
    );
    expect(decrypted.equals(rawBody)).toBe(true);
  });

  it("collapses identical provider retries inside the fallback window", async () => {
    const harness = createHarness();
    const rawBody = Buffer.from('{"Contact":{"Id":"contact_1"}}');

    const first = await harness.service.ingest(input(rawBody));
    const duplicate = await harness.service.ingest(input(rawBody));

    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({
      deliveryId: first.deliveryId,
      duplicate: true,
    });
    expect(harness.deliveries.size).toBe(1);
    expect([...harness.deliveries.values()][0].attemptCount).toBe(2);
  });
});
