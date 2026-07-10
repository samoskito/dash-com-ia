import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LeadsPage from "../src/app/(app)/leads/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("leads route", () => {
  it("renders leads returned by the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "lead_1",
              workspaceId: "workspace_1",
              name: "Mariana Alves",
              phoneDisplay: "+55 11 *****-1020",
              phoneHash: "phone_hash_1",
              status: "qualified",
              source: "uazapi",
              labels: ["Venda fechada", "VIP"],
              campaignId: "cmp_1",
              campaignName: "Black Friday WhatsApp",
              adSetId: "adset_1",
              adId: "ad_1",
              lastEventName: "QualifiedLead",
              score: 86,
              firstMessageAt: "2026-07-02T03:00:00.000Z",
              lastMessageAt: "2026-07-02T03:10:00.000Z",
              createdAt: "2026-07-02T03:00:00.000Z",
              updatedAt: "2026-07-02T03:10:00.000Z",
            },
          ],
          pagination: {
            page: 1,
            pageSize: 25,
            totalItems: 1,
            totalPages: 1,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const element = await LeadsPage({
      searchParams: Promise.resolve({
        search: "mariana",
        status: "qualified",
        label: "Venda fechada",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/leads/page?search=mariana&status=qualified&label=Venda+fechada&page=1&pageSize=25",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(html).toContain("Mariana Alves");
    expect(html).toContain('href="/leads/lead_1"');
    expect(html).toContain("Black Friday WhatsApp");
    expect(html).toContain("QualifiedLead");
    expect(html).toContain("Venda fechada");
    expect(html).toContain('name="label"');
    expect(html).toContain("+55 11 *****-1020");
  });

  it("passes report drill-down filters to the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          pagination: {
            page: 1,
            pageSize: 25,
            totalItems: 0,
            totalPages: 0,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const element = await LeadsPage({
      searchParams: Promise.resolve({
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/leads/page?campaignId=cmp_1&adSetId=adset_1&adId=ad_1&since=2026-07-01&until=2026-07-02&page=1&pageSize=25",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(html).toContain("Filtro do relatorio aplicado");
    expect(html).toContain('name="campaignId"');
    expect(html).toContain('name="adSetId"');
    expect(html).toContain('name="adId"');
  });

  it("renders an unavailable state without demo leads when the backend fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const element = await LeadsPage({
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar leads");
    expect(html).not.toContain("Mariana Alves");
    expect(html).not.toContain("Rafael Costa");
    expect(html).not.toContain("Black Friday WhatsApp");
    expect(html).not.toContain("Remarketing 7 dias");
  });

  it("renders an empty state without demo leads when there are no backend leads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          pagination: {
            page: 1,
            pageSize: 25,
            totalItems: 0,
            totalPages: 0,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const element = await LeadsPage({
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Nenhum lead encontrado");
    expect(html).not.toContain("Mariana Alves");
    expect(html).not.toContain("Rafael Costa");
    expect(html).not.toContain("Black Friday WhatsApp");
    expect(html).not.toContain("Remarketing 7 dias");
  });
});
