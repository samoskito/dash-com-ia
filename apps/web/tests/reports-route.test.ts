import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportsPage from "../src/app/(app)/reports/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reports route", () => {
  it("renders campaign reports returned by the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
              realConversations: 0,
              costPerRealConversationCents: null,
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
    );

    const element = await ReportsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/campaigns",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Black Friday WhatsApp");
    expect(html).toContain("1.200,00");
    expect(html).toContain("176");
    expect(html).toContain("LeadSubmitted");
  });
});
