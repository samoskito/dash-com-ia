import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ProviderConversionObservationService } from "../src/conversion-rules/provider-conversion-observation.service";
import { UmblerV1Parser } from "../src/inbound-webhooks/providers/umbler/umbler-v1.parser";

const workspaceId = "workspace_1";
const connectionId = "connection_1";
const channelId = "channel_1";
const fixturePath = resolve(
  __dirname,
  "fixtures",
  "umbler",
  "message-with-ctwa.json",
);

function outboundCatalogEvent() {
  const body = JSON.parse(readFileSync(fixturePath, "utf8"));
  body.Payload.Content.LastMessage.Source = "Bot";
  body.Payload.Content.LastMessage.BotInstance = { Id: "bot_1" };
  body.Payload.Content.LastMessage.SentByOrganizationMember = null;
  body.Payload.Content.LastMessage.Content =
    "Dados para confirmar o pedido\nTamanho: 4,90\nModelo: Nacional\n3.597,00";
  return new UmblerV1Parser().parse(body).events[0]!;
}

function createHarness(mode: "observation" | "production") {
  const activatedAt = new Date("2026-07-18T00:00:00.000Z");
  const channel = {
    id: channelId,
    organizationId: "org_fixture_001",
    providerChannelId: "channel_fixture_001",
    status: "active",
    productionActivatedAt: activatedAt,
  };
  const rule = {
    id: "provider_rule_1",
    workspaceId,
    connectionId,
    parserReleaseId: "parser_release_1",
    mode,
    productionActivatedAt: mode === "production" ? activatedAt : null,
    removedAt: null,
    createdAt: activatedAt,
    updatedAt: activatedAt,
    conversionRuleId: "conversion_rule_1",
    createdByUserId: "user_1",
    messageTriggerPhrases: ["Dados para confirmar o pedido"],
    messageAuthorScope: "team",
    conversionRule: {
      id: "conversion_rule_1",
      workspaceId,
      name: "Compra catalogo",
      triggerType: "structured_catalog",
      triggerValue: "structured_catalog",
      matchMode: "exact",
      eventName: "Purchase",
      pixelId: null,
      defaultValueCents: null,
      defaultCurrency: "BRL",
      defaultContentName: "Cama elastica",
      defaultItems: null,
      active: true,
      createdAt: activatedAt,
      updatedAt: activatedAt,
    },
    connection: {
      id: connectionId,
      workspaceId,
      provider: "umbler",
      status: "production",
      removedAt: null,
      parserReleaseId: "parser_release_1",
      parserRelease: {
        id: "parser_release_1",
        provider: "umbler",
        version: "v1",
        status: "certified",
      },
    },
    parserRelease: {
      id: "parser_release_1",
      provider: "umbler",
      version: "v1",
      status: "certified",
    },
    channels: [{ id: "scope_1", channelId }],
    catalog: {
      id: "catalog_1",
      workspaceId,
      providerRuleId: "provider_rule_1",
      name: "Tabela",
      productName: "Cama elastica",
      currency: "BRL",
      active: true,
      createdAt: activatedAt,
      updatedAt: activatedAt,
      attributes: [
        {
          id: "attribute_1",
          workspaceId,
          catalogId: "catalog_1",
          position: 1,
          key: "tamanho",
          label: "Tamanho",
          createdAt: activatedAt,
          updatedAt: activatedAt,
        },
        {
          id: "attribute_2",
          workspaceId,
          catalogId: "catalog_1",
          position: 2,
          key: "modelo",
          label: "Modelo",
          createdAt: activatedAt,
          updatedAt: activatedAt,
        },
      ],
      variants: [
        {
          id: "variant_1",
          workspaceId,
          catalogId: "catalog_1",
          normalizedKey: "4,90|nacional",
          attributeValues: ["4,90", "Nacional"],
          aliases: [[], []],
          valueCents: 359_700,
          contentName: "Cama elastica 4,90 Nacional",
          active: true,
          createdAt: activatedAt,
          updatedAt: activatedAt,
        },
      ],
    },
  };
  const executions = new Map<string, Record<string, unknown>>();
  const upsert = vi.fn(async ({ where, create }: any) => {
    const key = `${where.providerRuleId_externalExecutionKey.providerRuleId}:${where.providerRuleId_externalExecutionKey.externalExecutionKey}`;
    const existing = executions.get(key);
    if (existing) return existing;
    const execution = {
      id: `execution_${executions.size + 1}`,
      ...create,
    };
    executions.set(key, execution);
    return execution;
  });
  const prisma = {
    inboundWebhookChannel: {
      findMany: vi.fn(async () => [channel]),
    },
    providerConversionRuleConfig: {
      findMany: vi.fn(async () => [rule]),
    },
    lead: {
      findMany: vi.fn(async () => []),
    },
    providerConversionRuleExecution: { upsert },
    purchaseReview: {
      upsert: vi.fn(async () => ({ id: "review_1" })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const service = new ProviderConversionObservationService(prisma as never, {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_PRODUCTION_ENABLED: "true",
    INBOUND_CONVERSION_RULES_ENABLED: "true",
    INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64"),
  });

  return { executions, service, upsert };
}

describe("provider conversion observation service", () => {
  it("matches an outbound catalog message and marks a production rule eligible", async () => {
    const harness = createHarness("production");
    const event = outboundCatalogEvent();

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_1",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [event],
    });

    expect(result).toEqual({
      executionIds: ["execution_1"],
      eligibleExecutionIds: ["execution_1"],
    });
    expect(harness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "eligible",
          reasonCode: "catalog_matched",
          matchedCatalogVariantId: "variant_1",
          valueCents: 359_700,
          currency: "BRL",
        }),
      }),
    );
    expect(JSON.stringify(harness.upsert.mock.calls[0]?.[0])).not.toContain(
      event.message.text,
    );
  });

  it("keeps a matching observation rule out of the production queue", async () => {
    const harness = createHarness("observation");

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_1",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [outboundCatalogEvent()],
    });

    expect(result.eligibleExecutionIds).toEqual([]);
    expect(harness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "observed",
          reasonCode: "catalog_matched_observation",
        }),
      }),
    );
  });

  it("does not evaluate inbound contact messages as purchases", async () => {
    const harness = createHarness("production");
    const event = outboundCatalogEvent();
    event.message.direction = "inbound";
    event.message.authorType = "contact";

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_1",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [event],
    });

    expect(result).toEqual({ executionIds: [], eligibleExecutionIds: [] });
    expect(harness.upsert).not.toHaveBeenCalled();
  });
});
