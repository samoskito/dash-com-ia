import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OverviewPage from "../src/app/(app)/overview/page";

afterEach(() => {
  vi.restoreAllMocks();
});

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
              spendCents: 10000,
              metaConversationsStarted: 10,
              costPerMetaConversationCents: 1000,
              realConversations: 6,
              costPerRealConversationCents: 1666,
              leadSubmitted: 2,
              costPerLeadSubmittedCents: 5000,
              qualifiedLead: 1,
              costPerQualifiedLeadCents: 10000,
              purchase: 1,
              costPerPurchaseCents: 10000,
              roas: null
            },
            {
              id: "cmp_2",
              name: "Segunda Campanha",
              status: "paused",
              spendCents: 5000,
              metaConversationsStarted: 5,
              costPerMetaConversationCents: 1000,
              realConversations: 2,
              costPerRealConversationCents: 2500,
              leadSubmitted: 1,
              costPerLeadSubmittedCents: 5000,
              qualifiedLead: 0,
              costPerQualifiedLeadCents: null,
              purchase: 0,
              costPerPurchaseCents: null,
              roas: null
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await OverviewPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("2026-07-01 a 2026-07-02");
    expect(html).toContain("Campanha Real");
    expect(html).toContain("Segunda Campanha");
    expect(html).toContain(">15<");
    expect(html).toContain(">8<");
    expect(html).toContain(">3<");
    expect(html).toContain(">1<");
    expect(html).not.toContain("Black Friday WhatsApp");
  });
});
