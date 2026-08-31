import type { GuimoIntegrationDto } from "@wpptrack/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuimoPanel } from "../src/app/(app)/integrations/guimo-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
  }),
}));

const activeIntegration = {
  id: "integration_active",
  status: "active",
  webhookVersion: "guimo/v1",
  qualifiedStageId: "stage_qualified",
  qualifiedStageName: "Lead Qualificado",
  purchaseStageId: "stage_purchase",
  purchaseStageName: "Venda Fechada",
  purchaseCurrency: "BRL",
  purchaseValueUnit: "cents",
  hasCrmHeaders: true,
  createdAt: "2026-07-17T18:00:00.000Z",
  updatedAt: "2026-07-17T19:00:00.000Z",
} satisfies GuimoIntegrationDto;

const blockedIntegration = {
  id: "integration_blocked",
  status: "blocked",
  webhookVersion: "guimo/v1",
  qualifiedStageId: "stage_qualified",
  qualifiedStageName: "Lead Qualificado",
  purchaseStageId: null,
  purchaseStageName: null,
  purchaseCurrency: null,
  purchaseValueUnit: null,
  hasCrmHeaders: false,
  createdAt: "2026-07-16T18:00:00.000Z",
  updatedAt: "2026-07-16T18:00:00.000Z",
} satisfies GuimoIntegrationDto;

describe("guimo panel", () => {
  it("shows an empty state and the create form when there is no integration yet", () => {
    const html = renderPanel({ integrations: [] });

    expect(html).toContain("Nenhuma integracao Guimo configurada");
    expect(html).toContain('name="qualifiedStageId"');
    expect(html).toContain('name="qualifiedStageName"');
    expect(html).toContain('name="purchaseStageId"');
    expect(html).toContain('name="purchaseStageName"');
    expect(html).toContain('name="purchaseCurrency"');
    expect(html).toContain('value="BRL"');
    expect(html).toContain('name="purchaseValueUnit"');
    expect(html).toContain('<option value="major">');
    expect(html).toContain('<option value="cents" selected="">');
    expect(html).toContain('name="crmAuthorization"');
    expect(html).toContain('type="password"');
    expect(html).toContain('name="crmApiKey"');
    expect(html).toContain('name="workspaceId" value="workspace_1"');
  });

  it("lists integrations with status, stages, and CRM credential state", () => {
    const html = renderPanel({
      integrations: [activeIntegration, blockedIntegration],
    });

    expect(html).toContain("Ativa");
    expect(html).toContain("Bloqueada");
    expect(html).toContain("Lead Qualificado");
    expect(html).toContain("Venda Fechada");
    expect(html).toContain("BRL");
    expect(html).toContain("Credenciais CRM configuradas");
    expect(html).toContain("Credenciais CRM pendentes");
  });

  it("shows setup instructions referencing the webhook token header", () => {
    const html = renderPanel();

    expect(html).toContain("x-wpptrack-webhook-token");
  });

  it("gates create and rotate actions on canManage", () => {
    const managerHtml = renderPanel({
      canManage: true,
      integrations: [activeIntegration],
    });
    const analystHtml = renderPanel({
      canManage: false,
      integrations: [activeIntegration],
    });

    expect(managerHtml).toContain("Nova integracao Guimo");
    expect(managerHtml).toContain("Girar novo token");
    expect(analystHtml).not.toContain("Nova integracao Guimo");
    expect(analystHtml).not.toContain("Girar novo token");
    expect(analystHtml).toContain("Apenas o owner do workspace pode gerenciar");
  });

  it("never re-renders CRM secrets after save", () => {
    const html = renderPanel({ integrations: [activeIntegration] });

    expect(html).not.toContain("Bearer");
    expect(html).not.toContain("crmHeadersEncrypted");
  });
});

function renderPanel({
  canManage = true,
  integrations = [],
}: {
  canManage?: boolean;
  integrations?: GuimoIntegrationDto[];
} = {}) {
  const action = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));

  return renderToStaticMarkup(
    createElement(GuimoPanel, {
      workspaceId: "workspace_1",
      integrations,
      canManage,
      provisionAction: action,
      rotateAction: action,
    }),
  );
}
