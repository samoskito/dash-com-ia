import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const { revalidatePath, serverApiFetch } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  serverApiFetch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../src/lib/server-api", () => ({ serverApiFetch }));

import {
  createGuimoConversionRuleAction,
  deleteGuimoConversionRuleAction,
  provisionGuimoIntegrationAction,
  rotateGuimoWebhookTokenAction,
  setGuimoIntegrationActiveAction,
  updateGuimoConversionRuleAction,
  updateGuimoIntegrationAction,
} from "../src/app/(app)/integrations/guimo-actions";

const webhookToken = "a".repeat(43);
const rotatedToken = "b".repeat(43);

afterEach(() => {
  revalidatePath.mockReset();
  serverApiFetch.mockReset();
});

describe("guimo server actions", () => {
  it("provisions an integration and returns the token only as an ephemeral result", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "integration_1",
      status: "active",
      webhookVersion: "guimo/v1",
      webhookToken,
      webhookUrl: `https://api.wpptrack.test/webhooks/guimo/v1/integration_1`,
      webhookPath: "/webhooks/guimo/v1/integration_1",
    });

    const result = await provisionGuimoIntegrationAction(
      form({
        workspaceId: "workspace_1",
        qualifiedStageId: "stage_qualified",
        qualifiedStageName: "Lead Qualificado",
        purchaseStageId: "stage_purchase",
        purchaseStageName: "Venda Fechada",
        purchaseCurrency: "BRL",
        purchaseValueUnit: "cents",
        crmAuthorization: "Bearer secret-token",
        crmApiKey: "api-key-value",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations",
      {
        method: "POST",
        body: JSON.stringify({
          qualifiedStageId: "stage_qualified",
          qualifiedStageName: "Lead Qualificado",
          purchaseStageId: "stage_purchase",
          purchaseStageName: "Venda Fechada",
          purchaseCurrency: "BRL",
          purchaseValueUnit: "cents",
          crmHeaders: {
            authorization: "Bearer secret-token",
            "x-api-key": "api-key-value",
          },
        }),
      },
    );
    expect(result).toEqual({
      ok: true,
      message:
        "Integracao Guimo criada. Copie o token e a URL agora; eles nao serao exibidos novamente.",
      oneTimeWebhook: {
        webhookToken,
        webhookUrl: "https://api.wpptrack.test/webhooks/guimo/v1/integration_1",
        webhookPath: "/webhooks/guimo/v1/integration_1",
      },
    });
    expect(result.message).not.toContain(webhookToken);
    expect(JSON.stringify(result)).not.toContain("Bearer secret-token");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("omits crmHeaders entirely when no CRM credential fields are filled", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "integration_1",
      status: "blocked",
      webhookVersion: "guimo/v1",
      webhookToken,
      webhookUrl: null,
      webhookPath: "/webhooks/guimo/v1/integration_1",
    });

    await provisionGuimoIntegrationAction(
      form({
        workspaceId: "workspace_1",
        qualifiedStageId: "stage_qualified",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations",
      {
        method: "POST",
        body: JSON.stringify({ qualifiedStageId: "stage_qualified" }),
      },
    );
  });

  it("rejects a provision form with no stage identifier before calling the API", async () => {
    const result = await provisionGuimoIntegrationAction(
      form({ workspaceId: "workspace_1", purchaseCurrency: "BRL" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a provision form missing the workspace id before calling the API", async () => {
    const result = await provisionGuimoIntegrationAction(
      form({ qualifiedStageId: "stage_qualified" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("sanitizes API errors instead of leaking backend detail", async () => {
    const sensitive = "crm-secret=super-secret-value";
    serverApiFetch.mockRejectedValueOnce(new Error(sensitive));

    const result = await provisionGuimoIntegrationAction(
      form({ workspaceId: "workspace_1", qualifiedStageId: "stage_qualified" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain(sensitive);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not forward an invalid token-bearing API response", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "integration_1",
      status: "active",
      webhookVersion: "guimo/v1",
      webhookToken: "short",
      webhookUrl: null,
      webhookPath: "/webhooks/guimo/v1/integration_1",
      extraSecret: "must-not-leak",
    });

    const result = await provisionGuimoIntegrationAction(
      form({ workspaceId: "workspace_1", qualifiedStageId: "stage_qualified" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rotates the webhook token through the tenant-scoped endpoint", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "integration_1",
      status: "active",
      webhookVersion: "guimo/v1",
      webhookToken: rotatedToken,
      webhookUrl: "https://api.wpptrack.test/webhooks/guimo/v1/integration_1",
      webhookPath: "/webhooks/guimo/v1/integration_1",
    });

    const result = await rotateGuimoWebhookTokenAction(
      form({ workspaceId: "workspace_1", integrationId: "integration_1" }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations/integration_1/rotate-webhook-token",
      { method: "POST", body: "{}" },
    );
    expect(result).toEqual({
      ok: true,
      message:
        "Token rotacionado. Copie o novo token agora; ele nao sera exibido novamente.",
      oneTimeWebhook: {
        webhookToken: rotatedToken,
        webhookUrl: "https://api.wpptrack.test/webhooks/guimo/v1/integration_1",
        webhookPath: "/webhooks/guimo/v1/integration_1",
      },
    });
    expect(result.message).not.toContain(rotatedToken);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("rejects a rotate call missing the integration id before calling the API", async () => {
    const result = await rotateGuimoWebhookTokenAction(
      form({ workspaceId: "workspace_1" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("sanitizes rotate API errors", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("token=leaked-value"));

    const result = await rotateGuimoWebhookTokenAction(
      form({ workspaceId: "workspace_1", integrationId: "integration_1" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("leaked-value");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("updates the stage name and value fields of an existing rule", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "integration_1",
      status: "active",
      webhookVersion: "guimo/v1",
      qualifiedStageId: null,
      qualifiedStageName: "Lead Qualificado",
      purchaseStageId: null,
      purchaseStageName: "Venda Fechada",
      purchaseCurrency: "BRL",
      purchaseValueUnit: "cents",
      hasCrmHeaders: true,
      rules: [],
      createdAt: "2026-07-17T18:00:00.000Z",
      updatedAt: "2026-07-17T19:00:00.000Z",
    });

    const result = await updateGuimoIntegrationAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        purchaseStageName: "Venda Fechada",
        purchaseCurrency: "BRL",
        purchaseValueUnit: "cents",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations/integration_1",
      {
        method: "PATCH",
        body: JSON.stringify({
          purchaseStageName: "Venda Fechada",
          purchaseCurrency: "BRL",
          purchaseValueUnit: "cents",
        }),
      },
    );
    expect(result).toMatchObject({ ok: true, message: "Regra Guimo atualizada." });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("rejects an update with a blank stage name before calling the API", async () => {
    const result = await updateGuimoIntegrationAction(
      form({ workspaceId: "workspace_1", integrationId: "integration_1" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("sanitizes update API errors instead of leaking backend detail", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("crm-secret=super-secret-value"));

    const result = await updateGuimoIntegrationAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        purchaseStageName: "Venda Fechada",
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("super-secret-value");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("pauses an active rule through the tenant-scoped active endpoint", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "integration_1",
      status: "paused",
      webhookVersion: "guimo/v1",
      qualifiedStageId: null,
      qualifiedStageName: "Lead Qualificado",
      purchaseStageId: null,
      purchaseStageName: "Venda Fechada",
      purchaseCurrency: "BRL",
      purchaseValueUnit: "cents",
      hasCrmHeaders: true,
      rules: [],
      createdAt: "2026-07-17T18:00:00.000Z",
      updatedAt: "2026-07-17T19:00:00.000Z",
    });

    const result = await setGuimoIntegrationActiveAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        active: "false",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations/integration_1/active",
      { method: "POST", body: JSON.stringify({ active: false }) },
    );
    expect(result).toMatchObject({ ok: true, message: "Regra Guimo pausada." });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("rejects a set-active call missing the integration id before calling the API", async () => {
    const result = await setGuimoIntegrationActiveAction(
      form({ workspaceId: "workspace_1", active: "true" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("creates a free-form conversion rule with a dynamic value", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "rule_1",
      stageName: "Lead Qualificado",
      eventName: "QualifiedLead",
      valueMode: "dynamic",
      fixedValueCents: null,
      active: true,
      createdAt: "2026-08-31T18:00:00.000Z",
      updatedAt: "2026-08-31T18:00:00.000Z",
    });

    const result = await createGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        stageName: "Lead Qualificado",
        eventName: "QualifiedLead",
        valueMode: "dynamic",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations/integration_1/rules",
      {
        method: "POST",
        body: JSON.stringify({
          stageName: "Lead Qualificado",
          eventName: "QualifiedLead",
          valueMode: "dynamic",
          fixedValueCents: null,
        }),
      },
    );
    expect(result).toMatchObject({ ok: true, message: "Regra Guimo criada." });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("creates a free-form conversion rule with a fixed value in cents", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "rule_2",
      stageName: "Venda Fechada",
      eventName: "Purchase",
      valueMode: "fixed",
      fixedValueCents: 19990,
      active: true,
      createdAt: "2026-08-31T18:00:00.000Z",
      updatedAt: "2026-08-31T18:00:00.000Z",
    });

    const result = await createGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        stageName: "Venda Fechada",
        eventName: "Purchase",
        valueMode: "fixed",
        fixedValueAmount: "199,90",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations/integration_1/rules",
      {
        method: "POST",
        body: JSON.stringify({
          stageName: "Venda Fechada",
          eventName: "Purchase",
          valueMode: "fixed",
          fixedValueCents: 19990,
        }),
      },
    );
    expect(result).toMatchObject({ ok: true, message: "Regra Guimo criada." });
  });

  it("rejects a fixed-value rule creation without a positive value before calling the API", async () => {
    const result = await createGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        stageName: "Venda Fechada",
        eventName: "Purchase",
        valueMode: "fixed",
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("rejects a rule creation missing the stage name before calling the API", async () => {
    const result = await createGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        eventName: "QualifiedLead",
        valueMode: "dynamic",
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("updates a conversion rule's stage name and conversion event", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "rule_1",
      stageName: "Lead Muito Qualificado",
      eventName: "QualifiedLead",
      valueMode: "dynamic",
      fixedValueCents: null,
      active: true,
      createdAt: "2026-08-31T18:00:00.000Z",
      updatedAt: "2026-08-31T19:00:00.000Z",
    });

    const result = await updateGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        ruleId: "rule_1",
        stageName: "Lead Muito Qualificado",
        eventName: "QualifiedLead",
        valueMode: "dynamic",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations/integration_1/rules/rule_1",
      {
        method: "PATCH",
        body: JSON.stringify({
          stageName: "Lead Muito Qualificado",
          eventName: "QualifiedLead",
          valueMode: "dynamic",
          fixedValueCents: null,
        }),
      },
    );
    expect(result).toMatchObject({ ok: true, message: "Regra Guimo atualizada." });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("pauses a rule by toggling active without touching other fields", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "rule_1",
      stageName: "Lead Qualificado",
      eventName: "QualifiedLead",
      valueMode: "dynamic",
      fixedValueCents: null,
      active: false,
      createdAt: "2026-08-31T18:00:00.000Z",
      updatedAt: "2026-08-31T19:00:00.000Z",
    });

    const result = await updateGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        ruleId: "rule_1",
        active: "false",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations/integration_1/rules/rule_1",
      {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      },
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("rejects a rule update to a fixed value without a positive amount before calling the API", async () => {
    const result = await updateGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        ruleId: "rule_1",
        valueMode: "fixed",
        fixedValueAmount: "0",
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("rejects a rule update missing the rule id before calling the API", async () => {
    const result = await updateGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        stageName: "Lead Qualificado",
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("deletes a conversion rule through the tenant-scoped endpoint", async () => {
    serverApiFetch.mockResolvedValueOnce({ status: "deleted" });

    const result = await deleteGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        ruleId: "rule_1",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/workspaces/workspace_1/guimo/integrations/integration_1/rules/rule_1",
      { method: "DELETE" },
    );
    expect(result).toMatchObject({ ok: true, message: "Regra Guimo removida." });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("rejects a rule deletion missing the rule id before calling the API", async () => {
    const result = await deleteGuimoConversionRuleAction(
      form({ workspaceId: "workspace_1", integrationId: "integration_1" }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("sanitizes rule mutation API errors instead of leaking backend detail", async () => {
    serverApiFetch.mockRejectedValueOnce(new Error("crm-secret=super-secret-value"));

    const result = await createGuimoConversionRuleAction(
      form({
        workspaceId: "workspace_1",
        integrationId: "integration_1",
        stageName: "Lead Qualificado",
        eventName: "QualifiedLead",
        valueMode: "dynamic",
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("super-secret-value");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}
