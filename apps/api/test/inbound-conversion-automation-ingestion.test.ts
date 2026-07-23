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
    channelName: "Comercial",
    connectedPhone: "+5511999999999",
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
  const hydrateDelivery = (delivery: Record<string, any>) => ({
    ...delivery,
    providerConversionExecutions: [...executions.values()]
      .filter((execution) => execution.sourceDeliveryId === delivery.id)
      .sort(
        (left, right) =>
          (right.createdAt?.getTime?.() ?? 0) -
          (left.createdAt?.getTime?.() ?? 0),
      )
      .slice(0, 1)
      .map((execution) => ({
        ...execution,
        channel:
          execution.channelId === channel.id
            ? {
                id: channel.id,
                channelName: channel.channelName,
                connectedPhone: channel.connectedPhone,
              }
            : null,
      })),
  });
  const deliveryMatchesScope = (
    delivery: Record<string, any>,
    where: Record<string, any>,
  ) =>
    (!where.id || delivery.id === where.id) &&
    (!where.workspaceId || delivery.workspaceId === where.workspaceId) &&
    (!where.connectionId || delivery.connectionId === where.connectionId) &&
    (!where.providerRuleEndpointId ||
      delivery.providerRuleEndpointId === where.providerRuleEndpointId) &&
    (!where.purpose || delivery.purpose === where.purpose);

  const providerConversionRuleEndpoint = {
    findUnique: vi.fn(async ({ where }) =>
      where.id === endpoint.id ? endpoint : null,
    ),
    findFirst: vi.fn(async ({ where }: any) => {
      if (where.providerRuleId) {
        return where.providerRuleId === endpoint.providerRuleId &&
          endpoint.removedAt === null
          ? endpoint
          : null;
      }
      return endpoint.removedAt === null &&
        endpoint.providerRule.conversionRule.active
        ? { id: endpoint.id }
        : null;
    }),
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
    findFirst: vi.fn(async ({ where }: any) => {
      const candidates = [...deliveries.values()]
        .filter((delivery) => {
          if (!deliveryMatchesScope(delivery, where)) return false;
          const related = [...executions.values()].filter(
            (execution) =>
              execution.sourceDeliveryId === delivery.id &&
              (!where.providerConversionExecutions?.some?.providerRuleId ||
                execution.providerRuleId ===
                  where.providerConversionExecutions.some.providerRuleId),
          );
          if (where.providerConversionExecutions?.some) {
            return related.some(
              (execution) =>
                execution.status ===
                where.providerConversionExecutions.some.status,
            );
          }
          if (where.providerConversionExecutions?.none) {
            return !related.some(
              (execution) =>
                execution.providerRuleId ===
                where.providerConversionExecutions.none.providerRuleId,
            );
          }
          return true;
        })
        .sort(
          (left, right) =>
            right.lastReceivedAt.getTime() - left.lastReceivedAt.getTime(),
        );
      return candidates[0] ? hydrateDelivery(candidates[0]) : null;
    }),
    findMany: vi.fn(async ({ where, take }: any) =>
      [...deliveries.values()]
        .filter((delivery) => deliveryMatchesScope(delivery, where))
        .sort(
          (left, right) =>
            right.lastReceivedAt.getTime() - left.lastReceivedAt.getTime(),
        )
        .slice(0, take)
        .map(hydrateDelivery),
    ),
    count: vi.fn(
      async ({ where }: any) =>
        [...deliveries.values()].filter((delivery) =>
          deliveryMatchesScope(delivery, where),
        ).length,
    ),
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
      if (data.attemptCount?.increment) {
        delivery.attemptCount += data.attemptCount.increment;
      }
      for (const [key, value] of Object.entries(data)) {
        if (key !== "attemptCount") delivery[key] = value;
      }
      return { count: 1 };
    }),
  };
  const providerConversionRuleExecution = {
    findUnique: vi.fn(async ({ where }) => {
      const key =
        where.providerRuleId_externalExecutionKey.externalExecutionKey;
      return executions.get(key) ?? null;
    }),
    upsert: vi.fn(async ({ where, create }) => {
      const key =
        where.providerRuleId_externalExecutionKey.externalExecutionKey;
      const existing = executions.get(key);
      if (existing) return { id: existing.id, status: existing.status };
      const execution = {
        id: `execution_${executions.size + 1}`,
        createdAt: now,
        updatedAt: now,
        ...create,
      };
      executions.set(key, execution);
      return { id: execution.id, status: execution.status };
    }),
    update: vi.fn(async ({ where, data }) => {
      const entry = [...executions.entries()].find(
        ([, execution]) => execution.id === where.id,
      );
      if (!entry) throw new Error("execution not found");
      if (data.attemptCount?.increment) {
        entry[1].attemptCount += data.attemptCount.increment;
      }
      for (const [key, value] of Object.entries(data)) {
        if (key !== "attemptCount") entry[1][key] = value;
      }
      return entry[1];
    }),
    create: vi.fn(async ({ data }) => {
      const execution = {
        id: `execution_${executions.size + 1}`,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      executions.set(data.externalExecutionKey, execution);
      return execution;
    }),
    groupBy: vi.fn(async ({ where }: any) => {
      const counts = new Map<string, number>();
      for (const execution of executions.values()) {
        if (
          execution.workspaceId !== where.workspaceId ||
          execution.providerRuleId !== where.providerRuleId
        ) {
          continue;
        }
        counts.set(execution.status, (counts.get(execution.status) ?? 0) + 1);
      }
      return [...counts.entries()].map(([status, count]) => ({
        status,
        _count: { _all: count },
      }));
    }),
    count: vi.fn(
      async ({ where }: any) =>
        [...executions.values()].filter((execution) => {
          if (
            execution.workspaceId !== where.workspaceId ||
            execution.providerRuleId !== where.providerRuleId ||
            !where.status.in.includes(execution.status)
          ) {
            return false;
          }
          const delivery = [...deliveries.values()].find(
            (candidate) => candidate.id === execution.sourceDeliveryId,
          );
          return Boolean(
            delivery &&
            delivery.payloadExpiresAt > new Date() &&
            delivery.encryptedPayload &&
            delivery.payloadIv &&
            delivery.payloadTag &&
            delivery.encryptionKeyVersion,
          );
        }).length,
    ),
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
    auditLog: {
      create: vi.fn(async ({ data }) => data),
    },
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
    env,
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

  it("reprocesses the latest preserved callback without another Umbler request", async () => {
    const harness = createHarness();
    const rawBody = Buffer.from(JSON.stringify(automationPayload()));
    const observed = await harness.service.ingest(input(rawBody));

    harness.env.INBOUND_WEBHOOK_PRODUCTION_ENABLED = "true";
    harness.env.INBOUND_CONVERSION_PRODUCTION_ENABLED = "true";
    harness.endpoint.providerRule.mode = "production";
    harness.endpoint.providerRule.productionActivatedAt = new Date(
      "2026-07-22T18:00:00.000Z",
    );
    harness.endpoint.providerRule.connection.status = "production";
    harness.endpoint.providerRule.connection.productionActivatedAt = new Date(
      "2026-07-22T18:00:00.000Z",
    );

    const result = await harness.service.reprocessLatestObserved(
      "workspace_safe",
      "provider_rule_1",
      "manager_1",
    );

    expect(result).toEqual({
      executionId: "execution_1",
      sourceDeliveryId: observed.deliveryId,
      queueStatus: "queued",
    });
    expect([...harness.executions.values()][0]).toMatchObject({
      status: "eligible",
      reasonCode: "automation_manual_reprocess_approved",
      normalizedResult: {
        manualReplayApproval: {
          approved: true,
          actorUserId: "manager_1",
        },
      },
    });
    expect([...harness.deliveries.values()][0]).toMatchObject({
      parserVersion: "automation-v1",
      status: "processed",
      parseErrorCode: null,
      routingErrorCode: null,
    });
    expect(
      harness.productionQueue.enqueueProviderConversion,
    ).toHaveBeenCalledTimes(1);
  });

  it("reprocesses an older observed callback when a newer callback is blocked", async () => {
    const harness = createHarness();
    const observed = await harness.service.ingest(
      input(Buffer.from(JSON.stringify(automationPayload()))),
    );
    const observedDelivery = [...harness.deliveries.values()].find(
      (delivery) => delivery.id === observed.deliveryId,
    )!;
    observedDelivery.lastReceivedAt = new Date("2026-07-22T16:20:00.000Z");

    harness.env.INBOUND_WEBHOOK_PRODUCTION_ENABLED = "true";
    harness.env.INBOUND_CONVERSION_PRODUCTION_ENABLED = "true";
    harness.endpoint.providerRule.mode = "production";
    harness.endpoint.providerRule.productionActivatedAt = new Date(
      "2026-07-22T16:30:00.000Z",
    );
    harness.endpoint.providerRule.connection.status = "production";
    harness.endpoint.providerRule.connection.productionActivatedAt = new Date(
      "2026-07-22T16:30:00.000Z",
    );
    harness.prisma.lead.findFirst.mockResolvedValueOnce(null);
    const newerPayload = automationPayload();
    newerPayload.conversation.id = "conversation_2";
    const blocked = await harness.service.ingest(
      input(Buffer.from(JSON.stringify(newerPayload))),
    );
    const blockedDelivery = [...harness.deliveries.values()].find(
      (delivery) => delivery.id === blocked.deliveryId,
    )!;
    blockedDelivery.lastReceivedAt = new Date("2026-07-22T16:37:00.000Z");

    const result = await harness.service.reprocessLatestObserved(
      "workspace_safe",
      "provider_rule_1",
      "manager_1",
    );

    expect(blocked.observationStatus).toBe("blocked");
    expect(result.sourceDeliveryId).toBe(observed.deliveryId);
    expect(
      [...harness.executions.values()].find(
        (execution) => execution.sourceDeliveryId === observed.deliveryId,
      ),
    ).toMatchObject({
      status: "eligible",
      reasonCode: "automation_manual_reprocess_approved",
    });
  });

  it("audits every callback and reprocesses a valid selection without a blocked callback stopping the batch", async () => {
    const harness = createHarness();
    const valid = await harness.service.ingest(
      input(Buffer.from(JSON.stringify(automationPayload()))),
    );
    const mismatchedPayload = automationPayload("compra_aprovada");
    mismatchedPayload.conversation.id = "conversation_purchase";
    const mismatched = await harness.service.ingest(
      input(Buffer.from(JSON.stringify(mismatchedPayload))),
    );

    const audit = await harness.service.listAutomationCallbacks(
      "workspace_safe",
      "provider_rule_1",
    );
    const retainedPayload = await harness.service.readAutomationPayload(
      "workspace_safe",
      "provider_rule_1",
      valid.deliveryId,
      "manager_1",
    );

    expect(audit.summary).toMatchObject({
      total: 2,
      observed: 1,
      blocked: 1,
      recoverable: 2,
    });
    expect(audit.items.map((item) => item.deliveryId)).toEqual(
      expect.arrayContaining([valid.deliveryId, mismatched.deliveryId]),
    );
    expect(retainedPayload.payload).toMatchObject({
      schema: "wpptrack.umbler.automation.v1",
      automation: "lead_qualificado",
    });

    harness.env.INBOUND_WEBHOOK_PRODUCTION_ENABLED = "true";
    harness.env.INBOUND_CONVERSION_PRODUCTION_ENABLED = "true";
    harness.endpoint.providerRule.mode = "production";
    harness.endpoint.providerRule.productionActivatedAt = new Date(
      "2026-07-22T18:00:00.000Z",
    );
    harness.endpoint.providerRule.connection.status = "production";
    harness.endpoint.providerRule.connection.productionActivatedAt = new Date(
      "2026-07-22T18:00:00.000Z",
    );

    const replay = await harness.service.reprocessSelectedCallbacks(
      "workspace_safe",
      "provider_rule_1",
      [mismatched.deliveryId, valid.deliveryId],
      "manager_1",
    );

    expect(replay).toMatchObject({
      requested: 2,
      queued: 1,
      blocked: 1,
      skipped: 0,
    });
    expect(replay.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deliveryId: mismatched.deliveryId,
          status: "blocked",
          reasonCode: "automation_event_mismatch",
        }),
        expect.objectContaining({
          deliveryId: valid.deliveryId,
          status: "queued",
        }),
      ]),
    );
    expect(
      harness.productionQueue.enqueueProviderConversion,
    ).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed callback recoverable and records a fresh manual approval before retrying", async () => {
    const harness = createHarness();
    const callback = await harness.service.ingest(
      input(Buffer.from(JSON.stringify(automationPayload()))),
    );
    const execution = [...harness.executions.values()].find(
      (candidate) => candidate.sourceDeliveryId === callback.deliveryId,
    )!;
    execution.status = "failed";
    execution.reasonCode = "provider_conversion_production_context_invalid";
    execution.normalizedResult = {
      ...execution.normalizedResult,
      manualReplayApproval: {
        approved: true,
        attemptedAt: "2026-07-22T18:00:00.000Z",
        actorUserId: "manager_1",
      },
    };
    harness.env.INBOUND_WEBHOOK_PRODUCTION_ENABLED = "true";
    harness.env.INBOUND_CONVERSION_PRODUCTION_ENABLED = "true";
    harness.endpoint.providerRule.mode = "production";
    harness.endpoint.providerRule.productionActivatedAt = new Date(
      "2026-07-22T18:00:00.000Z",
    );
    harness.endpoint.providerRule.connection.status = "production";
    harness.endpoint.providerRule.connection.productionActivatedAt = new Date(
      "2026-07-22T18:00:00.000Z",
    );

    const audit = await harness.service.listAutomationCallbacks(
      "workspace_safe",
      "provider_rule_1",
    );
    const replay = await harness.service.reprocessSelectedCallbacks(
      "workspace_safe",
      "provider_rule_1",
      [callback.deliveryId],
      "manager_2",
    );

    expect(audit.summary).toMatchObject({
      failed: 1,
      recoverable: 1,
    });
    expect(audit.items[0]).toMatchObject({
      status: "failed",
      reprocessable: true,
    });
    expect(replay).toMatchObject({
      requested: 1,
      queued: 1,
      blocked: 0,
      skipped: 0,
    });
    expect(execution.normalizedResult.manualReplayApproval).toMatchObject({
      approved: true,
      actorUserId: "manager_2",
    });
    expect(execution.normalizedResult.manualReplayApproval.approvedAt).toEqual(
      expect.any(String),
    );
    expect(execution).toMatchObject({
      status: "eligible",
      reasonCode: "automation_manual_reprocess_approved",
      processedAt: null,
    });
    expect(
      harness.productionQueue.enqueueProviderConversion,
    ).toHaveBeenCalledWith({
      providerConversionExecutionId: execution.id,
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
