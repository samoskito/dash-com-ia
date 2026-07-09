import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportsPage from "../src/app/(app)/reports/page";
import { MetaReportFilters } from "../src/app/(app)/reports/meta-report-filters";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reports route", () => {
  it("renders campaign reports returned by the backend", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            campaigns: [
              {
                id: "cmp_1",
                name: "Black Friday WhatsApp",
                status: "active",
                spendCents: 120000,
                metaConversationsStarted: 176,
                costPerMetaConversationCents: 681,
                realConversations: 2,
                costPerRealConversationCents: 60000,
                leadSubmitted: 1,
                costPerLeadSubmittedCents: 120000,
                qualifiedLead: 1,
                costPerQualifiedLeadCents: 120000,
                purchase: 1,
                costPerPurchaseCents: 120000,
                roas: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            campaigns: [
              {
                id: "cmp_1",
                name: "Black Friday WhatsApp",
                status: "ACTIVE",
                effectiveStatus: "ACTIVE",
                objective: "OUTCOME_SALES",
                adSets: [
                  {
                    id: "adset_1",
                    name: "Publico quente",
                    status: "ACTIVE",
                    effectiveStatus: "ACTIVE",
                    ads: [
                      {
                        id: "ad_1",
                        name: "Criativo WhatsApp",
                        status: "ACTIVE",
                        effectiveStatus: "ACTIVE",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            adSets: [
              {
                id: "adset_1",
                campaignId: "cmp_1",
                campaignName: "Black Friday WhatsApp",
                name: "Publico quente",
                status: "active",
                spendCents: 60000,
                metaConversationsStarted: 80,
                costPerMetaConversationCents: 750,
                realConversations: 2,
                costPerRealConversationCents: 30000,
                leadSubmitted: 1,
                costPerLeadSubmittedCents: 60000,
                qualifiedLead: 1,
                costPerQualifiedLeadCents: 60000,
                purchase: 1,
                costPerPurchaseCents: 60000,
                roas: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            ads: [
              {
                id: "ad_1",
                campaignId: "cmp_1",
                campaignName: "Black Friday WhatsApp",
                adSetId: "adset_1",
                adSetName: "Publico quente",
                name: "Criativo WhatsApp",
                status: "active",
                spendCents: 30000,
                metaConversationsStarted: 40,
                costPerMetaConversationCents: 750,
                realConversations: 2,
                costPerRealConversationCents: 15000,
                leadSubmitted: 1,
                costPerLeadSubmittedCents: 30000,
                qualifiedLead: 1,
                costPerQualifiedLeadCents: 30000,
                purchase: 1,
                costPerPurchaseCents: 30000,
                roas: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "owner",
            permissions: {
              canInviteMembers: true,
              canManageBilling: true,
              canManageIntegrations: true,
              canViewReports: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            status: "connected",
            businesses: [
              {
                id: "business_1",
                name: "BM Principal",
                verificationStatus: "verified",
              },
            ],
            adAccounts: [
              {
                id: "act_1",
                businessId: "business_1",
                name: "Conta WhatsApp",
                accountStatus: "active",
                currency: "BRL",
                timezoneName: "America/Sao_Paulo",
              },
            ],
            pixels: [],
            pages: [],
            reportingAccounts: [
              {
                id: "reporting_1",
                workspaceId: "workspace_1",
                businessId: "business_1",
                businessName: "BM Principal",
                adAccountId: "act_1",
                adAccountName: "Conta WhatsApp",
                currency: "BRL",
                timezoneName: "America/Sao_Paulo",
                active: true,
                syncStatus: "synced",
                lastSyncedAt: "2026-07-02T03:00:00.000Z",
                syncError: null,
              },
            ],
            selection: {
              businessId: "business_1",
              adAccountId: "act_1",
              pixelId: null,
            },
            lastSyncedAt: "2026-07-02T03:00:00.000Z",
            syncError: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const element = await ReportsPage({
      searchParams: Promise.resolve({
        since: "2026-07-01",
        until: "2026-07-02",
        businessId: "business_1",
        adAccountId: "act_1",
        whatsappClassification: "whatsapp",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns?since=2026-07-01&until=2026-07-02&businessId=business_1&adAccountId=act_1&whatsappClassification=whatsapp",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/meta/structure",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/adsets?since=2026-07-01&until=2026-07-02&businessId=business_1&adAccountId=act_1&whatsappClassification=whatsapp",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/ads?since=2026-07-01&until=2026-07-02&businessId=business_1&adAccountId=act_1&whatsappClassification=whatsapp",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/workspaces/current",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/meta/assets",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(html).toContain("Black Friday WhatsApp");
    expect(html).toContain("Todas as contas");
    expect(html).toContain("Campanhas WhatsApp");
    expect(html).toContain("BM Principal");
    expect(html).toContain("Conta WhatsApp");
    expect(html).not.toContain("Remarketing 7 dias");
    expect(html).not.toContain("Publico frio - videos");
    expect(html).toContain("Publico quente");
    expect(html).toContain("Criativo WhatsApp");
    expect(html).toContain("Sincronizar Meta");
    expect(html.match(/name="businessId"/g)).toHaveLength(4);
    expect(html.match(/name="adAccountId"/g)).toHaveLength(4);
    expect(html.match(/name="whatsappClassification"/g)).toHaveLength(4);
    expect(html).toContain(
      'href="/reports/export?since=2026-07-01&amp;until=2026-07-02&amp;businessId=business_1&amp;adAccountId=act_1&amp;whatsappClassification=whatsapp"',
    );
    expect(html).toContain("2026-07-01");
    expect(html).toContain("2026-07-02");
    expect(html).toContain("1.200,00");
    expect(html).toContain("176");
    expect(html).toContain("2");
    expect(html).toContain("LeadSubmitted");
    expect(html).toContain("Performance por conjunto");
    expect(html).toContain("Performance por anuncio");
    expect(html).toContain("Insights Meta por conjunto sincronizados");
    expect(html).toContain("Insights Meta por anuncio sincronizados");
    expect(html).toContain("Resumo campanhas");
    expect(html).toContain("1 campanha ativa");
    expect(html).toContain("Resumo conjuntos");
    expect(html).toContain("1 conjunto ativo");
    expect(html).toContain("Resumo anuncios");
    expect(html).toContain("1 anuncio ativo");
    expect(html).toContain("Diagnostico da sincronizacao Meta");
    expect(html).toContain("1 campanha sincronizada");
    expect(html).toContain("1 conjunto sincronizado");
    expect(html).toContain("1 anuncio sincronizado");
    expect(html).toContain("1 conta ativa");
    expect(html).toContain("Ver estrutura tecnica");
    expect(html).toContain(
      'class="table-wrap report-table-scroll meta-structure-scroll"',
    );
    expect(html).toContain('aria-label="Filtros da estrutura tecnica Meta"');
    expect(html).toContain('name="structureNameScope"');
    expect(html).toContain('name="structureNameContains"');
    expect(html).toContain('name="structureStatus"');
    expect(html).toContain("Campanha contem");
    expect(html).toContain("Conjunto contem");
    expect(html).toContain("Anuncio contem");
    expect(html).toContain("Inativos");
    expect(html).toContain("Revisao WhatsApp");
    expect(html.match(/Incluir/g)).toHaveLength(3);
    expect(html.match(/Excluir/g)).toHaveLength(3);
    expect(html.match(/Resetar/g)).toHaveLength(3);
    expect(html).toContain("600,00");
    expect(html).toContain("300,00");
    expect(html).toContain(
      'href="/leads?campaignId=cmp_1&amp;since=2026-07-01&amp;until=2026-07-02&amp;businessId=business_1&amp;adAccountId=act_1&amp;whatsappClassification=whatsapp"',
    );
    expect(html).toContain(
      'href="/leads?campaignId=cmp_1&amp;adSetId=adset_1&amp;since=2026-07-01&amp;until=2026-07-02&amp;businessId=business_1&amp;adAccountId=act_1&amp;whatsappClassification=whatsapp"',
    );
    expect(html).toContain(
      'href="/leads?campaignId=cmp_1&amp;adSetId=adset_1&amp;adId=ad_1&amp;since=2026-07-01&amp;until=2026-07-02&amp;businessId=business_1&amp;adAccountId=act_1&amp;whatsappClassification=whatsapp"',
    );
    expect(html).not.toContain("nao tem investimento proprio persistido");
  });

  it("renders an empty campaign state without demo rows when backend returns no campaigns", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            campaigns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            campaigns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            adSets: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            ads: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "owner",
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

    const element = await ReportsPage({
      searchParams: Promise.resolve({ notice: "meta-sync-queued" }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Sincronizacao iniciada");
    expect(html).toContain("A leitura dos dados Meta foi enviada para a fila.");
    expect(html).toContain("Nenhuma campanha sincronizada");
    expect(html).toContain("Nenhum conjunto sincronizado");
    expect(html).toContain("Nenhum anuncio sincronizado");
    expect(html).toContain("Use Sincronizar Meta");
    expect(html).not.toContain("Black Friday WhatsApp");
    expect(html).not.toContain("Remarketing 7 dias");
  });

  it("renders comparison metrics when a comparison period is selected", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "08/07/2026 a 14/07/2026",
            campaigns: [
              {
                id: "cmp_1",
                name: "Semana atual",
                status: "active",
                spendCents: 150000,
                metaConversationsStarted: 90,
                costPerMetaConversationCents: 1666,
                realConversations: 30,
                costPerRealConversationCents: 5000,
                leadSubmitted: 12,
                costPerLeadSubmittedCents: 12500,
                qualifiedLead: 6,
                costPerQualifiedLeadCents: 25000,
                purchase: 3,
                costPerPurchaseCents: 50000,
                roas: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            campaigns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "08/07/2026 a 14/07/2026",
            adSets: [
              {
                id: "adset_1",
                campaignId: "cmp_1",
                campaignName: "Semana atual",
                name: "Publico atual",
                status: "active",
                spendCents: 75000,
                metaConversationsStarted: 45,
                costPerMetaConversationCents: 1666,
                realConversations: 15,
                costPerRealConversationCents: 5000,
                leadSubmitted: 6,
                costPerLeadSubmittedCents: 12500,
                qualifiedLead: 3,
                costPerQualifiedLeadCents: 25000,
                purchase: 1,
                costPerPurchaseCents: 75000,
                roas: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "08/07/2026 a 14/07/2026",
            ads: [
              {
                id: "ad_1",
                campaignId: "cmp_1",
                campaignName: "Semana atual",
                adSetId: "adset_1",
                adSetName: "Publico atual",
                name: "Criativo atual",
                status: "active",
                spendCents: 25000,
                metaConversationsStarted: 15,
                costPerMetaConversationCents: 1666,
                realConversations: 5,
                costPerRealConversationCents: 5000,
                leadSubmitted: 2,
                costPerLeadSubmittedCents: 12500,
                qualifiedLead: 1,
                costPerQualifiedLeadCents: 25000,
                purchase: 1,
                costPerPurchaseCents: 25000,
                roas: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "owner",
            permissions: {
              canInviteMembers: true,
              canManageBilling: true,
              canManageIntegrations: true,
              canViewReports: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "01/07/2026 a 07/07/2026",
            campaigns: [
              {
                id: "cmp_1",
                name: "Semana anterior",
                status: "active",
                spendCents: 100000,
                metaConversationsStarted: 60,
                costPerMetaConversationCents: 1666,
                realConversations: 20,
                costPerRealConversationCents: 5000,
                leadSubmitted: 10,
                costPerLeadSubmittedCents: 10000,
                qualifiedLead: 4,
                costPerQualifiedLeadCents: 25000,
                purchase: 2,
                costPerPurchaseCents: 50000,
                roas: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            status: "connected",
            businesses: [],
            adAccounts: [],
            pixels: [],
            pages: [],
            reportingAccounts: [],
            selection: {
              businessId: null,
              adAccountId: null,
              pixelId: null,
            },
            lastSyncedAt: "2026-07-02T03:00:00.000Z",
            syncError: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const element = await ReportsPage({
      searchParams: Promise.resolve({
        since: "2026-07-08",
        until: "2026-07-14",
        compareSince: "2026-07-01",
        compareUntil: "2026-07-07",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns?since=2026-07-01&until=2026-07-07",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(html).toContain("Comparacao entre periodos");
    expect(html).toContain("01/07/2026 a 07/07/2026");
    expect(html).toContain("+50%");
    expect(html).toContain("+20%");
    expect(html).toContain(
      'href="/reports/export?since=2026-07-08&amp;until=2026-07-14&amp;compareSince=2026-07-01&amp;compareUntil=2026-07-07"',
    );
    expect(html).toContain(
      'href="/leads?campaignId=cmp_1&amp;since=2026-07-08&amp;until=2026-07-14&amp;compareSince=2026-07-01&amp;compareUntil=2026-07-07"',
    );
    expect(html).toContain(
      'href="/leads?campaignId=cmp_1&amp;adSetId=adset_1&amp;since=2026-07-08&amp;until=2026-07-14&amp;compareSince=2026-07-01&amp;compareUntil=2026-07-07"',
    );
    expect(html).toContain(
      'href="/leads?campaignId=cmp_1&amp;adSetId=adset_1&amp;adId=ad_1&amp;since=2026-07-08&amp;until=2026-07-14&amp;compareSince=2026-07-01&amp;compareUntil=2026-07-07"',
    );
    expect(html.match(/name="compareSince"/g)).toHaveLength(3);
    expect(html.match(/name="compareUntil"/g)).toHaveLength(3);
  });

  it("renders Meta filters without keeping an account from another BM", () => {
    const html = renderToStaticMarkup(
      createElement(MetaReportFilters, {
        assets: {
          workspaceId: "workspace_1",
          status: "connected",
          businesses: [
            {
              id: "business_1",
              name: "BM Principal",
              verificationStatus: null,
            },
            {
              id: "business_2",
              name: "BM Secundario",
              verificationStatus: null,
            },
          ],
          adAccounts: [],
          pixels: [],
          pages: [],
          reportingAccounts: [
            {
              id: "reporting_1",
              workspaceId: "workspace_1",
              businessId: "business_1",
              businessName: "BM Principal",
              adAccountId: "act_1",
              adAccountName: "Conta Principal",
              currency: "BRL",
              timezoneName: "America/Sao_Paulo",
              active: true,
              syncStatus: "synced",
              lastSyncedAt: null,
              syncError: null,
            },
            {
              id: "reporting_2",
              workspaceId: "workspace_1",
              businessId: "business_2",
              businessName: "BM Secundario",
              adAccountId: "act_2",
              adAccountName: "Conta Secundaria",
              currency: "BRL",
              timezoneName: "America/Sao_Paulo",
              active: true,
              syncStatus: "synced",
              lastSyncedAt: null,
              syncError: null,
            },
          ],
          selection: {
            businessId: null,
            adAccountId: null,
            pixelId: null,
          },
          lastSyncedAt: null,
          syncError: null,
        },
        businessId: "business_2",
        adAccountId: "act_1",
        since: "2026-07-08",
        until: "2026-07-14",
        compareSince: "2026-07-01",
        compareUntil: "2026-07-07",
        whatsappClassification: "whatsapp",
      }),
    );

    expect(html).toContain("Conta Secundaria");
    expect(html).not.toContain("Conta Principal");
    expect(html).not.toContain('option value="act_1" selected=""');
    expect(html).toContain('name="compareSince" value="2026-07-01"');
    expect(html).toContain('name="compareUntil" value="2026-07-07"');
  });

  it("renders an unavailable state without demo rows when backend is unavailable", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(new Response("offline", { status: 503 }));

    const element = await ReportsPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar campanhas");
    expect(html).toContain("Nao foi possivel carregar conjuntos");
    expect(html).toContain("Nao foi possivel carregar anuncios");
    expect(html).not.toContain("Black Friday WhatsApp");
  });

  it("renders unknown Meta structure statuses in Portuguese", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            campaigns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            campaigns: [
              {
                id: "cmp_1",
                name: "Campanha Meta",
                status: null,
                effectiveStatus: null,
                objective: null,
                adSets: [
                  {
                    id: "adset_1",
                    name: "Publico",
                    status: null,
                    effectiveStatus: null,
                    ads: [
                      {
                        id: "ad_1",
                        name: "Criativo",
                        status: null,
                        effectiveStatus: null,
                      },
                    ],
                  },
                  {
                    id: "adset_2",
                    name: "Publico sem anuncio",
                    status: null,
                    effectiveStatus: null,
                    ads: [],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            adSets: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            ads: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "owner",
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

    const element = await ReportsPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Status desconhecido");
    expect(html).not.toContain(">unknown<");
  });

  it("filters the Meta technical structure by name and status", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            campaigns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            campaigns: [
              {
                id: "cmp_1",
                name: "Campanha tecnica",
                status: "ACTIVE",
                effectiveStatus: "ACTIVE",
                objective: "OUTCOME_SALES",
                adSets: [
                  {
                    id: "adset_1",
                    name: "Publico ativo",
                    status: "ACTIVE",
                    effectiveStatus: "ACTIVE",
                    ads: [
                      {
                        id: "ad_1",
                        name: "Criativo ativo",
                        status: "ACTIVE",
                        effectiveStatus: "ACTIVE",
                      },
                    ],
                  },
                  {
                    id: "adset_2",
                    name: "Publico pausado",
                    status: "PAUSED",
                    effectiveStatus: "PAUSED",
                    ads: [
                      {
                        id: "ad_2",
                        name: "Criativo pausado",
                        status: "PAUSED",
                        effectiveStatus: "PAUSED",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            adSets: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            ads: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "owner",
            permissions: {
              canInviteMembers: true,
              canManageBilling: true,
              canManageIntegrations: true,
              canViewReports: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            status: "connected",
            businesses: [],
            adAccounts: [],
            pixels: [],
            pages: [],
            reportingAccounts: [],
            selection: {
              businessId: null,
              adAccountId: null,
              pixelId: null,
            },
            lastSyncedAt: null,
            syncError: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const element = await ReportsPage({
      searchParams: Promise.resolve({
        structureNameScope: "ad",
        structureNameContains: "pausado",
        structureStatus: "inactive",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain('open=""');
    expect(html).toContain('name="structureNameScope"');
    expect(html).toContain('option value="ad" selected=""');
    expect(html).toContain('name="structureNameContains" value="pausado"');
    expect(html).toContain('option value="inactive" selected=""');
    expect(html).toContain("Criativo pausado");
    expect(html).not.toContain("Criativo ativo");
  });

  it("hides Meta sync action for workspace members", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            campaigns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            campaigns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            adSets: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            ads: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "member",
            permissions: {
              canInviteMembers: false,
              canManageBilling: false,
              canManageIntegrations: false,
              canViewReports: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const element = await ReportsPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Sem permissao para sincronizar Meta");
    expect(html).not.toContain("Sincronizar Meta");
  });
});
