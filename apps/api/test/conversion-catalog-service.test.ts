import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { ConversionCatalogService } from "../src/conversion-rules/conversion-catalog.service";

function environment() {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "https://api.wpptrack.test",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_CONVERSION_RULES_ENABLED: "true",
    INBOUND_CONVERSION_PRODUCTION_ENABLED: "false",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64"),
  };
}

function persistedRule(workspaceId = "workspace_1") {
  const now = new Date("2026-07-21T21:00:00.000Z");
  return {
    id: "provider_rule_1",
    workspaceId,
    conversionRule: {
      active: true,
      triggerType: "structured_catalog",
    },
    catalog: {
      id: "catalog_1",
      workspaceId,
      providerRuleId: "provider_rule_1",
      name: "Catalogo de camas elasticas",
      productName: "Cama elastica",
      currency: "BRL",
      active: true,
      createdAt: now,
      updatedAt: now,
      attributes: [
        {
          id: "attribute_1",
          workspaceId,
          catalogId: "catalog_1",
          position: 1,
          key: "tamanho",
          label: "Tamanho",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "attribute_2",
          workspaceId,
          catalogId: "catalog_1",
          position: 2,
          key: "modelo",
          label: "Modelo",
          createdAt: now,
          updatedAt: now,
        },
      ],
      variants: [
        {
          id: "variant_1",
          workspaceId,
          catalogId: "catalog_1",
          normalizedKey: "4,90|nacional",
          attributeValues: ["4,90", "Nacional"],
          aliases: [],
          valueCents: 359_700,
          contentName: null,
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
  };
}

describe("conversion catalog service", () => {
  it("tests a catalog message without writing or publishing side effects", async () => {
    const findFirst = vi.fn(async () => persistedRule());
    const prisma = {
      providerConversionRuleConfig: { findFirst },
    } as unknown as PrismaService;
    const service = new ConversionCatalogService(prisma, environment());

    const result = await service.testMessage("workspace_1", "provider_rule_1", {
      messageText: "Tamanho: 4,90\nModelo: Nacional\n3.597,00",
    });

    expect(result).toMatchObject({
      matched: true,
      reasonCode: "matched",
      catalogVariantId: "variant_1",
      parsedValueCents: 359_700,
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "provider_rule_1",
          workspaceId: "workspace_1",
          removedAt: null,
        }),
      }),
    );
    expect(Object.keys(prisma)).toEqual(["providerConversionRuleConfig"]);
  });

  it("does not return a rule from another workspace", async () => {
    const prisma = {
      providerConversionRuleConfig: {
        findFirst: vi.fn(async () => null),
      },
    } as unknown as PrismaService;
    const service = new ConversionCatalogService(prisma, environment());

    await expect(
      service.testMessage("workspace_2", "provider_rule_1", {
        messageText: "Tamanho: 4,90\nModelo: Nacional\n3.597,00",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("fails closed while provider conversion rules are disabled", async () => {
    const prisma = {
      providerConversionRuleConfig: { findFirst: vi.fn() },
    } as unknown as PrismaService;
    const service = new ConversionCatalogService(prisma, {
      ...environment(),
      INBOUND_CONVERSION_RULES_ENABLED: "false",
    });

    await expect(
      service.testMessage("workspace_1", "provider_rule_1", {
        messageText: "Tamanho: 4,90\nModelo: Nacional\n3.597,00",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
