import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "../src/app/(app)/layout";
import { WorkspaceAccessGate } from "../src/components/workspace-access-gate";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("product app layout", () => {
  it("renders a blocked workspace state before client pages load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 403,
          message: "Workspace bloqueado operacionalmente",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    const element = await WorkspaceAccessGate({
      children: createElement("p", null, "Conteudo privado"),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Workspace bloqueado");
    expect(html).toContain("Fale com o suporte da plataforma");
    expect(html).not.toContain("Conteudo privado");
  });

  it("renders client content when the workspace is active", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const element = await WorkspaceAccessGate({
      children: createElement("p", null, "Conteudo privado"),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Conteudo privado");
    expect(html).not.toContain("Workspace bloqueado");
  });

  it("keeps the desktop sidebar fixed while product pages scroll", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/globals.css"),
      "utf8",
    );

    expect(css).toMatch(/\.app-shell\s*{[^}]*--sidebar-width:\s*260px/s);
    expect(css).toMatch(
      /\.app-shell\.sidebar-collapsed\s*{[^}]*--sidebar-width:\s*76px/s,
    );
    expect(css).toMatch(/\.sidebar\s*{[^}]*position:\s*fixed/s);
    expect(css).toMatch(/\.sidebar\s*{[^}]*height:\s*100vh/s);
    expect(css).toMatch(/\.sidebar\s*{[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(
      /\.content\s*{[^}]*padding-left:\s*var\(--sidebar-width\)/s,
    );
  });

  it("wraps workspace authorization in Suspense so the shell can render first", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(app)/layout.tsx"),
      "utf8",
    );

    expect(ProductLayout).toBeTypeOf("function");
    expect(source).toContain("<Suspense");
    expect(source).toContain("<ProductRouteLoading />");
    expect(source).toContain("<WorkspaceAccessGate>");
  });

  it("refreshes workspace data without a full reload or a tab-return refresh", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/data-auto-refresh.tsx"),
      "utf8",
    );

    expect(source).toContain("router.refresh()");
    expect(source).not.toContain("window.location.reload");
    expect(source).not.toContain("visibilitychange");
  });
});
