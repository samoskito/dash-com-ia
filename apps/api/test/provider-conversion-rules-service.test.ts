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

function createHarness(
  channelCount = 1,
  initialConversionRule: Record<string, any> | null = null,
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
  const connection = {
    id: "connection_1",
    workspaceId: "workspace_1",
    provider: "umbler" as "umbler" | "gupshup" | "uazapi",
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
          catalog,
          executions,
        }
      : null;

  const prisma: Record<string, any> = {
    inboundWebhookConnection: {
      findFirst: vi.fn(async ({ where }) => {
        if (where.id !== connection.id || where.workspaceId !== connection.workspaceId) {
          return null;
        }
        if ("provider" in where) {
          return null;
        }
        return connection;
      }),
    },
    inboundWebhookChannel: {
      count: vi.fn(async () => channelCount),
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
      count: vi.fn(async () => executions.length),
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
    prisma,
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
    expect(harness.prisma.inboundWebhookConnection.findFirst).toHaveBeenCalledWith(
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
    expect(harness.prisma.providerConversionRuleEndpoint.create).not.toHaveBeenCalled();
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
      message: "O modo de valor pertence apenas a regras por mensagem com valor",
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
