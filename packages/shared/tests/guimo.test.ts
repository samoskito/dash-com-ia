import { describe, expect, it } from "vitest";
import { guimoIntegrationProvisionInputSchema } from "../src/schemas/guimo";

describe("guimoIntegrationProvisionInputSchema", () => {
  it("accepts a payload with only a qualified stage configured", () => {
    const result = guimoIntegrationProvisionInputSchema.safeParse({
      qualifiedStageId: "stage_qualified",
      qualifiedStageName: "Lead Qualificado",
    });

    expect(result.success).toBe(true);
  });

  it("accepts full configuration with purchase fields and CRM headers", () => {
    const result = guimoIntegrationProvisionInputSchema.safeParse({
      qualifiedStageId: "stage_qualified",
      qualifiedStageName: "Lead Qualificado",
      purchaseStageId: "stage_purchase",
      purchaseStageName: "Venda Fechada",
      purchaseCurrency: "BRL",
      purchaseValueUnit: "cents",
      crmHeaders: { authorization: "Bearer secret", "x-api-key": "key" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload with no stage identifiers at all", () => {
    const result = guimoIntegrationProvisionInputSchema.safeParse({
      purchaseCurrency: "BRL",
      purchaseValueUnit: "major",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid purchaseValueUnit", () => {
    const result = guimoIntegrationProvisionInputSchema.safeParse({
      qualifiedStageId: "stage_qualified",
      purchaseValueUnit: "reais",
    });

    expect(result.success).toBe(false);
  });

  it("rejects CRM headers with an unsupported header name", () => {
    const result = guimoIntegrationProvisionInputSchema.safeParse({
      qualifiedStageId: "stage_qualified",
      crmHeaders: { cookie: "value" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects CRM headers with an empty value", () => {
    const result = guimoIntegrationProvisionInputSchema.safeParse({
      qualifiedStageId: "stage_qualified",
      crmHeaders: { authorization: "   " },
    });

    expect(result.success).toBe(false);
  });
});
