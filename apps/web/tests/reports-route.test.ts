import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportsPage from "../src/app/(app)/reports/page";

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
                roas: null
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
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
                        effectiveStatus: "ACTIVE"
                      }
                    ]
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
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
                roas: null
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
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
                roas: null
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await ReportsPage({
      searchParams: Promise.resolve({
        since: "2026-07-01",
        until: "2026-07-02"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns?since=2026-07-01&until=2026-07-02",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/meta/structure",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/adsets?since=2026-07-01&until=2026-07-02",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/ads?since=2026-07-01&until=2026-07-02",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Black Friday WhatsApp");
    expect(html).not.toContain("Remarketing 7 dias");
    expect(html).not.toContain("Publico frio - videos");
    expect(html).toContain("Publico quente");
    expect(html).toContain("Criativo WhatsApp");
    expect(html).toContain("Sincronizar Meta");
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
    expect(html).toContain("600,00");
    expect(html).toContain("300,00");
    expect(html).not.toContain("nao tem investimento proprio persistido");
  });

  it("renders an empty campaign state without demo rows when backend returns no campaigns", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            campaigns: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            campaigns: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            adSets: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            ads: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await ReportsPage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Nenhuma campanha sincronizada");
    expect(html).toContain("Nenhum conjunto sincronizado");
    expect(html).toContain("Nenhum anuncio sincronizado");
    expect(html).toContain("Use Sincronizar Meta");
    expect(html).not.toContain("Black Friday WhatsApp");
    expect(html).not.toContain("Remarketing 7 dias");
  });

  it("renders an unavailable state without demo rows when backend is unavailable", async () => {
    vi.spyOn(globalThis, "fetch")
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
});
