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
                email: "cliente@barbieri.com.br",
              },
            ],
            connectorCount: 1,
          },
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
              capiCutovers: [],
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
              updatedAt: "2026-07-11T18:02:00.000Z",
            },
            totals: {
              imported: 116,
              duplicates: 0,
              rejected: 0,
              quarantined: 0,
              failed: 0,
              pending: 0,
            },
            reconciliation: {
              connectorId: "connector_1",
              workspaceId: "workspace_barbieri",
              generatedAt: "2026-07-12T20:00:00.000Z",
              state: "ready",
              readyForCutover: true,
              meta: {
                connectionConfigured: true,
                destinationConfigured: true,
                pixelId: "pixel_1",
                pageId: "page_1",
              },
              events: [
                ["conversation_started", 4],
                ["qualified_lead", 3],
                ["purchase", 1],
              ].map(([eventType, operationalRows]) => ({
                eventType,
                sourceRows: operationalRows,
                acceptedRows: operationalRows,
                operationalRows,
                historicalRows: 0,
                expectedMatchedRows: operationalRows,
                matchedRows: operationalRows,
                duplicateDeliveries: 0,
                rejectedRows: 0,
                quarantinedRows: 0,
                blockingRejectedRows: 0,
                pendingRows: 0,
                readyToSendRows: operationalRows,
                sentRows: 0,
                importedRows: 0,
                notEligibleRows: 0,
                shadowObservedRows: 0,
                blockedDeliveryRows: 0,
                capiActive: false,
                readyForCutover: true,
                cutoverAt: null,
                firstOccurredAt: "2026-07-12T18:00:00.000Z",
                lastOccurredAt: "2026-07-12T20:00:00.000Z",
              })),
              blockers: [],
            },
          },
        ];
      } else if (url.endsWith("/backoffice/platform-users")) {
        body = [
          {
            id: "platform_owner",
            name: "Owner",
            email: "owner@wpptrack.com",
            role: "platform_owner",
            createdAt: "2026-07-11T18:00:00.000Z",
          },
        ];
      } else if (url.endsWith("/auth/me")) {
        body = {
          user: {
            id: "platform_owner",
            name: "Owner",
            email: "owner@wpptrack.com",
            platformRole: "platform_owner",
          },
        };
      }

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const element = await BackofficeClientsPage({
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Clientes e acessos");
    expect(html).toContain("Provisionar workspace");
    expect(html).toContain("Nome do responsavel");
    expect(html).toContain("Email do responsavel");
    expect(html).not.toContain("Senha inicial (para novo email)");
    expect(html).toContain(
      "O responsavel recebe um link seguro para criar a propria senha.",
    );
    expect(html).toContain("Responsavel da conta");
    expect(html).toContain("Cliente Barbieri");
    expect(html).toContain("Acessar");
    expect(html).toContain("Enviar e-mail de acesso");
    expect(html).toContain('href="/backoffice/clients?section=connectors"');
    expect(html).not.toContain("MySQL Barbieri");

    const connectorsElement = await BackofficeClientsPage({
      searchParams: Promise.resolve({ section: "connectors" }),
    });
    const connectorsHtml = renderToStaticMarkup(connectorsElement);

    expect(connectorsHtml).toContain("Conectores MySQL");
    expect(connectorsHtml).toContain("MySQL Barbieri");
    expect(connectorsHtml).toContain("Salvar conector");
    expect(connectorsHtml).toContain("Sincronizacao concluida");
    expect(connectorsHtml).toContain("Importados");
    expect(connectorsHtml).toContain(">116<");
    expect(connectorsHtml).toContain("Descartados");
    expect(connectorsHtml).toContain("Falhas");
    expect(connectorsHtml).toContain("Reimportar leads");
    expect(connectorsHtml).toContain("Gate de corte CAPI");
    expect(connectorsHtml).toContain("Pronto para corte");
    expect(connectorsHtml).toContain("4 reais validos");
    expect(connectorsHtml).toContain("0 repeticoes");
    expect(connectorsHtml).toContain("0 descartados");
    expect(connectorsHtml).toContain("Eventos reais reconciliados");
    expect(connectorsHtml).toContain("Assumir envio");
    expect(connectorsHtml).toContain("Digite ASSUMIR ENVIO");
    expect(connectorsHtml).toContain(
      "Mantenha o registro no ledger MySQL ativo",
    );
    expect(connectorsHtml).not.toContain("credentialsEncrypted");

    const teamElement = await BackofficeClientsPage({
      searchParams: Promise.resolve({ section: "team" }),
    });
    const teamHtml = renderToStaticMarkup(teamElement);

    expect(teamHtml).toContain("Acesso global da plataforma");
    expect(teamHtml).toContain("Criar acesso interno");
    expect(teamHtml).toContain("owner@wpptrack.com");
    expect(teamHtml).not.toContain("Ambientes dos clientes");
    expect(teamHtml).not.toContain("MySQL Barbieri");
  });

  it("keeps password fields server-bound and never repopulates secrets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const element = await BackofficeClientsPage({
      searchParams: Promise.resolve({ section: "connectors" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('type="password"');
    expect(html).toContain("Senha do usuario somente leitura");
    expect(html).not.toContain("mysql://");
  });
});
