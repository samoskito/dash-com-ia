import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsPage from "../src/app/(app)/settings/page";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockSettingsFetch(options: {
  rulesBody: unknown;
  rulesStatus?: number;
  workspaceStatus?: number;
  workspaceRole?: "owner" | "admin" | "member";
  membersStatus?: number;
  authStatus?: number;
}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);

    if (url.endsWith("/conversion-rules")) {
      return new Response(JSON.stringify(options.rulesBody), {
        status: options.rulesStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: {
            id: "user_1",
            email: "samuel@example.com",
            name: "Samuel",
            authProvider: "email",
            emailVerifiedAt: null
          },
          workspaces: []
        }),
        {
          status: options.authStatus ?? 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (url.endsWith("/workspaces/current")) {
      const role = options.workspaceRole ?? "owner";
      return new Response(
        JSON.stringify({
          id: "workspace_1",
          name: "Loja Samuel",
          slug: "loja-samuel",
          role,
          permissions: {
            canInviteMembers: role === "owner" || role === "admin",
            canManageBilling: role === "owner",
            canManageIntegrations: role === "owner" || role === "admin",
            canViewReports: true
          }
        }),
        {
          status: options.workspaceStatus ?? 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (url.endsWith("/workspaces/current/members")) {
      return new Response(
        JSON.stringify([
          {
            id: "member_1",
            userId: "user_1",
            email: "samuel@example.com",
            name: "Samuel",
            role: "owner",
            joinedAt: "2026-07-02T10:00:00.000Z"
          }
        ]),
        {
          status: options.membersStatus ?? 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (url.endsWith("/workspaces/current/invites")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ message: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  });
}

describe("settings route", () => {
  it("renders workspace, members and invite controls from backend data", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/conversion-rules")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "user_1",
              email: "samuel@example.com",
              name: "Samuel",
              authProvider: "email",
              emailVerifiedAt: null
            },
            workspaces: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/workspaces/current")) {
        return new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Loja Samuel",
            slug: "loja-samuel",
            role: "owner",
            permissions: {
              canInviteMembers: true,
              canManageBilling: true,
              canManageIntegrations: true,
              canViewReports: true
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/workspaces/current/members")) {
        return new Response(
          JSON.stringify([
            {
              id: "member_1",
              userId: "user_1",
              email: "samuel@example.com",
              name: "Samuel",
              role: "owner",
              joinedAt: "2026-07-02T10:00:00.000Z"
            },
            {
              id: "member_2",
              userId: "user_2",
              email: "trafego@example.com",
              name: null,
              role: "admin",
              joinedAt: "2026-07-02T11:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/workspaces/current/invites")) {
        return new Response(
          JSON.stringify([
            {
              id: "invite_1",
              email: "convite@example.com",
              role: "member",
              status: "pending",
              expiresAt: "2026-07-09T10:00:00.000Z",
              acceptToken: "secret-token-not-for-list"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    });

    const element = await SettingsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/workspaces/current",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/workspaces/current/members",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/workspaces/current/invites",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/auth/me",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Loja Samuel");
    expect(html).toContain("loja-samuel");
    expect(html).toContain("owner");
    expect(html).toContain("name=\"workspaceName\"");
    expect(html).toContain("Salvar workspace");
    expect(html).toContain("samuel@example.com");
    expect(html).toContain("Email pendente");
    expect(html).toContain("Enviar verificacao");
    expect(html).toContain("trafego@example.com");
    expect(html).toContain("convite@example.com");
    expect(html).toContain("pending");
    expect(html).not.toContain("secret-token-not-for-list");
    expect(html).toContain("Convidar membro");
    expect(html).toContain("Email do convidado");
    expect(html).not.toContain("3 usuarios ativos");
    expect(html).not.toContain("Vendas");
  });

  it("renders conversion rules returned by the backend", async () => {
    mockSettingsFetch({
      rulesBody: [
        {
          id: "rule_1",
          workspaceId: "workspace_1",
          name: "Lead qualificado por palavra",
          triggerType: "keyword",
          triggerValue: "quero comprar",
          matchMode: "contains",
          eventName: "QualifiedLead",
          pixelId: null,
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z"
        }
      ]
    });

    const element = await SettingsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/conversion-rules",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Lead qualificado por palavra");
    expect(html).toContain("Palavra-chave");
    expect(html).toContain("quero comprar");
    expect(html).toContain("QualifiedLead");
    expect(html).toContain("Nova regra de conversao");
    expect(html).toContain("Criar regra");
    expect(html).toContain("Nome da regra");
    expect(html).toContain("Etiqueta WhatsApp");
    expect(html).toContain("Pausar");
  });

  it("renders WhatsApp label suggestions from active Uazapi instances", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/conversion-rules")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "user_1",
              email: "samuel@example.com",
              name: "Samuel",
              authProvider: "email",
              emailVerifiedAt: null
            },
            workspaces: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/workspaces/current")) {
        return new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Loja Samuel",
            slug: "loja-samuel",
            role: "owner",
            permissions: {
              canInviteMembers: true,
              canManageBilling: true,
              canManageIntegrations: true,
              canViewReports: true
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/workspaces/current/members")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.endsWith("/workspaces/current/invites")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.endsWith("/integrations/whatsapp/instances")) {
        return new Response(
          JSON.stringify([
            {
              id: "wpp_active",
              name: "Vendas",
              provider: "uazapi",
              billingStatus: "active",
              providerInstanceId: "provider_instance_1",
              checkoutUrl: null,
              createdAt: "2026-07-02T03:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/integrations/whatsapp/instances/wpp_active/labels")) {
        return new Response(
          JSON.stringify([
            {
              id: "label_uuid_1",
              name: "Venda fechada",
              colorHex: "#fed428",
              labelId: "10"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    });

    const element = await SettingsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/whatsapp/instances",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/whatsapp/instances/wpp_active/labels",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Etiquetas Uazapi disponiveis");
    expect(html).toContain("Venda fechada");
    expect(html).toContain('list="whatsapp-label-options"');
    expect(html).toContain('<option value="Venda fechada"></option>');
  });

  it("hides conversion rule mutation controls for workspace members", async () => {
    mockSettingsFetch({
      workspaceRole: "member",
      rulesBody: [
        {
          id: "rule_1",
          workspaceId: "workspace_1",
          name: "Lead qualificado por palavra",
          triggerType: "keyword",
          triggerValue: "quero comprar",
          matchMode: "contains",
          eventName: "QualifiedLead",
          pixelId: null,
          active: true,
          createdAt: "2026-07-02T03:00:00.000Z",
          updatedAt: "2026-07-02T03:00:00.000Z"
        }
      ]
    });

    const element = await SettingsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Lead qualificado por palavra");
    expect(html).toContain("Sem permissao para editar regras");
    expect(html).not.toContain("Criar regra");
    expect(html).not.toContain("Pausar");
  });

  it("renders an unavailable state without demo rules when conversion rules fail", async () => {
    mockSettingsFetch({
      rulesBody: { message: "unavailable" },
      rulesStatus: 503,
      workspaceStatus: 503,
      membersStatus: 503
    });

    const element = await SettingsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar regras");
    expect(html).not.toContain("Novo lead");
    expect(html).not.toContain("Compra confirmada");
    expect(html).not.toContain("Venda fechada");
  });

  it("renders an empty state without demo rules when no conversion rules exist", async () => {
    mockSettingsFetch({ rulesBody: [] });

    const element = await SettingsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Nenhuma regra configurada");
    expect(html).not.toContain("Novo lead");
    expect(html).not.toContain("Compra confirmada");
    expect(html).not.toContain("Venda fechada");
  });
});
