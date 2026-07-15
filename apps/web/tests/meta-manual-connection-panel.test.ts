import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MetaManualConnectionPanel } from "../src/app/(app)/integrations/meta-manual-connection-panel";

const actions = {
  disconnectOAuthAction: vi.fn(),
  createCredentialAction: vi.fn(),
  discoverAssetsAction: vi.fn(),
  createConnectionAction: vi.fn(),
  rotateCredentialAction: vi.fn(),
  setConnectionStatusAction: vi.fn(),
  testConnectionAction: vi.fn(),
  setAccountDestinationAction: vi.fn(),
};

const capabilities = {
  enabledModes: ["oauth", "manual"] as Array<"oauth" | "manual">,
  oauthEnabled: true,
  manualEnabled: true,
};

describe("Meta manual connection panel", () => {
  it("locks manual setup when the workspace already uses OAuth", () => {
    const html = renderToStaticMarkup(
      createElement(MetaManualConnectionPanel, {
        workspaceId: "workspace_1",
        capabilities,
        initialConfiguration: null,
        legacyConnected: true,
        canManage: true,
        ...actions,
      }),
    );

    expect(html).toContain("Desconectar OAuth");
    expect(html).toContain("Desconectar e usar token");
    expect(html).toContain("DESCONECTAR META");
    expect(html).toContain("Eventos, campanhas e auditorias");
    expect(html).not.toContain('name="accessToken"');
  });

  it("shows the permanent-token entry without exposing setup to analysts", () => {
    const html = renderToStaticMarkup(
      createElement(MetaManualConnectionPanel, {
        workspaceId: "workspace_1",
        capabilities,
        initialConfiguration: {
          workspaceId: "workspace_1",
          credentials: [],
          businessConnections: [],
          destinations: [],
          reportingAccounts: [],
        },
        legacyConnected: false,
        canManage: false,
        ...actions,
      }),
    );

    expect(html).toContain("Usar token permanente");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);
    expect(html).not.toContain('name="accessToken"');
  });
});
