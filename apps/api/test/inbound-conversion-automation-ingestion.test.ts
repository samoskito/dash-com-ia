import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { InboundConversionAutomationIngestionService } from "../src/inbound-webhooks/inbound-conversion-automation-ingestion.service";
import { InboundWebhookPayloadEncryptionService } from "../src/inbound-webhooks/inbound-webhook-payload-encryption.service";

const secret = "provider-conversion-secret";
const secretHash = createHash("sha256").update(secret).digest("hex");

function runtimeEnvironment(input: {
  enabled?: boolean;
  production?: boolean;
}) {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_PRODUCTION_ENABLED: String(input.production ?? false),
    INBOUND_CONVERSION_RULES_ENABLED: String(input.enabled ?? true),
    INBOUND_CONVERSION_PRODUCTION_ENABLED: String(input.production ?? false),
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString("base64"),
  };
}

function automationPayload(
  automation: "lead_qualificado" | "compra_aprovada" = "lead_qualificado",
) {
  return {
    schema: "wpptrack.umbler.automation.v1",
    source: "umbler_tag_automation",
    automation,
    contact: {
      phone: "+5511999999999",
      name: "Nome que nao deve ser persistido",
    },
    conversation: {
      id: "conversation_1",
      created_at_utc: "2026-07-22 16:59:29",
    },
  };
}

function createHarness(options?: {
  enabled?: boolean;
  active?: boolean;
  removed?: boolean;
  production?: boolean;
  eventName?: "QualifiedLead" | "Purchase";
  channelResolved?: boolean;
  paidLeadResolved?: boolean;
}) {
  const now = new Date("2026-07-22T17:10:00.000Z");
  const activatedAt = new Date("2026-07-22T12:00:00.000Z");
  const eventName = options?.eventName ?? "QualifiedLead";
  const production = options?.production ?? false;
  const channel = {
    id: "channel_1",
    workspaceId: "workspace_safe",
    connectionId: "connection_1",
    status: "active" as const,
    productionActivatedAt: activatedAt,
  };
  const endpoint = {
    id: "endpoint_1",
    workspaceId: "workspace_safe",
    providerRuleId: "provider_rule_1",
    secretHash,
    secretVersion: 1,
    lastDeliveryAt: null as Date | null,
    lastSuccessfulParseAt: null as Date | null,
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
      mode: production ? ("production" as const) : ("observation" as const),
      productionActivatedAt: production ? activatedAt : null,
      removedAt: null,
      createdByUserId: "user_1",
      createdAt: now,
      updatedAt: now,
      conversionRule: {
        id: "rule_1",
        workspaceId: "workspace_safe",
        name: "Automacao Umbler",
        triggerType: "provider_automation" as const,
        triggerValue: "provider_automation",
        matchMode: "exact" as const,
        eventName,
        pixelId: null,
        defaultValueCents: eventName === "Purchase" ? 250_000 : null,
        defaultCurrency: eventName === "Purchase" ? "BRL" : null,
        defaultContentName: eventName === "Purchase" ? "Pedido medio" : null,
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
        status: production ? ("production" as const) : ("observation" as const),
        productionActivatedAt: production ? activatedAt : null,
        createdByUserId: "user_1",
        lastDeliveryAt: null as Date | null,
        lastSuccessfulParseAt: null as Date | null,
        removedAt: null,
        createdAt: now,
        updatedAt: now,
        parserRelease: {
          id: "inbound_parser_umbler_v1",
          provider: "umbler" as const,
          version: "v1",
          status: "certified" as const,
          certifiedByUserId: "user_1",
          certifiedAt: activatedAt,
          createdAt: now,
          updatedAt: now,
        },
      },
      parserRelease: {
        id: "inbound_parser_umbler_automation_v1",
        provider: "umbler" as const,
        version: "automation-v1",
        status: "certified" as const,
        certifiedByUserId: "user_1",
        certifiedAt: activatedAt,
        createdAt: now,
        updatedAt: now,
      },
      channels: [{ channelId: channel.id, channel }],
    },
  };
  const deliveries = new Map<string, Record<string, any>>();
  const executions = new Map<string, Record<string, any>>();
  const purchaseReviews = new Map<string, Record<string, any>>();
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
      if (data.lastSuccessfulParseAt) {
        endpoint.lastSuccessfulParseAt = data.lastSuccessfulParseAt;
      }
      return { count: 1 };
    }),
  };
  const inboundWebhookConnection = {
    updateMany: vi.fn(async ({ data }) => {
      endpoint.providerRule.connection.lastDeliveryAt = data.lastDeliveryAt;
      if (data.lastSuccessfulParseAt) {
        endpoint.providerRule.connection.lastSuccessfulParseAt =
          data.lastSuccessfulParseAt;
      }
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
      const delivery = { attemptCount: 1, ...data };
      deliveries.set(
        deliveryByIdentity(data.connectionId, data.ingressKey),
        delivery,
      );
      return delivery;
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
  const providerConversionRuleExecution = {
    upsert: vi.fn(async ({ where, create }) => {
      const key =
        where.providerRuleId_externalExecutionKey.externalExecutionKey;
      const existing = executions.get(key);
      if (existing) return { id: existing.id, status: existing.status };
      const execution = { id: "execution_1", ...create };
      executions.set(key, execution);
      return { id: execution.id, status: execution.status };
    }),
  };
  const purchaseReview = {
    upsert: vi.fn(async ({ where, create }) => {
      const key =
        where.providerRuleId_externalOccurrenceKey.externalOccurrenceKey;
      const existing = purchaseReviews.get(key);
      if (existing) return existing;
      const review = { id: "review_1", ...create };
      purchaseReviews.set(key, review);
      return review;
    }),
  };
  const prisma: Record<string, any> = {
    providerConversionRuleEndpoint,
    inboundWebhookConnection,
    inboundWebhookDelivery,
    inboundWebhookEvent: {
      findFirst: vi.fn(async () =>
        options?.channelResolved === false ? null : { channel },
      ),
    },
    lead: {
      findFirst: vi.fn(async () =>
        options?.paidLeadResolved === false
          ? null
          : { id: "lead_1", adId: "ad_1", ctwaClid: "ctwa_1" },
      ),
    },
    providerConversionRuleExecution,
    purchaseReview,
  };
  prisma.$transaction = vi.fn(async (operation) => operation(prisma));

  const env = runtimeEnvironment({
    enabled: options?.enabled ?? true,
    production,
  });
  const encryption = new InboundWebhookPayloadEncryptionService(env);
  const productionQueue = {
    enqueueProviderConversion: vi.fn(async () => ({
      jobId: "provider-conversion:execution_1",
      status: "queued" as const,
    })),
  };
  const service = new InboundConversionAutomationIngestionService(
    prisma as unknown as PrismaService,
    env,
    encryption,
    productionQueue as never,
  );

  return {
    deliveries,
    encryption,
    endpoint,
    executions,
    prisma,
    productionQueue,
    purchaseReviews,
    service,
  };
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

  it("observes a valid qualified lead with workspace and PII isolated", async () => {
    const harness = createHarness();
    const rawBody = Buffer.from(
      JSON.stringify({
        ...automationPayload(),
        workspaceId: "workspace_attacker",
      }),
    );

    const result = await harness.service.ingest(input(rawBody));

    expect(result).toMatchObject({
      status: "accepted",
      duplicate: false,
      observationStatus: "observed",
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
      classification: "eligible_route_resolved",
      parseErrorCode: null,
    });
    expect(harness.executions.size).toBe(1);
    const execution = [...harness.executions.values()][0];
    expect(execution).toMatchObject({
      workspaceId: "workspace_safe",
      channelId: "channel_1",
      status: "observed",
      reasonCode: "automation_matched_observation",
      leadId: "lead_1",
      valueCents: null,
    });
    const redacted = JSON.stringify({
      delivery: delivery.normalizedSummary,
      execution: execution.normalizedResult,
    });
    expect(redacted).not.toContain("workspace_attacker");
    expect(redacted).not.toContain("5511999999999");
    expect(redacted).not.toContain("Nome que nao deve ser persistido");
    expect(
      harness.productionQueue.enqueueProviderConversion,
    ).not.toHaveBeenCalled();

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

  it("makes a production purchase eligible with the configured average value", async () => {
    const harness = createHarness({
      production: true,
      eventName: "Purchase",
    });
    const rawBody = Buffer.from(
      JSON.stringify(automationPayload("compra_aprovada")),
    );

    const result = await harness.service.ingest(input(rawBody));

    expect(result).toMatchObject({
      duplicate: false,
      observationStatus: "eligible",
    });
    expect([...harness.executions.values()][0]).toMatchObject({
      status: "eligible",
      reasonCode: "automation_matched",
      valueCents: 250_000,
      currency: "BRL",
    });
    expect([...harness.purchaseReviews.values()][0]).toMatchObject({
      workspaceId: "workspace_safe",
      sourceType: "provider_automation",
      status: "recognized",
      effectiveValueCents: 250_000,
      currency: "BRL",
      leadId: "lead_1",
    });
    expect(
      harness.productionQueue.enqueueProviderConversion,
    ).toHaveBeenCalledWith({
      providerConversionExecutionId: "execution_1",
      workspaceId: "workspace_safe",
    });
  });

  it("stores an invalid contract for audit without creating an execution", async () => {
    const harness = createHarness();
    const rawBody = Buffer.from(
      JSON.stringify({ ...automationPayload(), schema: "unknown.schema" }),
    );

    const result = await harness.service.ingest(input(rawBody));

    expect(result.observationStatus).toBe("invalid_payload");
    expect(harness.executions.size).toBe(0);
    expect(harness.purchaseReviews.size).toBe(0);
    expect([...harness.deliveries.values()][0]).toMatchObject({
      status: "failed",
      classification: "invalid_payload",
      parseErrorCode: "umbler_automation_v1_invalid_payload",
    });
  });

  it("collapses identical provider retries into the original delivery", async () => {
    const harness = createHarness();
    const rawBody = Buffer.from(JSON.stringify(automationPayload()));

    const first = await harness.service.ingest(input(rawBody));
    const duplicate = await harness.service.ingest(input(rawBody));

    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({
      deliveryId: first.deliveryId,
      duplicate: true,
      observationStatus: "duplicate",
    });
    expect(harness.deliveries.size).toBe(1);
    expect([...harness.deliveries.values()][0].attemptCount).toBe(2);
    expect(harness.executions.size).toBe(1);
  });
});
