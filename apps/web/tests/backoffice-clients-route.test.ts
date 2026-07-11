import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BackofficeClientsPage from "../src/app/(backoffice)/backoffice/clients/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backoffice clients route", () => {
  it("renders isolated workspaces, support access and encrypted connector operations", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      let body: unknown = [];

      if (url.endsWith("/backoffice/workspaces")) {
        body = [
          {
            id: "workspace_barbieri",
            name: "Barbieri",
            slug: "barbieri",
            operationalStatus: "active",
            createdAt: "2026-07-11T18:00:00.000Z",
            owners: [
              {
                id: "user_cliente",
                name: "Cliente Barbieri",
                email: "cliente@barbieri.com.br"
              }
            ],
            connectorCount: 1
          }
        ];
      } else if (
        url.endsWith("/backoffice/external-data/connectors?includeHealth=true")
      ) {
        body = [
          {
            connector: {
              id: "connector_1",
              workspaceId: "workspace_barbieri",
              name: "MySQL Barbieri",
              provider: "kinbox_mysql",
              status: "active",
              timezone: "America/Sao_Paulo",
              sslMode: "required",
              syncEnabled: true,
              shadowMode: true,
              capiSendEnabled: false,
              purchaseAverageValueCents: null,
              defaultCurrency: "BRL",
              hasCredentials: true,
              lastConnectionTestAt: "2026-07-11T18:00:00.000Z",
              lastConnectionStatus: "connected",
              lastSyncStartedAt: "2026-07-11T18:01:00.000Z",
              lastSyncCompletedAt: "2026-07-11T18:02:00.000Z",
              lastSyncStatus: "completed",
              lastSyncErrorCode: null,
              cursors: [],
              createdAt: "2026-07-11T18:00:00.000Z",
              updatedAt: "2026-07-11T18:02:00.000Z"
            },
            totals: {
              imported: 116,
              duplicates: 0,
              rejected: 0,
              pending: 0
            }
          }
        ];
      } else if (url.endsWith("/backoffice/platform-users")) {
        body = [
          {
            id: "platform_owner",
            name: "Owner",
            email: "owner@wpptrack.com",
            role: "platform_owner",
            createdAt: "2026-07-11T18:00:00.000Z"
          }
        ];
      } else if (url.endsWith("/auth/me")) {
        body = {
          user: {
            id: "platform_owner",
            name: "Owner",
            email: "owner@wpptrack.com",
            platformRole: "platform_owner"
          }
        };
      }

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const element = await BackofficeClientsPage({
      searchParams: Promise.resolve({})
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Clientes e acessos");
    expect(html).toContain("Provisionar workspace");
    expect(html).toContain("Cliente Barbieri");
    expect(html).toContain("MySQL Barbieri");
    expect(html).toContain("Sincronizacao concluida");
    expect(html).toContain("Importados");
    expect(html).toContain(">116<");
    expect(html).toContain("Acessar");
    expect(html).toContain("Salvar conector");
    expect(html).not.toContain("credentialsEncrypted");
  });

  it("keeps password fields server-bound and never repopulates secrets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const element = await BackofficeClientsPage({
      searchParams: Promise.resolve({})
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('type="password"');
    expect(html).toContain("Senha do usuario somente leitura");
    expect(html).not.toContain("mysql://");
  });
});
