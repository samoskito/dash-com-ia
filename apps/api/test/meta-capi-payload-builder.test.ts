import { describe, expect, it } from "vitest";
import { buildMetaCapiPayload } from "../src/conversion-events/meta-capi-payload.builder";

describe("Meta CAPI payload builder", () => {
  it("builds a WhatsApp business messaging payload with CTWA and page_id", () => {
    const payload = buildMetaCapiPayload({
      eventName: "QualifiedLead",
      eventTime: new Date("2026-07-09T12:00:00.000Z"),
      eventId: "event_1",
      phoneHash: "phone_hash_1",
      ctwaClid: "clid_1",
      pageId: "page_1",
      adId: "ad_1"
    });

    expect(payload.data[0]).toMatchObject({
      event_name: "QualifiedLead",
      event_time: 1783598400,
      event_id: "event_1",
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        ph: ["phone_hash_1"],
        ctwa_clid: "clid_1",
        page_id: "page_1"
      },
      custom_data: {
        ad_id: "ad_1"
      }
    });
  });

  it("builds Purchase custom_data with value fields", () => {
    const payload = buildMetaCapiPayload({
      eventName: "Purchase",
      eventTime: new Date("2026-07-09T12:00:00.000Z"),
      eventId: "purchase_1",
      phoneHash: "phone_hash_1",
      ctwaClid: "clid_1",
      pageId: "page_1",
      adId: "ad_1",
      valueCents: 19900,
      currency: "BRL",
      contentName: "Plano mensal"
    });

    expect(payload.data[0].custom_data).toMatchObject({
      ad_id: "ad_1",
      value: 199,
      currency: "BRL",
      content_name: "Plano mensal"
    });
  });

  it("adds test_event_code at the top level when provided", () => {
    const payload = buildMetaCapiPayload({
      eventName: "LeadSubmitted",
      eventTime: new Date("2026-07-09T12:00:00.000Z"),
      eventId: "lead_1",
      phoneHash: "phone_hash_1",
      ctwaClid: "clid_1",
      pageId: "page_1",
      adId: "ad_1",
      testEventCode: "TEST12345"
    });

    expect(payload.test_event_code).toBe("TEST12345");
  });
});
