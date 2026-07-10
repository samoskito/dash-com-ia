import { describe, expect, it } from "vitest";
import { parseUazapiWebhook } from "../src/webhooks/uazapi-webhook-parser";

describe("Uazapi webhook parser", () => {
  it("extracts CTWA and attribution from message referral", () => {
    const parsed = parseUazapiWebhook({
      event: "message.received",
      id: "event_1",
      message: {
        text: "quero comprar",
        referral: {
          ctwa_clid: "clid_1",
          source_url: "https://fb.com/ad",
          ad_id: "ad_1",
          adset_id: "adset_1",
          campaign_id: "cmp_1"
        }
      },
      contact: { phone: "+55 11 99999-1234", name: "Maria" }
    });

    expect(parsed).toMatchObject({
      eventType: "message.received",
      externalEventId: "event_1",
      messageText: "quero comprar",
      phone: "+55 11 99999-1234",
      contactName: "Maria",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      ctwaClid: "clid_1",
      ctwaSourceUrl: "https://fb.com/ad"
    });
  });

  it("extracts labels from strings and label objects", () => {
    const parsed = parseUazapiWebhook({
      labels: ["Venda fechada", { name: "VIP" }, { title: "BPC" }]
    });

    expect(parsed.labels).toEqual(["Venda fechada", "VIP", "BPC"]);
  });

  it("does not treat ctwaPayload as ctwa_clid", () => {
    const parsed = parseUazapiWebhook({
      ctwaPayload: "internal_blob",
      message: { referral: { ctwaPayload: "nested_blob" } }
    });

    expect(parsed.ctwaClid).toBeUndefined();
  });

  it("extracts top-level ctwaClid", () => {
    const parsed = parseUazapiWebhook({ ctwaClid: "clid_top" });

    expect(parsed.ctwaClid).toBe("clid_top");
  });

  it("extracts ctwaClid from context referral", () => {
    const parsed = parseUazapiWebhook({
      context: { referral: { ctwaClid: "clid_context" } }
    });

    expect(parsed.ctwaClid).toBe("clid_context");
  });

  it("falls back to context referral CTWA clid when earlier referrals lack one", () => {
    const parsed = parseUazapiWebhook({
      referral: { ad_id: "ad_top" },
      message: { referral: { campaign_id: "cmp_message" } },
      context: { referral: { ctwa_clid: "clid_context" } }
    });

    expect(parsed.ctwaClid).toBe("clid_context");
    expect(parsed.adId).toBe("ad_top");
  });

  it("falls back to context referral CTWA source URL when earlier referrals lack one", () => {
    const parsed = parseUazapiWebhook({
      referral: { ad_id: "ad_top" },
      message: { referral: { campaign_id: "cmp_message" } },
      context: { referral: { source_url: "https://fb.com/context-ad" } }
    });

    expect(parsed.ctwaSourceUrl).toBe("https://fb.com/context-ad");
    expect(parsed.adId).toBe("ad_top");
  });

  it("extracts provider instance id from nested instance records", () => {
    expect(
      parseUazapiWebhook({ instance: { id: "instance_1" } })
        .providerInstanceId
    ).toBe("instance_1");
    expect(
      parseUazapiWebhook({
        whatsappInstance: { providerInstanceId: "provider_instance_1" }
      }).providerInstanceId
    ).toBe("provider_instance_1");
  });

  it("extracts message text from top-level fallbacks", () => {
    expect(parseUazapiWebhook({ text: "from text" }).messageText).toBe(
      "from text"
    );
    expect(parseUazapiWebhook({ body: "from body" }).messageText).toBe(
      "from body"
    );
    expect(
      parseUazapiWebhook({ messageText: "from messageText" }).messageText
    ).toBe("from messageText");
  });
});
