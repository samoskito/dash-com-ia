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

describe("navigation", () => {
  it("keeps the client panel focused on final customer operations", () => {
    expect(clientNavigation.map((item) => item.id)).toEqual([
      "overview",
      "leads",
      "reports",
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
          permissions: {
            canInviteMembers: true,
            canManageBilling: true,
            canManageIntegrations: true,
            canViewReports: true,
          },
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

    expect(html).toContain('class="sidebar-toggle"');
    expect(html).toContain("Recolher menu");
    expect(html).toContain('aria-expanded="true"');
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
          permissions: {
            canInviteMembers: true,
            canManageBilling: true,
            canManageIntegrations: true,
            canViewReports: true,
          },
        },
        children: createElement("p", null, "Panel content"),
      }),
    );

    expect(html).toContain("Workspace");
    expect(html).toContain("Comunidade NOD");
    expect(html).toContain("comunidade-nod");
    expect(html).toContain("owner");
    expect(html).not.toContain("Operacao principal");
    expect(html).not.toContain("Meta v21");
    expect(html).not.toContain("WhatsApp fila");
    expect(html).not.toContain("Pixel ativo");
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
          permissions: {
            canInviteMembers: true,
            canManageBilling: true,
            canManageIntegrations: true,
            canViewReports: true,
          },
        },
        children: createElement("p", null, "Panel content"),
      }),
    );

    expect(html).toContain("Acesso de suporte");
    expect(html).toContain("Barbieri");
    expect(html).toContain("Encerrar acesso");
  });

  it("keeps internal backoffice separate", () => {
    expect(backofficeNavigation.map((item) => item.id)).toEqual([
      "workspaces",
      "billing",
      "split",
      "diagnostics",
    ]);
  });

  it("contains mobile nav scrolling without widening the app shell", () => {
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
    expect(mobileBlock).toContain("display: flex;");
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
