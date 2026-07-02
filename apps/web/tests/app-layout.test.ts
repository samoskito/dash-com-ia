import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "../src/app/(app)/layout";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("product app layout", () => {
  it("renders a blocked workspace state before client pages load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 403,
          message: "Workspace bloqueado operacionalmente"
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await ProductLayout({
      children: createElement("p", null, "Conteudo privado")
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
            canViewReports: true
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await ProductLayout({
      children: createElement("p", null, "Conteudo privado")
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Conteudo privado");
    expect(html).not.toContain("Workspace bloqueado");
  });
});
