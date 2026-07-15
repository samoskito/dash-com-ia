import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { clientNavigation, backofficeNavigation } from "@wpptrack/shared";
import { AppShell } from "../src/components/app-shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
  }),
}));

const analystPermissions = {
  canInviteMembers: false,
  canManageMembers: false,
  canGrantMemberManager: false,
  canManageBilling: false,
  canManageIntegrations: false,
  canManageWorkspaceSettings: false,
  canTransferOwnership: false,
  canViewReports: true,
  canExportReports: true,
};

const ownerPermissions = {
  ...analystPermissions,
  canInviteMembers: true,
  canManageMembers: true,
  canGrantMemberManager: true,
  canManageBilling: true,
  canManageIntegrations: true,
  canManageWorkspaceSettings: true,
  canTransferOwnership: true,
};

describe("navigation", () => {
  it("keeps the client panel focused on final customer operations", () => {
    expect(clientNavigation.map((item) => item.id)).toEqual([
      "overview",
      "leads",
      "reports",
      "events",
      "integrations",
      "settings",
    ]);
    expect(clientNavigation.map((item) => item.label)).not.toContain(
      "Clientes",
    );
  });

  it("renders the client navigation in the web app shell", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, null, createElement("p", null, "Panel content")),
    );

    for (const item of clientNavigation) {
      expect(html).toContain(`href="/${item.id}"`);
      expect(html).toContain(item.label);
    }

    expect(html).toContain("Panel content");
    expect(html).not.toContain("Clientes");
    expect(html).not.toContain("/backoffice/clients");
  });

  it("adds platform administration only for platform users", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        workspace: {
          id: "workspace_owner",
          name: "Workspace do Owner",
          slug: "workspace-owner",
          role: "owner",
          operationalStatus: "active",
          platformRole: "platform_owner",
          permissions: ownerPermissions,
        },
        children: createElement("p", null, "Panel content"),
      }),
    );

    expect(html).toContain("Plataforma");
    expect(html).toContain("Backoffice");
    expect(html).toContain('href="/backoffice/clients"');
  });

  it("renders a sidebar collapse control for dense report screens", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, null, createElement("p", null, "Panel content")),
    );

    expect(html).toContain('class="sidebar-toggle desktop-sidebar-toggle"');
    expect(html).toContain("Recolher menu");
    expect(html).toContain('aria-expanded="true"');
  });

  it("renders an accessible mobile menu without the old product subtitle", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, null, createElement("p", null, "Panel content")),
    );

    expect(html).toContain('class="mobile-shell-header"');
    expect(html).toContain('class="mobile-menu-toggle"');
    expect(html).toContain('aria-controls="app-sidebar"');
    expect(html).toContain('id="app-sidebar"');
    expect(html).toContain("Abrir menu");
    expect(html).not.toContain("Telemetry OS");
  });

  it("uses an icon and a full label for the logout action", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, null, createElement("p", null, "Panel content")),
    );

    expect(html).toContain('aria-label="Sair da conta"');
    expect(html).toContain("logout-icon");
    expect(html).toContain('class="logout-label"');
  });

  it("offers a global presentation mode from the sidebar", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        workspace: {
          id: "workspace_demo",
          name: "Cliente confidencial",
          slug: "cliente-confidencial",
          role: "owner",
          operationalStatus: "active",
          permissions: ownerPermissions,
        },
        children: createElement("p", null, "Panel content"),
      }),
    );

    expect(html).toContain('aria-label="Ocultar dados sensiveis"');
    expect(html).toContain("Ocultar dados");
    expect(html).toContain('class="presentation-mask-value"');
    expect(html).toContain("Workspace demonstrativo");
  });

  it("renders real workspace context without static health placeholders", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        workspace: {
          id: "workspace_1",
          name: "Comunidade NOD",
          slug: "comunidade-nod",
          role: "owner",
          operationalStatus: "active",
          permissions: ownerPermissions,
        },
        children: createElement("p", null, "Panel content"),
      }),
    );

    expect(html).toContain("Workspace");
    expect(html).toContain("Comunidade NOD");
    expect(html).toContain("comunidade-nod");
    expect(html).toContain("responsavel da conta");
    expect(html).not.toContain("Operacao principal");
    expect(html).not.toContain("Meta v21");
    expect(html).not.toContain("WhatsApp fila");
    expect(html).not.toContain("Pixel ativo");
  });

  it("renders only API-authorized workspaces with human role labels", () => {
    const permissions = analystPermissions;
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        workspace: {
          id: "workspace_a",
          name: "Empresa A",
          slug: "empresa-a",
          role: "owner",
          operationalStatus: "active",
          permissions: ownerPermissions,
        },
        workspaces: [
          {
            id: "workspace_a",
            name: "Empresa A",
            slug: "empresa-a",
            role: "owner",
            operationalStatus: "active",
            permissions: ownerPermissions,
          },
          {
            id: "workspace_b",
            name: "Empresa B",
            slug: "empresa-b",
            role: "member",
            operationalStatus: "active",
            permissions,
          },
        ],
        children: createElement("p", null, "Panel content"),
      }),
    );

    expect(html).toContain("Selecionar empresa");
    expect(html).toContain("Empresa A");
    expect(html).toContain("Empresa B");
    expect(html).toContain("responsavel da conta");
    expect(html).toContain("analista");
    expect(html).not.toContain("Empresa Confidencial");
    expect(html).not.toContain("workspace_secret");
  });

  it("makes platform support access explicit and reversible", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        workspace: {
          id: "workspace_barbieri",
          name: "Barbieri",
          slug: "barbieri",
          role: "owner",
          operationalStatus: "active",
          accessMode: "platform_support",
          permissions: ownerPermissions,
        },
        children: createElement("p", null, "Panel content"),
      }),
    );

    expect(html).toContain("Acesso de suporte");
    expect(html).toContain("barbieri - acesso de suporte");
    expect(html).toContain("Barbieri");
    expect(html).toContain("Encerrar acesso");
    expect(html).not.toContain("Selecionar empresa");
  });

  it("keeps internal backoffice separate", () => {
    expect(backofficeNavigation.map((item) => item.id)).toEqual([
      "workspaces",
      "billing",
      "split",
      "diagnostics",
    ]);
  });

  it("uses an off-canvas mobile menu without widening the app shell", () => {
    const css = readFileSync(
      new URL("../src/styles/globals.css", import.meta.url),
      "utf8",
    );
    const mobileBlock = css.slice(
      css.indexOf("@media (max-width: 900px)"),
      css.indexOf("@media (max-width: 620px)"),
    );

    expect(mobileBlock).toContain(".app-shell");
    expect(mobileBlock).toContain("min-width: 0;");
    expect(mobileBlock).toContain("max-width: 100%;");
    expect(mobileBlock).toContain(".mobile-shell-header");
    expect(mobileBlock).toContain(".mobile-menu-open .sidebar");
    expect(mobileBlock).toContain("transform: translateX(-104%);");
    expect(mobileBlock).toContain("position: fixed;");
    expect(mobileBlock).not.toContain("repeat(5, minmax(128px, 1fr))");
  });

  it("protects app routes with the session middleware", () => {
    const middleware = readFileSync(
      new URL("../src/middleware.ts", import.meta.url),
      "utf8",
    );

    for (const route of [
      "/overview",
      "/leads",
      "/reports",
      "/events",
      "/integrations",
      "/settings",
      "/backoffice",
    ]) {
      expect(middleware).toContain(route);
    }

    expect(middleware).toContain("wpptrack_session");
    expect(middleware).toContain("/login");
  });
});
