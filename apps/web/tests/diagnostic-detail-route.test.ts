import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DiagnosticEventPage from "../src/app/(backoffice)/backoffice/diagnostics/[eventId]/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("diagnostic detail route", () => {
  it("renders diagnostic event detail and retry action", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "diag_1",
          workspaceId: "workspace_1",
          source: "meta",
          eventType: "pixel_event",
          severity: "error",
          status: "error",
          occurredAt: "2026-07-02T03:00:00.000Z",
          title: "Meta recusou evento",
          message: "Parametro currency ausente",
          leadId: null,
          phoneHash: "hash_phone",
          campaignId: "campaign_1",
          adSetId: null,
          adId: "ad_1",
          jobId: "job_1",
          errorCode: "MISSING_CURRENCY",
          summaryPayload: {
            currency: null,
            response: {
              status: 400,
              message: "Missing currency"
            }
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await DiagnosticEventPage({
      params: Promise.resolve({ eventId: "diag_1" })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/events/diag_1",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Meta recusou evento");
    expect(html).toContain("MISSING_CURRENCY");
    expect(html).toContain("campaign_1");
    expect(html).toContain("Missing currency");
    expect(html).toContain("Reprocessar evento");
    expect(html).toContain("diag_1");
  });
});
