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
        JSON.stringify([
          {
            id: "lead_1",
            workspaceId: "workspace_1",
            name: "Mariana Alves",
            phoneDisplay: "+55 11 *****-1020",
            phoneHash: "phone_hash_1",
            status: "qualified",
            source: "uazapi",
            campaignId: "cmp_1",
            campaignName: "Black Friday WhatsApp",
            adSetId: "adset_1",
            adId: "ad_1",
            lastEventName: "QualifiedLead",
            score: 86,
            firstMessageAt: "2026-07-02T03:00:00.000Z",
            lastMessageAt: "2026-07-02T03:10:00.000Z",
            createdAt: "2026-07-02T03:00:00.000Z",
            updatedAt: "2026-07-02T03:10:00.000Z"
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await LeadsPage({
      searchParams: Promise.resolve({
        search: "mariana",
        status: "qualified"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/leads?search=mariana&status=qualified",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Mariana Alves");
    expect(html).toContain("Black Friday WhatsApp");
    expect(html).toContain("QualifiedLead");
    expect(html).toContain("+55 11 *****-1020");
  });
});
