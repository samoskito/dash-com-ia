import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OverviewPage from "../src/app/(app)/overview/page";

afterEach(() => {
  vi.restoreAllMocks();
});

function reportMetrics(overrides: Record<string, unknown> = {}) {
  const metrics = {
    spendCents: 10000,
    metaConversationsStarted: 10,
    costPerMetaConversationCents: 1000,
    realConversations: 6,
    costPerRealConversationCents: 1666,
    organicLeads: 2,
    totalReceived: 8,
    trackingRate: 0.75,
    qualifiedLead: 1,
    costPerQualifiedLeadCents: 10000,
    purchases: 1,
    firstPurchases: 1,
    repurchases: 0,
    costPerPurchaseCents: 10000,
    trafficRevenueCents: 30000,
    organicRevenueCents: 5000,
    totalRevenueCents: 35000,
    firstPurchaseRevenueCents: 30000,
    repurchaseRevenueCents: 0,
    roasAcquisition: 3,
    roasWithRepurchase: 3,
    funnelSteps: [
      {
        key: "real_conversations",
        label: "Conversas reais iniciadas",
        value: 6,
        costCents: 1666,
      },
      {
        key: "qualified_lead",
        label: "Lead qualificado",
        value: 1,
        costCents: 10000,
      },
      {
        key: "purchase",
        label: "Compras",
        value: 1,
        costCents: 10000,
      },
      {
        key: "first_purchase",
        label: "Primeira compra",
        value: 1,
      },
    ],
  };

  return { ...metrics, ...overrides };
}

describe("overview route", () => {
  it("applies period and Meta account filters and renders the daily comparison", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "2026-07-01 a 2026-07-02",
            since: "2026-07-01",
            until: "2026-07-02",
            campaigns: [
              {
                id: "cmp_1",
                name: "Campanha Real",
                status: "active",
                ...reportMetrics(),
              },
            ],
            dailyComparisonAvailable: true,
            dailyComparison: [
              {
                date: "2026-07-01",
                metaConversationsStarted: 7,
                realConversations: 5,
              },
              {
                date: "2026-07-02",
                metaConversationsStarted: 3,
                realConversations: 1,
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
                lastSyncedAt: "2026-07-02T12:00:00.000Z",
                lastSyncSince: "2026-07-01",
                lastSyncUntil: "2026-07-02",
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
                lastSyncedAt: "2026-07-02T12:00:00.000Z",
                lastSyncSince: "2026-07-01",
                lastSyncUntil: "2026-07-02",
                syncError: null,
              },
            ],
            selection: {
              businessId: null,
              adAccountId: null,
              pixelId: null,
            },
            lastSyncedAt: "2026-07-02T12:00:00.000Z",
            syncError: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const element = await OverviewPage({
      searchParams: Promise.resolve({
        since: "2026-07-01",
        until: "2026-07-02",
        businessId: "business_1",
        adAccountId: "act_1",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns?includeDaily=true&includeSummary=true&since=2026-07-01&until=2026-07-02&businessId=business_1&adAccountId=act_1",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(html).toContain("Periodo e contas");
    expect(html).toContain("BM Principal");
    expect(html).toContain("Conta Principal");
    expect(html).toContain("Meta x conversas reais");
    expect(html).toContain("4 conversas a mais na Meta");
    expect(html).toContain("daily-comparison-chart");
    expect(html).toContain("overview-summary-grid");

    const metricsPosition = html.indexOf('class="metric-grid"');
    const funnelPosition = html.indexOf("overview-funnel-panel");
    const dailyPosition = html.indexOf("daily-comparison");
    const summaryPosition = html.indexOf("overview-summary-grid");

    expect(metricsPosition).toBeGreaterThan(-1);
    expect(funnelPosition).toBeGreaterThan(metricsPosition);
    expect(dailyPosition).toBeGreaterThan(funnelPosition);
    expect(summaryPosition).toBeGreaterThan(dailyPosition);
  });

  it("renders aggregated campaign metrics returned by the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workspaceId: "workspace_1",
          rangeLabel: "2026-07-01 a 2026-07-02",
          campaigns: [
            {
              id: "cmp_1",
              name: "Campanha Real",
              status: "active",
              ...reportMetrics(),
            },
            {
              id: "cmp_2",
              name: "Segunda Campanha",
              status: "paused",
              ...reportMetrics({
                spendCents: 5000,
                metaConversationsStarted: 5,
                realConversations: 2,
                costPerRealConversationCents: 2500,
                organicLeads: 1,
                totalReceived: 3,
                trackingRate: 2 / 3,
                qualifiedLead: 0,
                costPerQualifiedLeadCents: null,
                purchases: 0,
                firstPurchases: 0,
                costPerPurchaseCents: null,
                trafficRevenueCents: 0,
                organicRevenueCents: 0,
                totalRevenueCents: 0,
                firstPurchaseRevenueCents: 0,
                roasAcquisition: 0,
                roasWithRepurchase: 0,
                funnelSteps: [
                  {
                    key: "real_conversations",
                    label: "Conversas reais iniciadas",
                    value: 2,
                    costCents: 2500,
                  },
                ],
              }),
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const element = await OverviewPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns?includeDaily=true&includeSummary=true",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(html).toContain("2026-07-01 a 2026-07-02");
    expect(html).not.toContain("Campanha Real");
    expect(html).not.toContain("Segunda Campanha");
    expect(html).toContain("2 campanhas no recorte");
    expect(html).toContain("Cobertura das conversas");
    expect(html).toContain("Com origem identificada");
    expect(html).toContain("Conversas organicas");
    expect(html).toContain("attribution=organic");
    expect(html).toContain("Total recebido");
    expect(html).not.toContain("Sinal sem ruido");
    expect(html).toContain(">15<");
    expect(html).toContain(">8<");
    expect(html).toContain("3 conversas organicas");
    expect(html).toContain("Receita trafego");
    expect(html).toContain("Receita organica");
    expect(html).toContain("Funil de conversao");
    expect(html).toContain("Base do funil");
    expect(html).toContain("da etapa anterior");
    expect(html).toContain("conversion-funnel-chart");
    expect(html).toContain("1 primeira compra");
    expect(html).not.toContain("ROAS com recompra");
    expect(html).not.toContain("0 recompra");
    expect(html).toContain(">1<");
    expect(html).not.toContain("LeadSubmitted");
    expect(html).not.toContain("Black Friday WhatsApp");
  });

  it("shows repurchase ROAS only when the period contains repurchases", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workspaceId: "workspace_1",
          rangeLabel: "Ultimos 7 dias",
          campaigns: [
            {
              id: "cmp_1",
              name: "Campanha com recompra",
              status: "active",
              ...reportMetrics({
                purchases: 2,
                firstPurchases: 1,
                repurchases: 1,
                repurchaseRevenueCents: 15000,
                roasWithRepurchase: 4.5,
                funnelSteps: [
                  ...reportMetrics().funnelSteps,
                  {
                    key: "repurchase",
                    label: "Recompra",
                    value: 1,
                    costCents: 10000,
                  },
                ],
              }),
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const element = await OverviewPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("ROAS com recompra");
    expect(html).toContain("4.50x");
    expect(html).toContain("1 primeira compra, 1 recompra");
  });

  it("renders an empty overview state without mock campaign data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workspaceId: "workspace_1",
          rangeLabel: "Ultimos 7 dias",
          campaigns: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const element = await OverviewPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Nenhuma campanha sincronizada");
    expect(html).toContain("0 campanhas");
    expect(html).not.toContain("Black Friday WhatsApp");
  });

  it("renders workspace conversations before campaign metadata is resolved", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workspaceId: "workspace_1",
          rangeLabel: "Ultimos 7 dias",
          campaigns: [],
          summary: {
            id: "workspace_summary",
            name: "Resumo do workspace",
            status: "unknown",
            ...reportMetrics({
              spendCents: 0,
              metaConversationsStarted: 0,
              costPerMetaConversationCents: null,
              realConversations: 4,
              costPerRealConversationCents: 0,
              organicLeads: 1,
              totalReceived: 5,
              trackingRate: 0.8,
              qualifiedLead: 0,
              costPerQualifiedLeadCents: null,
              purchases: 0,
              firstPurchases: 0,
              costPerPurchaseCents: null,
              trafficRevenueCents: 0,
              organicRevenueCents: 0,
              totalRevenueCents: 0,
              firstPurchaseRevenueCents: 0,
              roasAcquisition: null,
              roasWithRepurchase: null,
            }),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const element = await OverviewPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("0 campanhas");
    expect(html).toContain("4 conversas com origem identificada");
    expect(html).toContain("1 conversa organica");
    expect(html).not.toContain("Aguardando conversas");
  });

  it("renders an unavailable overview state without mock campaign data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("offline", { status: 503 }),
    );

    const element = await OverviewPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar relatorios");
    expect(html).toContain("Dados temporariamente indisponiveis");
    expect(html).toContain(
      "Valores indisponiveis nao foram tratados como zero",
    );
    expect(html).not.toContain("0% conciliadas");
    expect(html).not.toContain("Black Friday WhatsApp");
  });
});
