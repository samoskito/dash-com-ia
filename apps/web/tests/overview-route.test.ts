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

type MetricCard = { label: string; value: string; delta: string };

/** Parses the rendered primary KPI cards in DOM order. */
function metricCards(html: string): MetricCard[] {
  const grid = html.slice(
    html.indexOf("overview-primary-metrics"),
    html.indexOf("overview-funnel-panel"),
  );
  const pattern =
    /<div class="metric-card[^"]*"><span>(.*?)<\/span><strong>(.*?)<\/strong><small>(.*?)<\/small><\/div>/g;
  const cards: MetricCard[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(grid)) !== null) {
    cards.push({ label: match[1]!, value: match[2]!, delta: match[3]! });
  }

  return cards;
}

function overviewResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function renderOverview(body: Record<string, unknown>) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(overviewResponse(body));
  const element = await OverviewPage({});
  return renderToStaticMarkup(createElement("div", null, element));
}

const leadOnlyMetrics = () =>
  reportMetrics({
    qualifiedLead: 4,
    costPerQualifiedLeadCents: 2500,
    purchases: 0,
    firstPurchases: 0,
    repurchases: 0,
    costPerPurchaseCents: null,
    trafficRevenueCents: 0,
    organicRevenueCents: 0,
    totalRevenueCents: 0,
    firstPurchaseRevenueCents: 0,
    repurchaseRevenueCents: 0,
    roasAcquisition: null,
    roasWithRepurchase: null,
    funnelSteps: [
      {
        key: "real_conversations",
        label: "Conversas reais iniciadas",
        value: 6,
        costCents: 1666,
      },
      {
        key: "event_view_content",
        label: "Pre-qualificado",
        value: 12,
        costCents: 833,
      },
      {
        key: "qualified_lead",
        label: "Lead qualificado",
        value: 4,
        costCents: 2500,
      },
    ],
  });

const salesMetrics = () => reportMetrics();

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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "instance_1",
              name: "Comercial",
              provider: "uazapi",
              billingStatus: "active",
              providerInstanceId: "5511999991234",
              checkoutUrl: null,
              createdAt: "2026-07-01T12:00:00.000Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const element = await OverviewPage({
      searchParams: Promise.resolve({
        since: "2026-07-01",
        until: "2026-07-02",
        businessId: "business_1",
        adAccountId: "act_1",
        whatsappInstanceId: "instance_1",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns?includeDaily=true&includeSummary=true&since=2026-07-01&until=2026-07-02&businessId=business_1&adAccountId=act_1&whatsappInstanceId=instance_1",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(html).toContain("Periodo e contas");
    expect(html).toContain("BM Principal");
    expect(html).toContain("Conta Principal");
    expect(html).toContain("Numero WhatsApp");
    expect(html).toContain("Comercial - •••• 1234");
    expect(html).toContain(
      "Investimento e Conversas Meta existem por campanha, nao por numero. Escolha uma campanha para ver o investimento que trouxe conversas para este numero.",
    );
    expect(html).toContain("Meta x conversas reais");
    expect(html).toContain("4 conversas a mais na Meta");
    expect(html).toContain("daily-comparison-chart");
    expect(html).toContain("overview-primary-metrics");
    expect(html).not.toContain("overview-summary-grid");

    const metricsPosition = html.indexOf("overview-primary-metrics");
    const funnelPosition = html.indexOf("overview-funnel-panel");
    const dailyPosition = html.indexOf("daily-comparison");

    expect(metricsPosition).toBeGreaterThan(-1);
    expect(funnelPosition).toBeGreaterThan(metricsPosition);
    expect(dailyPosition).toBeGreaterThan(funnelPosition);
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
    expect(html).toContain("2 campanhas");
    expect(html.match(/class=\"metric-card/g)).toHaveLength(6);
    expect(html).toContain("Investimento");
    expect(html).not.toContain("Cobertura das conversas");
    expect(html).not.toContain("Conversas organicas");
    expect(html).not.toContain("attribution=organic");
    expect(html).not.toContain("Resumo do workspace");
    expect(html).toContain(">15<");
    expect(html).toContain(">8<");
    expect(html).toContain("Receita trafego");
    expect(html).toContain("Funil de conversao");
    expect(html).toContain("Base do funil");
    expect(html).toContain("da etapa anterior");
    expect(html).toContain("conversion-funnel-chart");
    expect(html).toContain("Custo por conversa Meta");
    expect(html).toContain("Custo por lead");
    expect(html).toContain("Custo por lead qualificado");
    expect(html).toContain("Custo por compra");
    expect(html).toContain("Custo por primeira compra");
    expect(html).toContain("1 primeira compra");
    expect(html).not.toContain("0 recompra");
    expect(html).toContain(">1<");
    expect(html).not.toContain("LeadSubmitted");
    expect(html).not.toContain("Black Friday WhatsApp");
  });

  it("shows repurchase cost when the period contains repurchases", async () => {
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

    expect(html).toContain("1 primeira compra, 1 recompra");
    expect(html).toContain("Custo por recompra");
    expect(html).not.toContain("ROAS com recompra");
  });

  it("aggregates InitiateCheckout into the overview funnel and primary metrics", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            campaigns: [
              {
                id: "cmp_1",
                name: "Campanha IC A",
                status: "active",
                ...reportMetrics({
                  spendCents: 20000,
                  funnelSteps: [
                    ...reportMetrics().funnelSteps,
                    {
                      key: "event_initiate_checkout",
                      label: "Checkout iniciado",
                      value: 3,
                      costCents: 6666,
                    },
                  ],
                }),
              },
              {
                id: "cmp_2",
                name: "Campanha IC B",
                status: "active",
                ...reportMetrics({
                  spendCents: 10000,
                  qualifiedLead: 0,
                  purchases: 0,
                  firstPurchases: 0,
                  trafficRevenueCents: 0,
                  totalRevenueCents: 0,
                  firstPurchaseRevenueCents: 0,
                  funnelSteps: [
                    {
                      key: "real_conversations",
                      label: "Conversas reais iniciadas",
                      value: 2,
                      costCents: 5000,
                    },
                    {
                      key: "event_initiate_checkout",
                      label: "Checkout iniciado",
                      value: 2,
                      costCents: 5000,
                    },
                  ],
                }),
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
            reportingAccounts: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const element = await OverviewPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Checkout iniciado");
    expect(html).toContain("Custo por checkout iniciado");
    // Aggregated IC value 3+2 across campaigns
    expect(html).toContain(">5<");
    expect(html.match(/class=\"metric-card/g)).toHaveLength(7);
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
    expect(html).toContain("Conversas reais");
    expect(html).toContain(">4<");
    expect(html).not.toContain("Resumo do workspace");
    expect(html).not.toContain("Conversas organicas");
    expect(html).not.toContain("Aguardando conversas");
  });

  it("renders an unavailable overview state without mock campaign data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("offline", { status: 503 }),
    );

    const element = await OverviewPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Dados temporariamente indisponiveis");
    expect(html).toContain("Aguardando resposta da API");
    expect(html).not.toContain("Resumo do workspace");
    expect(html).not.toContain("Qualidade do rastreamento");
    expect(html).not.toContain("0% conciliadas");
    expect(html).not.toContain("Black Friday WhatsApp");
  });

  it("only offers active WhatsApp instances and marks Meta KPIs unavailable for an instance filter", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        overviewResponse({
          workspaceId: "workspace_1",
          rangeLabel: "Ultimos 7 dias",
          campaigns: [
            {
              id: "cmp_1",
              name: "Campanha Real",
              status: "active",
              ...reportMetrics(),
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        overviewResponse({
          workspaceId: "workspace_1",
          status: "connected",
          businesses: [],
          adAccounts: [],
          pixels: [],
          reportingAccounts: [],
        }),
      )
      .mockResolvedValueOnce(
        overviewResponse([
          {
            id: "instance_active",
            name: "Comercial ativo",
            provider: "uazapi",
            billingStatus: "active",
            providerInstanceId: "5511999991234",
            checkoutUrl: null,
            createdAt: "2026-07-01T12:00:00.000Z",
          },
          {
            id: "instance_removed",
            name: "Comercial antigo",
            provider: "uazapi",
            billingStatus: "disconnected",
            providerInstanceId: "5511999995678",
            checkoutUrl: null,
            createdAt: "2026-06-01T12:00:00.000Z",
          },
        ]),
      );

    const element = await OverviewPage({
      searchParams: Promise.resolve({
        whatsappInstanceId: "instance_active",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));
    const cards = metricCards(html);

    expect(html).toContain("Comercial ativo - •••• 1234");
    expect(html).not.toContain("Comercial antigo");
    expect(cards.find((card) => card.label === "Investimento")).toEqual({
      label: "Investimento",
      value: "-",
      delta: "Conta de anuncios (nao filtravel por chip)",
    });
    expect(cards.find((card) => card.label === "Conversas Meta")).toEqual({
      label: "Conversas Meta",
      value: "-",
      delta: "Conta de anuncios (nao filtravel por chip)",
    });
    expect(cards.find((card) => card.label === "Conversas reais")?.value).toBe(
      "6",
    );
    expect(cards.find((card) => card.label === "Receita trafego")).toEqual({
      label: "Receita trafego",
      value: "R$ 300,00",
      delta: "Receita do chip; ROAS indisponivel",
    });
  });
});

describe("overview configurable KPI cards", () => {
  it("lead-only workspace: shows configured stages and omits Compras/Receita", async () => {
    const html = await renderOverview({
      workspaceId: "workspace_leads",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Campanha Leads",
          status: "active",
          ...leadOnlyMetrics(),
        },
      ],
    });
    const cards = metricCards(html);

    expect(cards.map((card) => card.label)).toEqual([
      "Investimento",
      "Conversas Meta",
      "Conversas reais",
      "Pre-qualificado",
      "Lead qualificado",
    ]);
    expect(html).not.toContain("Receita trafego");
    expect(html).not.toContain(">Compras<");
    expect(html).not.toContain("ROAS");
    expect(html).not.toContain("primeira compra");
    expect(html).not.toContain("primeiras compras");
  });

  it("respects custom stage labels instead of catalog defaults", async () => {
    const html = await renderOverview({
      workspaceId: "workspace_leads",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Campanha Leads",
          status: "active",
          ...leadOnlyMetrics(),
        },
      ],
    });
    const cards = metricCards(html);
    const viewContent = cards.find((card) => card.label === "Pre-qualificado");

    expect(viewContent).toBeDefined();
    expect(viewContent?.value).toBe("12");
    expect(viewContent?.delta).toContain("Custo por pre-qualificado");
    expect(viewContent?.delta).toContain("8,33");
    expect(html).not.toContain("Conteudo visualizado");
  });

  it("hides stages excluded from the workspace funnel even when events exist", async () => {
    const html = await renderOverview({
      workspaceId: "workspace_leads",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Campanha Leads",
          status: "active",
          // qualifiedLead events happened, but the stage is hidden in the funnel
          // configuration, so the API omits it from funnelSteps.
          ...leadOnlyMetrics(),
          funnelSteps: leadOnlyMetrics().funnelSteps.filter(
            (step) => step.key !== "qualified_lead",
          ),
        },
      ],
    });
    const cards = metricCards(html);

    expect(cards.map((card) => card.label)).toEqual([
      "Investimento",
      "Conversas Meta",
      "Conversas reais",
      "Pre-qualificado",
    ]);
    expect(html).not.toContain("Lead qualificado");
    expect(html).not.toContain("Custo por lead qualificado");
  });

  it("sales workspace keeps Compras and Receita trafego after the configured stages", async () => {
    const html = await renderOverview({
      workspaceId: "workspace_sales",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Campanha Vendas",
          status: "active",
          ...salesMetrics(),
        },
      ],
    });
    const cards = metricCards(html);

    expect(cards.map((card) => card.label)).toEqual([
      "Investimento",
      "Conversas Meta",
      "Conversas reais",
      "Lead qualificado",
      "Compras",
      "Receita trafego",
    ]);
    expect(cards.find((card) => card.label === "Compras")?.delta).toBe(
      "1 primeira compra",
    );
    expect(cards.find((card) => card.label === "Receita trafego")?.delta).toBe(
      "ROAS 3.00x",
    );
    // first_purchase is a Purchase breakdown, not a separate KPI card.
    expect(cards.map((card) => card.label)).not.toContain("Primeira compra");
  });

  it("stages without monetary value show a real count and no revenue", async () => {
    const html = await renderOverview({
      workspaceId: "workspace_leads",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [],
      // Summary comes straight from the API (no client-side recomputation):
      // stages without spend or value carry costCents null.
      summary: {
        id: "workspace_summary",
        name: "Resumo do workspace",
        status: "unknown",
        ...leadOnlyMetrics(),
        spendCents: 0,
        funnelSteps: leadOnlyMetrics().funnelSteps.map((step) => ({
          ...step,
          costCents: null,
        })),
      },
    });
    const cards = metricCards(html);
    const viewContent = cards.find((card) => card.label === "Pre-qualificado");

    expect(viewContent?.value).toBe("12");
    expect(viewContent?.delta).toBe("Ultimos 7 dias");
    expect(viewContent?.delta).not.toContain("R$");
    expect(html).not.toContain("Receita trafego");
    expect(html).not.toContain("ROAS");
  });

  it("derives cards per workspace payload rather than a fixed list", async () => {
    const leadHtml = await renderOverview({
      workspaceId: "workspace_leads",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [],
      summary: {
        id: "workspace_summary",
        name: "Resumo do workspace",
        status: "unknown",
        ...leadOnlyMetrics(),
      },
    });
    vi.restoreAllMocks();
    const salesHtml = await renderOverview({
      workspaceId: "workspace_sales",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [],
      summary: {
        id: "workspace_summary",
        name: "Resumo do workspace",
        status: "unknown",
        ...salesMetrics(),
      },
    });

    expect(metricCards(leadHtml).map((card) => card.label)).toEqual([
      "Investimento",
      "Conversas Meta",
      "Conversas reais",
      "Pre-qualificado",
      "Lead qualificado",
    ]);
    expect(metricCards(salesHtml).map((card) => card.label)).toEqual([
      "Investimento",
      "Conversas Meta",
      "Conversas reais",
      "Lead qualificado",
      "Compras",
      "Receita trafego",
    ]);
  });

  it("keeps the base cards when the funnel is empty", async () => {
    const html = await renderOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [],
    });

    expect(metricCards(html).map((card) => card.label)).toEqual([
      "Investimento",
      "Conversas Meta",
      "Conversas reais",
    ]);
  });

  it("renamed QualifiedLead: card label and cost caption use the custom label", async () => {
    const metrics = leadOnlyMetrics();
    const html = await renderOverview({
      workspaceId: "workspace_leads",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Campanha Leads",
          status: "active",
          ...metrics,
          funnelSteps: metrics.funnelSteps.map((step) =>
            step.key === "qualified_lead"
              ? { ...step, label: "Cliente potencial" }
              : step,
          ),
        },
      ],
    });
    const cards = metricCards(html);
    const qualified = cards.find((card) => card.label === "Cliente potencial");

    expect(qualified).toBeDefined();
    expect(qualified?.value).toBe("4");
    expect(qualified?.delta).toBe("Custo por cliente potencial R$\u00a025,00");
    expect(html).not.toContain("Lead qualificado");
    expect(html).not.toContain("Custo por lead qualificado");
  });

  it("renamed Purchase: card label and funnel cost caption use the custom label", async () => {
    const metrics = salesMetrics();
    const html = await renderOverview({
      workspaceId: "workspace_sales",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Campanha Vendas",
          status: "active",
          ...metrics,
          funnelSteps: metrics.funnelSteps.map((step) =>
            step.key === "purchase" ? { ...step, label: "Vendas" } : step,
          ),
        },
      ],
    });
    const cards = metricCards(html);

    expect(cards.map((card) => card.label)).toEqual([
      "Investimento",
      "Conversas Meta",
      "Conversas reais",
      "Lead qualificado",
      "Vendas",
      "Receita trafego",
    ]);
    expect(cards.find((card) => card.label === "Vendas")?.delta).toBe(
      "1 primeira compra",
    );
    expect(html).toContain("Custo por vendas");
    expect(html).not.toContain("Custo por compra<");
    expect(html).not.toContain(">Compras<");
    // Purchase breakdown keeps its own caption.
    expect(html).toContain("Custo por primeira compra");
  });
});

type FetchRoutes = {
  report?: Record<string, unknown> | Response;
  metaAssets?: Record<string, unknown>;
  instances?: unknown[];
  campaignOptions?: Record<string, unknown> | Response;
};

/** Routes fetch by path so the parallel page requests stay deterministic. */
function mockOverviewApi(routes: FetchRoutes) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const respond = (body: unknown) =>
      body instanceof Response ? body : overviewResponse(body);

    if (url.includes("/reports/campaign-options")) {
      return routes.campaignOptions
        ? respond(routes.campaignOptions)
        : new Response("offline", { status: 503 });
    }

    if (url.includes("/reports/campaigns")) {
      return respond(routes.report ?? { campaigns: [] });
    }

    if (url.includes("/integrations/meta/assets")) {
      return routes.metaAssets
        ? respond(routes.metaAssets)
        : new Response("offline", { status: 503 });
    }

    if (url.includes("/integrations/whatsapp/instances")) {
      return respond(routes.instances ?? []);
    }

    return new Response("not found", { status: 404 });
  });
}

async function renderOverviewWith(
  routes: FetchRoutes,
  searchParams: Record<string, string> = {},
) {
  mockOverviewApi(routes);
  const element = await OverviewPage({
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(createElement("div", null, element));
}

const campaignInstances = [
  {
    id: "instance_centro",
    name: "Loja Centro",
    provider: "uazapi",
    billingStatus: "active",
    providerInstanceId: "5511999991234",
    checkoutUrl: null,
    createdAt: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "instance_norte",
    name: "Loja Norte",
    provider: "uazapi",
    billingStatus: "active",
    providerInstanceId: "5511999995678",
    checkoutUrl: null,
    createdAt: "2026-07-01T12:00:00.000Z",
  },
];

const campaignOptionsBody = {
  campaigns: [
    {
      id: "cmp_promo",
      name: "Promo Setembro",
      status: "active",
      businessId: "business_1",
      adAccountId: "act_1",
      leadsByInstance: { instance_centro: 6 },
    },
    {
      id: "cmp_outra",
      name: "Outra campanha",
      status: "paused",
      businessId: "business_1",
      adAccountId: "act_1",
      leadsByInstance: {},
    },
  ],
};

function campaignReport(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "workspace_1",
    rangeLabel: "Ultimos 7 dias",
    since: "2026-09-17",
    until: "2026-09-24",
    campaigns: [
      {
        id: "cmp_promo",
        name: "Promo Setembro",
        status: "active",
        ...reportMetrics(),
      },
    ],
    summary: {
      id: "workspace_summary",
      name: "Resumo",
      status: "active",
      ...reportMetrics(),
    },
    dailyComparisonAvailable: true,
    dailyComparison: [
      {
        date: "2026-09-24",
        metaConversationsStarted: 10,
        realConversations: 6,
      },
    ],
    filters: { campaignId: "cmp_promo", campaignName: "Promo Setembro" },
    campaignInstanceLeads: [
      { instanceId: "instance_centro", instanceName: "Loja Centro", leads: 6 },
    ],
    metaMetricsScope: "campaign",
    ...overrides,
  };
}

function funnelCosts(html: string): string[] {
  const grid = html.slice(
    html.indexOf("conversion-funnel-stage-grid"),
    html.indexOf("conversion-funnel-chart"),
  );

  return Array.from(
    grid.matchAll(
      /<div class="conversion-funnel-stage-cost"><span>(.*?)<\/span><strong>(.*?)<\/strong>/g,
    ),
    (match) => `${match[1]}: ${match[2]}`,
  );
}

describe("overview campaign x WhatsApp number cross-filter", () => {
  // §9 test 8
  it("sends campaignId to the report and scopes the option list to the period and account", async () => {
    const fetchSpy = mockOverviewApi({
      report: campaignReport(),
      campaignOptions: campaignOptionsBody,
      instances: campaignInstances,
    });
    const element = await OverviewPage({
      searchParams: Promise.resolve({
        since: "2026-09-17",
        until: "2026-09-24",
        adAccountId: "act_1",
        campaignId: "cmp_promo",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));
    const urls = fetchSpy.mock.calls.map(([input]) => String(input));

    expect(urls).toContain(
      "http://localhost:3333/reports/campaigns?includeDaily=true&includeSummary=true&since=2026-09-17&until=2026-09-24&adAccountId=act_1&campaignId=cmp_promo",
    );
    expect(urls).toContain(
      "http://localhost:3333/reports/campaign-options?since=2026-09-17&until=2026-09-24&adAccountId=act_1",
    );
    expect(html).toContain('<select name="campaignId">');
    expect(html).toContain(
      '<option value="cmp_promo" title="Promo Setembro" selected="">Promo Setembro</option>',
    );
    expect(html).toContain("Outra campanha · Pausada");
    expect(html).toContain('<span class="tag">1 campanha</span>');
    expect(html).not.toContain("1 campanhas");
  });

  it("carries campaignId into Abrir relatorios", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport({ dailyComparisonAvailable: false }),
        campaignOptions: campaignOptionsBody,
      },
      { campaignId: "cmp_promo", whatsappInstanceId: "instance_centro" },
    );

    expect(html).toContain(
      'href="/reports?whatsappInstanceId=instance_centro&amp;campaignId=cmp_promo">Abrir relatorios',
    );
  });

  // §9 test 11 (S4)
  it("S4: exclusive campaign on the number renders real Meta metrics, costs and ROAS", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport(),
        campaignOptions: campaignOptionsBody,
        instances: campaignInstances,
      },
      { campaignId: "cmp_promo", whatsappInstanceId: "instance_centro" },
    );
    const cards = metricCards(html);

    expect(cards.find((card) => card.label === "Investimento")).toEqual({
      label: "Investimento",
      value: "R$\u00a0100,00",
      delta: "Ultimos 7 dias",
    });
    expect(cards.find((card) => card.label === "Conversas Meta")).toEqual({
      label: "Conversas Meta",
      value: "10",
      delta: "Custo por conversa Meta R$\u00a010,00",
    });
    expect(cards.find((card) => card.label === "Receita trafego")?.delta).toBe(
      "ROAS 3.00x",
    );
    expect(cards.find((card) => card.label === "Lead qualificado")?.delta).toBe(
      "Custo por lead qualificado R$\u00a0100,00",
    );
    expect(html).not.toContain("metric-card partial");
    expect(html).not.toContain('role="note"');
    expect(funnelCosts(html)[0]).toBe("Custo por conversa Meta: R$\u00a010,00");
    expect(html).toContain("10 conversas registradas pela Meta");
  });

  // §9 test 11 (S5)
  it("S5: shared campaign renders partial Meta cards without ROAS or funnel costs", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport({
          metaMetricsScope: "campaign_shared",
          campaignInstanceLeads: [
            {
              instanceId: "instance_centro",
              instanceName: "Loja Centro",
              leads: 6,
            },
            {
              instanceId: "instance_norte",
              instanceName: "Loja Norte",
              leads: 2,
            },
          ],
        }),
        campaignOptions: campaignOptionsBody,
        instances: campaignInstances,
      },
      { campaignId: "cmp_promo", whatsappInstanceId: "instance_centro" },
    );
    const cards = metricCards(html);

    expect(html).toContain(
      '<div class="metric-card partial"><span>Investimento</span><strong>R$\u00a0100,00</strong><small>Campanha inteira · inclui outro numero</small></div>',
    );
    expect(html).toContain(
      '<div class="metric-card partial"><span>Conversas Meta</span><strong>10</strong><small>Campanha inteira · inclui outro numero</small></div>',
    );
    expect(cards.find((card) => card.label === "Receita trafego")?.delta).toBe(
      "Receita do numero; ROAS indisponivel",
    );
    expect(cards.find((card) => card.label === "Lead qualificado")?.delta).toBe(
      "Ultimos 7 dias",
    );
    expect(html).not.toContain("ROAS 3.00x");
    expect(html).not.toContain("metric-card partial unavailable");
    const costs = funnelCosts(html);
    expect(costs[0]).toBe("Custo por conversa Meta: -");
    expect(costs.every((cost) => cost.endsWith(": -"))).toBe(true);
    expect(html).toContain(
      "Esta campanha tambem gerou conversas em outro numero. Investimento e Conversas Meta mostram a campanha inteira; custos por etapa e ROAS ficam ocultos para nao distorcer o resultado.",
    );
    expect(html).toContain(
      "Ultimos 7 dias: 6 conversas reais neste numero vindas da campanha selecionada.",
    );
  });

  it("S6: campaign with no conversations on the number shows the S6 note", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport({
          metaMetricsScope: "campaign_shared",
          summary: {
            id: "workspace_summary",
            name: "Resumo",
            status: "active",
            ...reportMetrics({ realConversations: 0 }),
          },
          campaignInstanceLeads: [
            {
              instanceId: "instance_norte",
              instanceName: "Loja Norte",
              leads: 2,
            },
          ],
        }),
        campaignOptions: campaignOptionsBody,
        instances: campaignInstances,
      },
      { campaignId: "cmp_promo", whatsappInstanceId: "instance_centro" },
    );
    const cards = metricCards(html);

    expect(html).toContain(
      "Esta campanha nao gerou conversas neste numero no periodo. Investimento e Conversas Meta mostram a campanha inteira.",
    );
    expect(cards.find((card) => card.label === "Investimento")?.delta).toBe(
      "Campanha inteira · nenhuma conversa neste numero",
    );
    expect(html).toContain("metric-card partial");
  });

  it("S7: campaign without delivery shows a real zero and no ROAS", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport({
          summary: {
            id: "workspace_summary",
            name: "Resumo",
            status: "active",
            ...reportMetrics({
              spendCents: 0,
              metaConversationsStarted: 0,
              costPerMetaConversationCents: null,
              roasAcquisition: null,
            }),
          },
        }),
        campaignOptions: campaignOptionsBody,
      },
      { campaignId: "cmp_promo" },
    );
    const cards = metricCards(html);

    expect(cards.find((card) => card.label === "Investimento")).toEqual({
      label: "Investimento",
      value: "R$\u00a00,00",
      delta: "Sem veiculacao no periodo",
    });
    expect(cards.find((card) => card.label === "Receita trafego")?.delta).toBe(
      "ROAS indisponivel",
    );
  });

  it("S8: unsynced campaign keeps Meta metrics unavailable", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport({ metaMetricsScope: "campaign_unsynced" }),
        campaignOptions: campaignOptionsBody,
      },
      { campaignId: "cmp_promo" },
    );
    const cards = metricCards(html);

    expect(cards.find((card) => card.label === "Investimento")).toEqual({
      label: "Investimento",
      value: "-",
      delta: "Aguardando sincronizacao da Meta",
    });
    expect(cards.find((card) => card.label === "Conversas Meta")?.delta).toBe(
      "Aguardando sincronizacao da Meta",
    );
    expect(cards.find((card) => card.label === "Receita trafego")?.delta).toBe(
      "ROAS indisponivel",
    );
    expect(funnelCosts(html)[0]).not.toContain("Custo por conversa Meta");
  });

  // §9 test 12
  it("S2: number without campaign keeps #110 dashes and points to the campaign filter", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport({
          filters: { whatsappInstanceId: "instance_centro" },
          campaignInstanceLeads: undefined,
          metaMetricsScope: "ad_account",
        }),
        campaignOptions: campaignOptionsBody,
        instances: campaignInstances,
      },
      { whatsappInstanceId: "instance_centro" },
    );
    const cards = metricCards(html);

    expect(cards.find((card) => card.label === "Investimento")).toEqual({
      label: "Investimento",
      value: "-",
      delta: "Conta de anuncios (nao filtravel por chip)",
    });
    expect(html).toContain(
      '<p class="muted" role="note">Investimento e Conversas Meta existem por campanha, nao por numero. Escolha uma campanha para ver o investimento que trouxe conversas para este numero.</p>',
    );
    expect(html).not.toContain("sao da conta de anuncios e nao podem");
    expect(html).toContain('<select name="campaignId">');
    expect(html).toContain('<optgroup label="Com conversas neste numero">');
  });

  it("hints the campaign's only number with a one-click filter link", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport(),
        campaignOptions: campaignOptionsBody,
        instances: campaignInstances,
      },
      { campaignId: "cmp_promo", adAccountId: "act_1" },
    );

    expect(html).toContain("Esta campanha leva conversas para ");
    expect(html).toContain(
      '<span class="presentation-mask-value">Loja Centro - •••• 1234</span><span class="presentation-mask-placeholder">Numero oculto</span>',
    );
    expect(html).toContain(
      'href="/overview?adAccountId=act_1&amp;whatsappInstanceId=instance_centro&amp;campaignId=cmp_promo">Filtrar este numero</a>',
    );
  });

  it("hints when the campaign spreads across several numbers", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport({
          campaignInstanceLeads: [
            {
              instanceId: "instance_centro",
              instanceName: "Loja Centro",
              leads: 6,
            },
            {
              instanceId: "instance_norte",
              instanceName: "Loja Norte",
              leads: 3,
            },
            {
              instanceId: "instance_zero",
              instanceName: "Sem leads",
              leads: 0,
            },
          ],
        }),
        campaignOptions: campaignOptionsBody,
      },
      { campaignId: "cmp_promo" },
    );

    expect(html).toContain(
      "Esta campanha gerou conversas em 2 numeros. Selecione um numero para ver o resultado de cada um.",
    );
    expect(html).not.toContain("Filtrar este numero");
  });

  it("shows no hint when the campaign has no conversations", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport({ campaignInstanceLeads: [] }),
        campaignOptions: campaignOptionsBody,
      },
      { campaignId: "cmp_promo" },
    );

    expect(html).not.toContain('role="note"');
  });

  // §9 test 10 (page side)
  it("masks the campaign name in the daily comparison scope", async () => {
    const html = await renderOverviewWith(
      {
        report: campaignReport(),
        campaignOptions: campaignOptionsBody,
      },
      { campaignId: "cmp_promo" },
    );
    const header = html.slice(0, html.indexOf("overview-filter-bar"));

    expect(html).toContain(
      '<span class="presentation-mask-value">Promo Setembro</span><span class="presentation-mask-placeholder">Campanha oculta</span>',
    );
    expect(header).not.toContain("Promo Setembro");
    // Outside the filter select, the name only appears inside a mask.
    const withoutSelect = html.replace(
      /<select name="campaignId">.*?<\/select>/,
      "",
    );
    expect(
      withoutSelect.replaceAll(
        '<span class="presentation-mask-value">Promo Setembro</span>',
        "",
      ),
    ).not.toContain("Promo Setembro");
  });

  // §9 test 13
  it("renders the invalid-filter state for a 404 campaign", async () => {
    const html = await renderOverviewWith(
      {
        report: new Response(
          JSON.stringify({ message: "Campanha nao encontrada" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
        campaignOptions: campaignOptionsBody,
      },
      {
        since: "2026-09-17",
        until: "2026-09-24",
        whatsappInstanceId: "instance_centro",
        campaignId: "cmp_foreign",
      },
    );

    expect(html).toContain("Campanha nao encontrada");
    expect(html).toContain(
      "Ela pode ter sido removida ou pertencer a outra conta de anuncio.",
    );
    expect(html).toContain(
      '<a class="button ghost" href="/overview?since=2026-09-17&amp;until=2026-09-24&amp;whatsappInstanceId=instance_centro">Limpar campanha</a>',
    );
    expect(html).not.toContain("overview-primary-metrics");
    expect(html).not.toContain("overview-funnel-panel");
    expect(html).not.toContain("daily-comparison");
    expect(html).not.toContain("API indisponivel");
    expect(html).not.toContain("R$\u00a00,00");
  });

  it("keeps a 404 without campaignId as the generic error state", async () => {
    const html = await renderOverviewWith({
      report: new Response("missing", { status: 404 }),
    });

    expect(html).toContain("API indisponivel");
    expect(html).not.toContain("Limpar campanha");
  });

  // §9 test 14
  it("still renders the report when the campaign options endpoint fails", async () => {
    const html = await renderOverviewWith({
      report: {
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias",
        campaigns: [
          {
            id: "cmp_1",
            name: "Campanha Real",
            status: "active",
            ...reportMetrics(),
          },
        ],
      },
      campaignOptions: new Response("offline", { status: 503 }),
    });
    const cards = metricCards(html);

    expect(html).toContain(
      '<select disabled=""><option value="" selected="">Campanhas indisponiveis</option></select>',
    );
    expect(cards.find((card) => card.label === "Investimento")?.value).toBe(
      "R$\u00a0100,00",
    );
  });
});
