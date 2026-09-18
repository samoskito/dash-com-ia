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

  it("accepts credentials-only provisioning without legacy stage or purchase fields", () => {
    const result = guimoIntegrationProvisionInputSchema.safeParse({
      crmHeaders: { authorization: "Bearer secret" },
    });

    expect(result.success).toBe(true);
  });

  it("accepts null optional legacy fields so an update can clear them", () => {
    const result = guimoIntegrationProvisionInputSchema.safeParse({
      qualifiedStageName: null,
      purchaseStageName: null,
      purchaseCurrency: null,
      purchaseValueUnit: null,
    });

    expect(result.success).toBe(true);
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
