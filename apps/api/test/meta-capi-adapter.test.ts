import { describe, expect, it, vi } from "vitest";
import { MetaCapiAdapter } from "../src/conversion-events/meta-capi.adapter";

describe("meta capi adapter", () => {
  it("reports not_configured without access token or pixel id", async () => {
    const adapter = new MetaCapiAdapter({}, fetch);

    const result = await adapter.sendEvent({
      pixelId: null,
      eventName: "QualifiedLead",
      dedupeKey: "dedupe_1",
      phoneHash: "phone_hash",
      adId: "ad_1"
    });

    expect(result).toEqual({
      status: "not_configured",
      responseSummary: null,
      errorMessage: "Meta CAPI token or pixel id not configured"
    });
  });

  it("sends conversion events to the pixel events edge", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(url);
      requestedInit = init;

      return new Response(
        JSON.stringify({
          events_received: 1,
          messages: []
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const adapter = new MetaCapiAdapter(
      {
        META_CAPI_ACCESS_TOKEN: "meta-token",
        META_GRAPH_API_VERSION: "v21.0"
      },
      fetchMock as never
    );

    const result = await adapter.sendEvent({
      pixelId: "pixel_1",
      eventName: "QualifiedLead",
      dedupeKey: "workspace_1:lead_1:rule_1:QualifiedLead:ad_1",
      phoneHash: "phone_hash",
      adId: "ad_1"
    });

    expect(result.status).toBe("sent");
    expect(requestedUrl).toBe(
      "https://graph.facebook.com/v21.0/pixel_1/events?access_token=meta-token"
    );
    const body = JSON.parse(String(requestedInit?.body));
    expect(body.data[0]).toMatchObject({
      event_name: "QualifiedLead",
      event_id: "workspace_1:lead_1:rule_1:QualifiedLead:ad_1",
      action_source: "business_messaging",
      user_data: {
        ph: ["phone_hash"]
      },
      custom_data: {
        ad_id: "ad_1"
      }
    });
  });
});
