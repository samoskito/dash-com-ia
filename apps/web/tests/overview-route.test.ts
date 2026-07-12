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
        costCents: 1666
      },
      {
        key: "qualified_lead",
        label: "Lead qualificado",
        value: 1,
        costCents: 10000
      },
      {
        key: "purchase",
        label: "Compras",
        value: 1,
        costCents: 10000
      },
      {
        key: "first_purchase",
        label: "Primeira compra",
        value: 1
      }
    ]
  };

  return { ...metrics, ...overrides };
}

describe("overview route", () => {
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
              ...reportMetrics()
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
                    costCents: 2500
                  }
                ]
              })
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await OverviewPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns?includeSummary=true",
      expect.objectContaining({ credentials: "include" })
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
    expect(html).toContain(">1<");
    expect(html).not.toContain("LeadSubmitted");
    expect(html).not.toContain("Black Friday WhatsApp");
  });

  it("renders an empty overview state without mock campaign data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workspaceId: "workspace_1",
          rangeLabel: "Ultimos 7 dias",
          campaigns: []
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await OverviewPage();
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
              roasWithRepurchase: null
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await OverviewPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("0 campanhas");
    expect(html).toContain("4 conversas com origem identificada");
    expect(html).toContain("1 conversa organica");
    expect(html).not.toContain("Aguardando conversas");
  });

  it("renders an unavailable overview state without mock campaign data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("offline", { status: 503 })
    );

    const element = await OverviewPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar relatorios");
    expect(html).toContain("Dados temporariamente indisponiveis");
    expect(html).toContain("Valores indisponiveis nao foram tratados como zero");
    expect(html).not.toContain("0% conciliadas");
    expect(html).not.toContain("Black Friday WhatsApp");
  });
});
