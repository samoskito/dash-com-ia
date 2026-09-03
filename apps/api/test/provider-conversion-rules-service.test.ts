import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ProviderConversionCatalogInputDto } from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { ProviderConversionRulesService } from "../src/conversion-rules/provider-conversion-rules.service";

function runtimeEnvironment() {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "https://api.wpptrack.test",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_PRODUCTION_ENABLED: "true",
    INBOUND_CONVERSION_RULES_ENABLED: "true",
    INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString("base64"),
  };
}

function jsonOrNull(value: unknown) {
  return value === Prisma.DbNull || value === undefined ? null : value;
}

type HarnessOptions = {
  connectionProvider?: "umbler" | "gupshup" | "uazapi";
  connectionStatus?: "observation" | "production";
  channelStatus?: "discovered" | "active" | "paused";
  channelHasValidRoute?: boolean;
};

function createHarness(
  channelCount = 1,
  initialConversionRule: Record<string, any> | null = null,
  options: HarnessOptions = {},
) {
  const now = new Date("2026-07-21T21:00:00.000Z");
  const parserRelease = {
    id: "inbound_parser_umbler_automation_v1",
    provider: "umbler" as const,
    version: "automation-v1",
    status: "certified" as const,
    certifiedByUserId: "user_1",
    certifiedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const connectionStatus = options.connectionStatus ?? "production";
  const connectionProvider = options.connectionProvider ?? "umbler";
  const connection = {
    id: "connection_1",
    workspaceId: "workspace_1",
    provider: connectionProvider as "umbler" | "gupshup" | "uazapi",
    displayName: "Umbler Cliente",
    parserReleaseId: "inbound_parser_umbler_v1",
    secretHash: "connection-hash",
    status: connectionStatus as "observation" | "production" | "paused",
    productionActivatedAt: connectionStatus === "production" ? now : null,
    createdByUserId: "user_1",
    lastDeliveryAt: null,
    lastSuccessfulParseAt: now,
    removedAt: null,
    createdAt: now,
    updatedAt: now,
    parserRelease: {
      ...parserRelease,
      id: "inbound_parser_umbler_v1",
      provider: "umbler" as "umbler" | "gupshup" | "uazapi",
      version: "v1",
      status: "certified" as const,
    },
  };
  let conversionRule: Record<string, any> | null = initialConversionRule;
  let providerRule: Record<string, any> | null = null;
  let endpoint: Record<string, any> | null = null;
  let catalog: Record<string, any> | null = null;
  const channels: Array<Record<string, any>> = [];
  // The real InboundWebhookChannel rows the "Envio ativo" cascade promotes,
  // as opposed to `channels` above, which are the rule -> channel links.
  const inboundChannelStatus = options.channelStatus ?? "active";
  const inboundChannels: Array<Record<string, any>> = Array.from(
    { length: Math.max(channelCount, 1) },
    (_, index) => ({
      id: `channel_${index + 1}`,
      workspaceId: "workspace_1",
      connectionId: connection.id,
      connectedPhone: `551199999000${index}`,
      status: inboundChannelStatus,
      productionActivatedAt:
        inboundChannelStatus === "active" && connectionStatus === "production"
          ? now
          : null,
      createdAt: now,
      updatedAt: now,
      routes:
        options.channelHasValidRoute === false
          ? []
          : [
              {
                id: `route_${index + 1}`,
                workspaceId: "workspace_1",
                channelId: `channel_${index + 1}`,
                active: true,
                validationStatus: "valid",
                metaBusinessConnectionId: "meta_business_1",
                metaReportingAccountId: "act_1",
                metaConversionDestinationId: "dataset_1",
                metaBusinessConnection: {
                  status: "active",
                  credential: { status: "active" },
                },
                metaReportingAccount: { active: true },
                metaConversionDestination: { status: "configured" },
                createdAt: now,
              },
            ],
    }),
  );
  const findInboundChannel = (channelId: string, workspaceId: string) => {
    const channel = inboundChannels.find(
      (item) => item.id === channelId && item.workspaceId === workspaceId,
    );
    return channel ? { ...channel, connection } : null;
  };
  const executions: Array<Record<string, any>> = [];
  const leads: Array<Record<string, any>> = [];
  const audits: Array<Record<string, any>> = [];

  const fullRule = (): Record<string, any> | null =>
    providerRule && conversionRule
      ? {
          ...providerRule,
          conversionRule,
          connection,
          parserRelease,
          channels,
          endpoint,
          catalog,
          executions,
        }
      : null;

  const prisma: Record<string, any> = {
    inboundWebhookConnection: {
      findFirst: vi.fn(async ({ where }) => {
        if (
          where.id !== connection.id ||
          where.workspaceId !== connection.workspaceId
        ) {
          return null;
        }
        if ("provider" in where) {
          return null;
        }
        return connection;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        if (
          where.id !== connection.id ||
          where.workspaceId !== connection.workspaceId ||
          (where.updatedAt && where.updatedAt !== connection.updatedAt)
        ) {
          return { count: 0 };
        }
        Object.assign(connection, data);
        return { count: 1 };
      }),
    },
    inboundWebhookChannel: {
      count: vi.fn(
        async ({ where }) =>
          inboundChannels.filter(
            (channel) =>
              channel.workspaceId === where.workspaceId &&
              (!where.connectionId ||
                channel.connectionId === where.connectionId) &&
              (!where.id?.in || where.id.in.includes(channel.id)),
          ).length,
      ),
      findFirst: vi.fn(async ({ where }) =>
        findInboundChannel(where.id, where.workspaceId),
      ),
      findMany: vi.fn(async ({ where }) =>
        inboundChannels
          .filter(
            (channel) =>
              channel.workspaceId === where.workspaceId &&
              (!where.connectionId ||
                channel.connectionId === where.connectionId) &&
              (!where.id?.in || where.id.in.includes(channel.id)) &&
              (!where.status || channel.status === where.status),
          )
          .map((channel) => ({
            ...channel,
            // Keep every active route in the harness so the production gate
            // itself proves malformed routes remain fail-closed.
            routes: channel.routes.filter(
              (route: Record<string, any>) => route.active,
            ),
          })),
      ),
      updateMany: vi.fn(async ({ where, data }) => {
        const matches = inboundChannels.filter(
          (channel) =>
            channel.workspaceId === where.workspaceId &&
            (!where.id || channel.id === where.id) &&
            (!where.connectionId ||
              channel.connectionId === where.connectionId) &&
            (!where.status || channel.status === where.status) &&
            (!where.updatedAt || channel.updatedAt === where.updatedAt),
        );
        for (const channel of matches) {
          Object.assign(channel, data);
        }
        return { count: matches.length };
      }),
    },
    inboundWebhookReplayBatch: {
      count: vi.fn(async () => 0),
    },
    inboundWebhookParserRelease: {
      findFirst: vi.fn(async () => parserRelease),
    },
    conversionRule: {
      findFirst: vi.fn(async ({ where }) =>
        conversionRule &&
        where.id === conversionRule.id &&
        where.workspaceId === conversionRule.workspaceId
          ? {
              ...conversionRule,
              providerConfig: providerRule,
            }
          : null,
      ),
      create: vi.fn(async ({ data }) => {
        conversionRule = {
          id: "rule_1",
          createdAt: now,
          updatedAt: now,
          ...data,
          // Prisma.DbNull is persisted as a SQL NULL; anything else is real Json.
          defaultItems: jsonOrNull(data.defaultItems),
        };
        return conversionRule;
      }),
      update: vi.fn(async ({ where, data }) => {
        if (!conversionRule || where.id !== conversionRule.id) {
          throw new Error("conversion rule not found");
        }
        conversionRule = {
          ...conversionRule,
          ...data,
          ...(data.defaultItems !== undefined
            ? { defaultItems: jsonOrNull(data.defaultItems) }
            : {}),
          updatedAt: now,
        };
        return conversionRule;
      }),
    },
    providerConversionRuleConfig: {
      create: vi.fn(async ({ data }) => {
        providerRule = {
          id: "provider_rule_1",
          createdAt: now,
          updatedAt: now,
          removedAt: null,
          ...data,
        };
        return providerRule;
      }),
      findFirst: vi.fn(async ({ where }) => {
        const rule = fullRule();
        return rule &&
          where.id === rule.id &&
          where.workspaceId === rule.workspaceId
          ? rule
          : null;
      }),
      findMany: vi.fn(async ({ where }) => {
        const rule = fullRule();
        return rule && where.workspaceId === rule.workspaceId ? [rule] : [];
      }),
      update: vi.fn(async ({ where, data }) => {
        if (!providerRule || where.id !== providerRule.id) {
          throw new Error("provider rule not found");
        }
        providerRule = { ...providerRule, ...data, updatedAt: now };
        return providerRule;
      }),
    },
    providerConversionRuleChannel: {
      createMany: vi.fn(async ({ data }) => {
        channels.push(
          ...data.map((item: Record<string, any>, index: number) => ({
            id: `scope_${index + 1}`,
            createdAt: now,
            ...item,
          })),
        );
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const remaining = channels.filter(
          (channel) =>
            channel.workspaceId !== where.workspaceId ||
            channel.providerRuleId !== where.providerRuleId ||
            (where.channelId?.in &&
              !where.channelId.in.includes(channel.channelId)),
        );
        const removedCount = channels.length - remaining.length;
        channels.length = 0;
        channels.push(...remaining);
        return { count: removedCount };
      }),
    },
    providerConversionRuleEndpoint: {
      create: vi.fn(async ({ data }) => {
        endpoint = {
          id: "endpoint_1",
          secretVersion: 1,
          lastDeliveryAt: null,
          lastSuccessfulParseAt: null,
          rotatedAt: null,
          removedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        return endpoint;
      }),
    },
    conversionCatalog: {
      create: vi.fn(async ({ data }) => {
        catalog = {
          id: "catalog_1",
          active: true,
          attributes: [],
          variants: [],
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        return catalog;
      }),
      findFirst: vi.fn(async ({ where }) =>
        catalog &&
        where.workspaceId === catalog.workspaceId &&
        where.providerRuleId === catalog.providerRuleId
          ? catalog
          : null,
      ),
      update: vi.fn(async ({ where, data }) => {
        if (!catalog || where.id !== catalog.id) {
          throw new Error("catalog not found");
        }
        catalog = { ...catalog, ...data, updatedAt: now };
        return catalog;
      }),
    },
    conversionCatalogAttribute: {
      createMany: vi.fn(async ({ data }) => {
        if (!catalog) throw new Error("catalog not found");
        catalog.attributes = data.map(
          (item: Record<string, any>, index: number) => ({
            id: `attribute_${index + 1}`,
            createdAt: now,
            updatedAt: now,
            ...item,
          }),
        );
        return { count: data.length };
      }),
      deleteMany: vi.fn(async () => {
        if (catalog) catalog.attributes = [];
        return { count: 0 };
      }),
    },
    conversionCatalogVariant: {
      createMany: vi.fn(async ({ data }) => {
        if (!catalog) throw new Error("catalog not found");
        catalog.variants = data.map(
          (item: Record<string, any>, index: number) => ({
            id: `variant_${index + 1}`,
            active: true,
            createdAt: now,
            updatedAt: now,
            ...item,
          }),
        );
        return { count: data.length };
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        if (!catalog) return { count: 0 };
        const variant = catalog.variants.find(
          (item: Record<string, any>) =>
            item.id === where.id &&
            item.workspaceId === where.workspaceId &&
            item.catalogId === where.catalogId,
        );
        if (!variant) return { count: 0 };
        Object.assign(variant, data, { updatedAt: now });
        return { count: 1 };
      }),
      deleteMany: vi.fn(async () => {
        if (catalog) catalog.variants = [];
        return { count: 0 };
      }),
    },
    providerConversionRuleExecution: {
      count: vi.fn(
        async ({ where } = {}) =>
          executions.filter(
            (execution) =>
              (!where?.workspaceId ||
                execution.workspaceId === where.workspaceId) &&
              (!where?.providerRuleId ||
                execution.providerRuleId === where.providerRuleId) &&
              (!where?.status || execution.status === where.status),
          ).length,
      ),
      findMany: vi.fn(async ({ where, skip = 0, take } = {}) =>
        executions
          .filter(
            (execution) =>
              (!where?.workspaceId ||
                execution.workspaceId === where.workspaceId) &&
              (!where?.providerRuleId ||
                execution.providerRuleId === where.providerRuleId) &&
              (!where?.status || execution.status === where.status),
          )
          .sort(
            (left, right) =>
              right.occurredAt.getTime() - left.occurredAt.getTime() ||
              right.id.localeCompare(left.id),
          )
          .slice(skip, take === undefined ? undefined : skip + take),
      ),
      groupBy: vi.fn(async ({ where }) => {
        const counts = new Map<string, number>();
        for (const execution of executions) {
          if (
            execution.workspaceId === where.workspaceId &&
            execution.providerRuleId === where.providerRuleId
          ) {
            counts.set(
              execution.status,
              (counts.get(execution.status) ?? 0) + 1,
            );
          }
        }
        return [...counts].map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      }),
    },
    lead: {
      findMany: vi.fn(async ({ where }) =>
        leads
          .filter(
            (lead) =>
              lead.workspaceId === where.workspaceId &&
              where.id.in.includes(lead.id),
          )
          .map(({ id, name, phoneDisplay }) => ({ id, name, phoneDisplay })),
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        audits.push(data);
        return data;
      }),
    },
  };
  prisma.$transaction = vi.fn(async (operation) => operation(prisma));

  const service = new ProviderConversionRulesService(
    prisma as PrismaService,
    runtimeEnvironment(),
  );

  return {
    audits,
    connection,
    get endpoint() {
      return endpoint;
    },
    get catalog() {
      return catalog;
    },
    get conversionRule() {
      return conversionRule;
    },
    executions,
    inboundChannels,
    leads,
    prisma,
    // The ProviderConversionRuleChannel rows, i.e. the rule -> channel scope.
    ruleChannels: channels,
    service,
  };
}

function catalogInput(): ProviderConversionCatalogInputDto {
  return {
    name: "Camas elasticas",
    productName: "Cama elastica",
    currency: "BRL",
    attributes: [
      { key: "tamanho", label: "Tamanho" },
      { key: "modelo", label: "Modelo" },
    ],
    variants: [
      {
        attributeValues: ["4,90", "Nacional"],
        aliases: [[], []],
        valueCents: 359_700,
        contentName: "Cama elastica 4,90 Nacional",
      },
      {
        attributeValues: ["3,05", "Europa"],
        aliases: [[], []],
        valueCents: 179_700,
        contentName: "Cama elastica 3,05 Europa",
      },
    ],
  };
}

function addCatalogExecution(
  executions: Array<Record<string, any>>,
  providerRuleId: string,
): void {
  const occurredAt = new Date("2026-07-22T13:50:00.000Z");
  executions.push({
    id: "execution_catalog_1",
    workspaceId: "workspace_1",
    providerRuleId,
    sourceDeliveryId: "delivery_catalog_1",
    channelId: "channel_1",
    externalExecutionKey: "catalog-message:1",
    occurredAt,
    status: "blocked",
    reasonCode: "awaiting_data",
    matchedCatalogVariantId: null,
    valueCents: null,
    currency: null,
    leadId: null,
    conversionEventLogId: null,
    attemptCount: 0,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
}

describe("provider conversion rules service", () => {
  it("lists executions for a message_phrase rule with status summary and lead lookup", async () => {
    const harness = createHarness();
    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Lead qualificado por mensagem",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "message_phrase",
        eventName: "QualifiedLead",
        triggerPhrases: ["quero saber mais"],
        messageAuthorScope: "contact",
        valueMode: "fixed",
      },
      "user_1",
    );
    harness.leads.push({
      id: "lead_1",
      workspaceId: "workspace_1",
      name: "Cliente IC",
      phoneDisplay: "+5511999990000",
    });
    harness.executions.push(
      {
        id: "execution_observed",
        workspaceId: "workspace_1",
        providerRuleId: created.rule.id,
        sourceDeliveryId: "delivery_observed",
        channelId: "channel_1",
        occurredAt: new Date("2026-07-22T15:00:00.000Z"),
        status: "observed",
        reasonCode: "message_matched_observation",
        normalizedResult: {
          matchedTriggerPhrase: "quero saber mais",
          technicalDelivery: {
            state: "failed_retryable",
            retryable: true,
            reasonCode: "MetaCapiNetworkError",
            updatedAt: "2026-07-22T15:01:00.000Z",
          },
          lastProductionFailure: {
            code: "provider_conversion_delivery_failed",
            failedAt: "2026-07-22T15:01:00.000Z",
          },
        },
        leadId: "lead_1",
        valueCents: null,
        currency: null,
        conversionEventLogId: null,
        attemptCount: 1,
        processedAt: null,
        channel: {
          id: "channel_1",
          channelName: "Comercial",
          connectedPhone: "+5511888880000",
        },
        purchaseReview: null,
      },
      {
        id: "execution_blocked",
        workspaceId: "workspace_1",
        providerRuleId: created.rule.id,
        sourceDeliveryId: "delivery_blocked",
        channelId: "channel_1",
        occurredAt: new Date("2026-07-22T14:00:00.000Z"),
        status: "blocked",
        reasonCode: "message_author_not_allowed",
        normalizedResult: null,
        leadId: null,
        valueCents: null,
        currency: null,
        conversionEventLogId: null,
        attemptCount: 0,
        processedAt: null,
        channel: null,
        purchaseReview: null,
      },
    );

    const result = await harness.service.listRuleExecutions(
      "workspace_1",
      created.rule.id,
      { page: 1, pageSize: 50 },
    );

    expect(result.eventName).toBe("QualifiedLead");
    expect(result.summary).toMatchObject({ total: 2, observed: 1, blocked: 1 });
    expect(result.items[0]).toMatchObject({
      executionId: "execution_observed",
      leadName: "Cliente IC",
      phoneDisplay: "+5511999990000",
      matchedTriggerPhrase: "quero saber mais",
      technicalDelivery: {
        state: "failed_retryable",
        retryable: true,
        reasonCode: "MetaCapiNetworkError",
        updatedAt: "2026-07-22T15:01:00.000Z",
      },
      lastProductionFailure: {
        code: "provider_conversion_delivery_failed",
        failedAt: "2026-07-22T15:01:00.000Z",
      },
    });
    expect(harness.prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace_1", id: { in: ["lead_1"] } },
      }),
    );
  });

  it("returns zeroed summary when the rule has no executions", async () => {
    const harness = createHarness();
    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Lead sem historico",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "message_phrase",
        eventName: "QualifiedLead",
        triggerPhrases: ["quero contato"],
        messageAuthorScope: "contact",
        valueMode: "fixed",
      },
      "user_1",
    );

    const result = await harness.service.listRuleExecutions(
      "workspace_1",
      created.rule.id,
      { page: 1, pageSize: 50 },
    );

    expect(result.summary.total).toBe(0);
    expect(result.summary).toMatchObject({
      observed: 0,
      eligible: 0,
      materialized: 0,
      duplicate: 0,
      blocked: 0,
      failed: 0,
    });
    expect(result.items).toEqual([]);
  });

  it("promotes a legacy purchase rule to an Umbler message rule in observation", async () => {
    const now = new Date("2026-07-21T20:00:00.000Z");
    const harness = createHarness(1, {
      id: "legacy_rule_1",
      workspaceId: "workspace_1",
      name: "Compra por aviso",
      triggerType: "keyword",
      triggerValue: "AVISO DE COMPRA",
      matchMode: "exact",
      eventName: "Purchase",
      pixelId: null,
      defaultValueCents: 9_990,
      defaultCurrency: "BRL",
      defaultContentName: "Banda larga",
      defaultItems: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const adapted = await harness.service.adaptLegacyMessageRule(
      "workspace_1",
      "legacy_rule_1",
      {
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        triggerPhrases: ["Aviso de compra"],
        messageAuthorScope: "team",
      },
      "user_1",
    );

    expect(adapted).toMatchObject({
      connectionId: "connection_1",
      mode: "observation",
      channelIds: ["channel_1"],
      triggerPhrases: ["Aviso de compra"],
      messageAuthorScope: "team",
      conversionRule: {
        id: "legacy_rule_1",
        triggerType: "message_phrase",
        triggerValue: "Aviso de compra",
        matchMode: "contains",
        eventName: "Purchase",
        defaultValueCents: 9_990,
      },
    });
    expect(adapted.endpoint).toBeNull();
    expect(harness.audits.at(-1)).toMatchObject({
      action: "provider_conversion_rule.adapted",
      resultStatus: "observation",
    });
  });

  it("does not adapt the same legacy rule more than once", async () => {
    const now = new Date("2026-07-21T20:00:00.000Z");
    const harness = createHarness(1, {
      id: "legacy_rule_1",
      workspaceId: "workspace_1",
      name: "Compra por aviso",
      triggerType: "keyword",
      triggerValue: "AVISO DE COMPRA",
      matchMode: "contains",
      eventName: "Purchase",
      pixelId: null,
      defaultValueCents: 9_990,
      defaultCurrency: "BRL",
      defaultContentName: "Banda larga",
      defaultItems: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const input = {
      connectionId: "connection_1",
      channelIds: ["channel_1"],
      triggerPhrases: ["Aviso de compra"],
      messageAuthorScope: "team" as const,
    };

    await harness.service.adaptLegacyMessageRule(
      "workspace_1",
      "legacy_rule_1",
      input,
      "user_1",
    );

    await expect(
      harness.service.adaptLegacyMessageRule(
        "workspace_1",
        "legacy_rule_1",
        input,
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Esta regra ja esta vinculada a um provedor",
    });
  });

  it("creates a workspace-scoped rule and returns its signed URL only once", async () => {
    const harness = createHarness();

    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Lead qualificado Umbler",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "provider_automation",
        eventName: "QualifiedLead",
      },
      "user_1",
    );

    const url = new URL(created.webhookUrl ?? "");
    const plaintextSecret = url.searchParams.get("token");
    expect(url.pathname).toBe("/webhooks/inbound/conversions/endpoint_1");
    expect(plaintextSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(harness.endpoint?.secretHash).toBe(
      createHash("sha256")
        .update(plaintextSecret ?? "")
        .digest("hex"),
    );
    expect(harness.endpoint).not.toHaveProperty("secret");
    expect(harness.audits[0]).not.toHaveProperty("secret");
    expect(JSON.stringify(harness.audits[0])).not.toContain(plaintextSecret);

    const listed = await harness.service.listRules("workspace_1");
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(plaintextSecret);
    expect(JSON.stringify(listed)).not.toContain(harness.endpoint?.secretHash);
  });

  it("creates a message_phrase rule on a UAZAPI connection without requiring Umbler", async () => {
    const harness = createHarness();
    harness.connection.provider = "uazapi";
    harness.connection.displayName = "Whats Bento";
    harness.connection.parserRelease = {
      ...harness.connection.parserRelease,
      provider: "uazapi",
      version: "uazapi-v1",
    };

    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Lead qualificado por mensagem",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "message_phrase",
        eventName: "QualifiedLead",
        triggerPhrases: ["A sua consulta esta agendada"],
        messageAuthorScope: "team",
        valueMode: "fixed",
      },
      "user_1",
    );

    expect(created.rule.conversionRule.triggerType).toBe("message_phrase");
    expect(created.rule.conversionRule.eventName).toBe("QualifiedLead");
    expect(created.rule.connectionId).toBe("connection_1");
    expect(created.webhookUrl).toBeNull();
    expect(harness.prisma.conversionRule.create).toHaveBeenCalled();
  });

  it("creates a message_phrase rule on a Gupshup connection", async () => {
    const harness = createHarness();
    harness.connection.provider = "gupshup";
    harness.connection.displayName = "Gupshup Cliente";
    harness.connection.parserRelease = {
      ...harness.connection.parserRelease,
      provider: "gupshup",
      version: "gupshup-v1",
    };

    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Lead qualificado Gupshup",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "message_phrase",
        eventName: "QualifiedLead",
        triggerPhrases: ["A sua consulta esta agendada"],
        messageAuthorScope: "team",
        valueMode: "fixed",
      },
      "user_1",
    );

    expect(created.rule.conversionRule.triggerType).toBe("message_phrase");
    expect(created.rule.connectionId).toBe("connection_1");
    expect(created.webhookUrl).toBeNull();
    expect(
      harness.prisma.inboundWebhookConnection.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "connection_1",
          workspaceId: "workspace_1",
          removedAt: null,
        },
      }),
    );
  });

  it("creates tag automation on a UAZAPI connection using configured labels", async () => {
    const harness = createHarness();
    harness.connection.provider = "uazapi";
    harness.connection.parserRelease = {
      ...harness.connection.parserRelease,
      provider: "uazapi",
      version: "uazapi-v1",
    };

    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Tag UAZAPI",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "provider_automation",
        eventName: "QualifiedLead",
        triggerPhrases: ["  Venda fechada  ", "VIP"],
      },
      "user_1",
    );

    expect(created.webhookUrl).toBeNull();
    expect(created.rule.triggerPhrases).toEqual(["Venda fechada", "VIP"]);
    expect(created.rule.conversionRule.triggerValue).toBe("Venda fechada");
    expect(
      harness.prisma.providerConversionRuleEndpoint.create,
    ).not.toHaveBeenCalled();
  });

  it("requires at least one label for UAZAPI tag automation", async () => {
    const harness = createHarness();
    harness.connection.provider = "uazapi";

    await expect(
      harness.service.createRule(
        "workspace_1",
        {
          name: "Tag UAZAPI",
          connectionId: "connection_1",
          channelIds: ["channel_1"],
          mode: "observation",
          triggerType: "provider_automation",
          eventName: "QualifiedLead",
          triggerPhrases: [],
        },
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Informe ao menos uma etiqueta para automacao por tag UAZAPI",
    });
  });

  it("rejects a channel that is outside the selected workspace connection", async () => {
    const harness = createHarness(0);

    await expect(
      harness.service.createRule(
        "workspace_1",
        {
          name: "Lead qualificado Umbler",
          connectionId: "connection_1",
          channelIds: ["channel_from_another_workspace"],
          mode: "observation",
          triggerType: "provider_automation",
          eventName: "QualifiedLead",
        },
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Um ou mais canais nao pertencem a esta conexao e workspace",
    });

    expect(harness.prisma.conversionRule.create).not.toHaveBeenCalled();
    expect(
      harness.prisma.providerConversionRuleEndpoint.create,
    ).not.toHaveBeenCalled();
  });

  it("persists the message_phrase value pipeline on defaultItems", async () => {
    const harness = createHarness();

    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Checkout por mensagem",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "message_phrase",
        eventName: "InitiateCheckout",
        triggerPhrases: ["link de pagamento"],
        messageAuthorScope: "team",
        valueMode: "message_extracted",
        exampleMessage: "Segue o link de pagamento de R$ 250,00",
        defaultCurrency: "BRL",
      },
      "user_1",
    );

    expect(harness.conversionRule?.defaultItems).toEqual({
      kind: "message_phrase_config_v1",
      valueMode: "message_extracted",
      exampleMessage: "Segue o link de pagamento de R$ 250,00",
    });
    expect(harness.conversionRule?.defaultValueCents).toBeNull();
    expect(created.rule).toMatchObject({
      valueMode: "message_extracted",
      exampleMessage: "Segue o link de pagamento de R$ 250,00",
      conversionRule: {
        eventName: "InitiateCheckout",
        triggerType: "message_phrase",
        // the config object never leaks into the product item contract
        defaultItems: null,
      },
    });
  });

  it("keeps a fixed checkout rule on the average value it was created with", async () => {
    const harness = createHarness();

    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Checkout Dr Hernia",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "message_phrase",
        eventName: "InitiateCheckout",
        triggerPhrases: ["iniciou checkout"],
        messageAuthorScope: "team",
        valueMode: "fixed",
        defaultValueCents: 25_000,
        defaultCurrency: "BRL",
      },
      "user_1",
    );

    expect(created.rule).toMatchObject({
      valueMode: "fixed",
      exampleMessage: null,
      conversionRule: { defaultValueCents: 25_000, defaultCurrency: "BRL" },
    });

    await expect(
      harness.service.updateRule(
        "workspace_1",
        created.rule.id,
        { defaultValueCents: null },
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Regras com valor fixo precisam manter um valor positivo",
    });
  });

  it("switches a message rule to extracted values and drops the fixed value", async () => {
    const harness = createHarness();
    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Compra por mensagem",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "message_phrase",
        eventName: "Purchase",
        triggerPhrases: ["Aviso de compra"],
        messageAuthorScope: "team",
        valueMode: "fixed",
        defaultValueCents: 99_900,
        defaultCurrency: "BRL",
      },
      "user_1",
    );

    const updated = await harness.service.updateRule(
      "workspace_1",
      created.rule.id,
      {
        valueMode: "message_extracted",
        exampleMessage: "Compra confirmada no valor de R$ 250,00",
        defaultValueCents: null,
      },
      "user_1",
    );

    expect(updated).toMatchObject({
      valueMode: "message_extracted",
      exampleMessage: "Compra confirmada no valor de R$ 250,00",
      conversionRule: { defaultValueCents: null },
    });
  });

  it("refuses the value pipeline on rules that are not message_phrase", async () => {
    const harness = createHarness();
    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Compra media por tag",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "provider_automation",
        eventName: "Purchase",
        defaultValueCents: 250_000,
        defaultCurrency: "BRL",
      },
      "user_1",
    );

    await expect(
      harness.service.updateRule(
        "workspace_1",
        created.rule.id,
        { valueMode: "message_extracted" },
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "O modo de valor pertence apenas a regras por mensagem com valor",
    });
  });

  it("creates a qualified-lead rule by message without any value field", async () => {
    const harness = createHarness();

    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Lead qualificado por mensagem",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "message_phrase",
        eventName: "QualifiedLead",
        triggerPhrases: ["vou te passar os valores"],
        messageAuthorScope: "team",
        // the create schema defaults valueMode to "fixed" even for events
        // that never carry a value
        valueMode: "fixed",
        exampleMessage: "Vou te passar os valores do procedimento",
      },
      "user_1",
    );

    expect(created.rule).toMatchObject({
      exampleMessage: "Vou te passar os valores do procedimento",
      conversionRule: {
        eventName: "QualifiedLead",
        triggerType: "message_phrase",
        defaultValueCents: null,
        defaultCurrency: null,
        defaultContentName: null,
      },
    });

    // A valueless event has no value pipeline to switch.
    await expect(
      harness.service.updateRule(
        "workspace_1",
        created.rule.id,
        { valueMode: "message_extracted" },
        "user_1",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("persists an AddToCart rule by tag with its average value", async () => {
    const harness = createHarness();

    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Carrinho por tag",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "provider_automation",
        eventName: "AddToCart",
        defaultValueCents: 12_900,
        defaultCurrency: "BRL",
        defaultContentName: "Kit basico",
      },
      "user_1",
    );

    expect(created.rule).toMatchObject({
      conversionRule: {
        eventName: "AddToCart",
        triggerType: "provider_automation",
        defaultValueCents: 12_900,
        defaultCurrency: "BRL",
        defaultContentName: "Kit basico",
      },
    });

    const updated = await harness.service.updateRule(
      "workspace_1",
      created.rule.id,
      { defaultValueCents: 19_900 },
      "user_1",
    );
    expect(updated).toMatchObject({
      conversionRule: { defaultValueCents: 19_900 },
    });
  });

  it("activates a certified provider automation only after an explicit update", async () => {
    const harness = createHarness();
    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Compra media por tag",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "provider_automation",
        eventName: "Purchase",
        defaultValueCents: 250_000,
        defaultCurrency: "BRL",
      },
      "user_1",
    );

    const activated = await harness.service.updateRule(
      "workspace_1",
      created.rule.id,
      { mode: "production" },
      "user_1",
    );

    expect(created.rule.mode).toBe("observation");
    expect(activated.mode).toBe("production");
    expect(activated.productionActivatedAt).toBeTruthy();
  });

  it("returns the latest redacted execution with the rule", async () => {
    const harness = createHarness();
    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Lead qualificado Umbler",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "provider_automation",
        eventName: "QualifiedLead",
      },
      "user_1",
    );
    const occurredAt = new Date("2026-07-21T21:30:00.000Z");
    harness.executions.push({
      id: "execution_1",
      workspaceId: "workspace_1",
      providerRuleId: created.rule.id,
      sourceDeliveryId: "delivery_1",
      channelId: "channel_1",
      externalExecutionKey: "provider-event:1",
      occurredAt,
      status: "observed",
      reasonCode: "automation_payload_pending_certification",
      matchedCatalogVariantId: null,
      valueCents: null,
      currency: null,
      leadId: null,
      conversionEventLogId: null,
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    const [listed] = await harness.service.listRules("workspace_1");

    expect(listed?.lastExecution).toMatchObject({
      id: "execution_1",
      status: "observed",
      reasonCode: "automation_payload_pending_certification",
      occurredAt: "2026-07-21T21:30:00.000Z",
    });
    expect(JSON.stringify(listed)).not.toContain("normalizedResult");
  });

  it("updates only catalog aliases in place after the rule has history", async () => {
    const harness = createHarness();
    const inputCatalog = catalogInput();
    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Compra confirmada - Cama elastica",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "structured_catalog",
        eventName: "Purchase",
        triggerPhrases: ["Dados para confirmar o pedido"],
        messageAuthorScope: "both",
        catalog: inputCatalog,
      },
      "user_1",
    );
    const originalVariantIds = created.rule.catalog?.variants.map(
      (variant) => variant.id,
    );
    addCatalogExecution(harness.executions, created.rule.id);

    const updated = await harness.service.updateRule(
      "workspace_1",
      created.rule.id,
      {
        catalog: {
          ...inputCatalog,
          variants: inputCatalog.variants.map((variant) => ({
            ...variant,
            aliases:
              variant.attributeValues[1] === "Nacional"
                ? [["4.9", "4,90"], ["Tradicional"]]
                : variant.aliases,
          })),
        },
      },
      "user_1",
    );

    expect(updated.catalog?.variants.map((variant) => variant.id)).toEqual(
      originalVariantIds,
    );
    expect(updated.catalog?.variants[0]?.aliases).toEqual([
      ["4.9", "4,90"],
      ["Tradicional"],
    ]);
    expect(
      harness.prisma.conversionCatalogVariant.deleteMany,
    ).not.toHaveBeenCalled();
    expect(
      harness.prisma.conversionCatalogVariant.updateMany,
    ).toHaveBeenCalledTimes(1);
  });

  it("keeps catalog prices immutable after the rule has history", async () => {
    const harness = createHarness();
    const inputCatalog = catalogInput();
    const created = await harness.service.createRule(
      "workspace_1",
      {
        name: "Compra confirmada - Cama elastica",
        connectionId: "connection_1",
        channelIds: ["channel_1"],
        mode: "observation",
        triggerType: "structured_catalog",
        eventName: "Purchase",
        triggerPhrases: ["Dados para confirmar o pedido"],
        messageAuthorScope: "both",
        catalog: inputCatalog,
      },
      "user_1",
    );
    addCatalogExecution(harness.executions, created.rule.id);

    await expect(
      harness.service.updateRule(
        "workspace_1",
        created.rule.id,
        {
          catalog: {
            ...inputCatalog,
            variants: inputCatalog.variants.map((variant, index) => ({
              ...variant,
              valueCents:
                index === 0 ? variant.valueCents + 100 : variant.valueCents,
            })),
          },
        },
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "O catalogo com historico aceita apenas alteracoes de aliases",
    });

    expect(
      harness.prisma.conversionCatalogVariant.updateMany,
    ).not.toHaveBeenCalled();
  });
});

describe("provider conversion rules Envio ativo cascade", () => {
  const messageRuleInput = (mode: "observation" | "production") => ({
    name: "Consulta agendada",
    connectionId: "connection_1",
    channelIds: ["channel_1"],
    mode,
    triggerType: "message_phrase" as const,
    eventName: "InitiateCheckout" as const,
    triggerPhrases: ["consulta agendada"],
    messageAuthorScope: "team" as const,
    valueMode: "fixed" as const,
  });

  it("promotes the connection and the rule channels when Envio ativo is turned on", async () => {
    const harness = createHarness(1, null, {
      connectionProvider: "uazapi",
      connectionStatus: "observation",
      channelStatus: "discovered",
    });
    const created = await harness.service.createRule(
      "workspace_1",
      messageRuleInput("observation"),
      "user_1",
    );

    expect(harness.connection.status).toBe("observation");
    expect(harness.inboundChannels[0]?.status).toBe("discovered");

    const activated = await harness.service.updateRule(
      "workspace_1",
      created.rule.id,
      { mode: "production" },
      "user_1",
    );

    expect(activated.mode).toBe("production");
    expect(harness.connection.status).toBe("production");
    expect(harness.connection.productionActivatedAt).toBeTruthy();
    expect(harness.inboundChannels[0]).toMatchObject({ status: "active" });
    expect(harness.inboundChannels[0]?.productionActivatedAt).toBeTruthy();
    expect(harness.audits.map((audit) => audit.action)).toEqual(
      expect.arrayContaining([
        "inbound_webhook.channel_activated",
        "inbound_webhook.connection_promoted",
        "provider_conversion_rule.activated",
      ]),
    );
  });

  it("activates directly in production when the channel has a valid Meta route", async () => {
    const harness = createHarness(1, null, {
      connectionProvider: "uazapi",
      connectionStatus: "observation",
      channelStatus: "discovered",
    });

    const created = await harness.service.createRule(
      "workspace_1",
      messageRuleInput("production"),
      "user_1",
    );

    expect(created.rule.mode).toBe("production");
    expect(harness.connection.status).toBe("production");
    expect(harness.inboundChannels[0]).toMatchObject({ status: "active" });
    expect(harness.inboundChannels[0]?.productionActivatedAt).toBeTruthy();
  });

  it("activates only the channels linked to the rule", async () => {
    const harness = createHarness(2, null, {
      connectionProvider: "uazapi",
      connectionStatus: "observation",
      channelStatus: "discovered",
    });

    await harness.service.createRule(
      "workspace_1",
      messageRuleInput("production"),
      "user_1",
    );

    expect(harness.inboundChannels[0]).toMatchObject({ status: "active" });
    expect(harness.inboundChannels[1]).toMatchObject({
      status: "discovered",
      productionActivatedAt: null,
    });
  });

  it("activates a channel added to a rule that is already in production", async () => {
    const harness = createHarness(2, null, {
      connectionProvider: "uazapi",
      connectionStatus: "observation",
      channelStatus: "discovered",
    });
    const created = await harness.service.createRule(
      "workspace_1",
      messageRuleInput("production"),
      "user_1",
    );

    await harness.service.updateRule(
      "workspace_1",
      created.rule.id,
      { channelIds: ["channel_1", "channel_2"] },
      "user_1",
    );

    expect(harness.inboundChannels[1]).toMatchObject({ status: "active" });
    expect(harness.inboundChannels[1]?.productionActivatedAt).toBeTruthy();
  });

  it("leaves the connection alone when the rule is only renamed", async () => {
    const harness = createHarness(1, null, {
      connectionProvider: "uazapi",
      connectionStatus: "observation",
      channelStatus: "discovered",
    });
    const created = await harness.service.createRule(
      "workspace_1",
      messageRuleInput("observation"),
      "user_1",
    );

    await harness.service.updateRule(
      "workspace_1",
      created.rule.id,
      { name: "Consulta agendada (novo nome)" },
      "user_1",
    );

    expect(harness.connection.status).toBe("observation");
    expect(harness.inboundChannels[0]).toMatchObject({
      status: "discovered",
      productionActivatedAt: null,
    });
  });

  it("never downgrades the connection when the rule goes back to observation", async () => {
    const harness = createHarness(1, null, {
      connectionProvider: "uazapi",
      connectionStatus: "observation",
      channelStatus: "discovered",
    });
    const created = await harness.service.createRule(
      "workspace_1",
      messageRuleInput("production"),
      "user_1",
    );

    const paused = await harness.service.updateRule(
      "workspace_1",
      created.rule.id,
      { mode: "observation" },
      "user_1",
    );

    expect(paused.mode).toBe("observation");
    expect(harness.connection.status).toBe("production");
    expect(harness.inboundChannels[0]).toMatchObject({ status: "active" });
  });

  it("fails closed instead of showing Envio ativo over a channel without a Meta route", async () => {
    const harness = createHarness(1, null, {
      connectionStatus: "observation",
      channelStatus: "discovered",
      channelHasValidRoute: false,
    });
    const created = await harness.service.createRule(
      "workspace_1",
      messageRuleInput("observation"),
      "user_1",
    );

    await expect(
      harness.service.updateRule(
        "workspace_1",
        created.rule.id,
        { mode: "production" },
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Configure uma rota Meta válida antes de ativar o canal",
    });

    expect(harness.connection.status).toBe("observation");
    expect(harness.inboundChannels[0]).toMatchObject({ status: "discovered" });
  });

  it("fails closed when an active Meta route is present but incomplete", async () => {
    const harness = createHarness(1, null, {
      connectionStatus: "observation",
      channelStatus: "discovered",
    });
    harness.inboundChannels[0]!.routes[0]!.metaConversionDestinationId = null;
    const created = await harness.service.createRule(
      "workspace_1",
      messageRuleInput("observation"),
      "user_1",
    );

    await expect(
      harness.service.updateRule(
        "workspace_1",
        created.rule.id,
        { mode: "production" },
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Configure uma rota Meta válida antes de ativar o canal",
    });

    expect(harness.connection.status).toBe("observation");
    expect(harness.inboundChannels[0]).toMatchObject({ status: "discovered" });
  });

  it("skips the Meta route requirement for UAZAPI, which resolves the destination per ad", async () => {
    const harness = createHarness(1, null, {
      connectionProvider: "uazapi",
      connectionStatus: "observation",
      channelStatus: "discovered",
      channelHasValidRoute: false,
    });

    await harness.service.createRule(
      "workspace_1",
      messageRuleInput("production"),
      "user_1",
    );

    expect(harness.connection.status).toBe("production");
    expect(harness.inboundChannels[0]).toMatchObject({ status: "active" });
  });
});
