import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { ProviderConversionRulesService } from "../src/conversion-rules/provider-conversion-rules.service";

function runtimeEnvironment() {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "https://api.wpptrack.test",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_CONVERSION_RULES_ENABLED: "true",
    INBOUND_CONVERSION_PRODUCTION_ENABLED: "false",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString("base64"),
  };
}

function createHarness(channelCount = 1) {
  const now = new Date("2026-07-21T21:00:00.000Z");
  const parserRelease = {
    id: "inbound_parser_umbler_automation_v1",
    provider: "umbler" as const,
    version: "automation-v1",
    status: "observation_only" as const,
    certifiedByUserId: null,
    certifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const connection = {
    id: "connection_1",
    workspaceId: "workspace_1",
    provider: "umbler" as const,
    displayName: "Umbler Cliente",
    parserReleaseId: "inbound_parser_umbler_v1",
    secretHash: "connection-hash",
    status: "production" as const,
    productionActivatedAt: now,
    createdByUserId: "user_1",
    lastDeliveryAt: null,
    lastSuccessfulParseAt: now,
    removedAt: null,
    createdAt: now,
    updatedAt: now,
    parserRelease: {
      ...parserRelease,
      id: "inbound_parser_umbler_v1",
      version: "v1",
      status: "certified" as const,
    },
  };
  let conversionRule: Record<string, any> | null = null;
  let providerRule: Record<string, any> | null = null;
  let endpoint: Record<string, any> | null = null;
  const channels: Array<Record<string, any>> = [];
  const executions: Array<Record<string, any>> = [];
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
          catalog: null,
          executions,
        }
      : null;

  const prisma: Record<string, any> = {
    inboundWebhookConnection: {
      findFirst: vi.fn(async ({ where }) =>
        where.id === connection.id &&
        where.workspaceId === connection.workspaceId
          ? connection
          : null,
      ),
    },
    inboundWebhookChannel: {
      count: vi.fn(async () => channelCount),
    },
    inboundWebhookParserRelease: {
      findFirst: vi.fn(async () => parserRelease),
    },
    conversionRule: {
      create: vi.fn(async ({ data }) => {
        conversionRule = {
          id: "rule_1",
          createdAt: now,
          updatedAt: now,
          ...data,
          defaultItems: null,
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
    get endpoint() {
      return endpoint;
    },
    executions,
    prisma,
    service,
  };
}

describe("provider conversion rules service", () => {
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

  it("keeps tag automations in observation until a real payload parser is certified", async () => {
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
        { mode: "production" },
        "user_1",
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Automacoes por tag permanecem em observacao ate a certificacao do payload real",
    });
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
});
