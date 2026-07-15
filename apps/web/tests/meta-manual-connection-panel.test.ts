import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MetaManualConnectionPanel } from "../src/app/(app)/integrations/meta-manual-connection-panel";

const actions = {
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
        capabilities,
        initialConfiguration: null,
        legacyConnected: true,
        canManage: true,
        ...actions,
      }),
    );

    expect(html).toContain("OAuth preservado");
    expect(html).toContain("migracao separada e aprovada");
    expect(html).not.toContain('name="accessToken"');
  });

  it("shows the permanent-token entry without exposing setup to analysts", () => {
    const html = renderToStaticMarkup(
      createElement(MetaManualConnectionPanel, {
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
