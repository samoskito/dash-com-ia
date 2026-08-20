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
          campaign_id: "cmp_1",
        },
      },
      contact: { phone: "+55 11 99999-1234", name: "Maria" },
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
      ctwaSourceUrl: "https://fb.com/ad",
    });
  });

  it("extracts labels from strings and label objects", () => {
    const parsed = parseUazapiWebhook({
      labels: ["Venda fechada", { name: "VIP" }, { title: "BPC" }],
    });

    expect(parsed.labels).toEqual(["Venda fechada", "VIP", "BPC"]);
  });

  it("distinguishes the live labels catalog event from a chat_labels snapshot", () => {
    expect(
      parseUazapiWebhook({
        type: "LabelEdit",
        EventType: "labels",
        event: { LabelID: "9" },
      }),
    ).toMatchObject({
      eventType: "labels",
      labelEventKind: "labels_catalog",
      waLabelIds: [],
    });
    expect(
      parseUazapiWebhook({
        EventType: "chat_labels",
        chat: {
          phone: "+55 11 95301-6170",
          wa_chatid: "5511953016170@s.whatsapp.net",
          wa_isGroup: false,
          wa_label: ["554237420132:10"],
        },
      }),
    ).toMatchObject({
      eventType: "chat_labels",
      labelEventKind: "chat_labels",
      phone: "+55 11 95301-6170",
      waChatId: "5511953016170@s.whatsapp.net",
      isGroupChat: false,
      waLabelIds: ["554237420132:10"],
    });
  });

  it("does not treat ctwaPayload as ctwa_clid", () => {
    const parsed = parseUazapiWebhook({
      ctwaPayload: "internal_blob",
      message: { referral: { ctwaPayload: "nested_blob" } },
    });

    expect(parsed.ctwaClid).toBeUndefined();
  });

  it("extracts top-level ctwaClid", () => {
    const parsed = parseUazapiWebhook({ ctwaClid: "clid_top" });

    expect(parsed.ctwaClid).toBe("clid_top");
  });

  it("extracts ctwaClid from context referral", () => {
    const parsed = parseUazapiWebhook({
      context: { referral: { ctwaClid: "clid_context" } },
    });

    expect(parsed.ctwaClid).toBe("clid_context");
  });

  it("falls back to context referral CTWA clid when earlier referrals lack one", () => {
    const parsed = parseUazapiWebhook({
      referral: { ad_id: "ad_top" },
      message: { referral: { campaign_id: "cmp_message" } },
      context: { referral: { ctwa_clid: "clid_context" } },
    });

    expect(parsed.ctwaClid).toBe("clid_context");
    expect(parsed.adId).toBe("ad_top");
  });

  it("falls back to context referral CTWA source URL when earlier referrals lack one", () => {
    const parsed = parseUazapiWebhook({
      referral: { ad_id: "ad_top" },
      message: { referral: { campaign_id: "cmp_message" } },
      context: { referral: { source_url: "https://fb.com/context-ad" } },
    });

    expect(parsed.ctwaSourceUrl).toBe("https://fb.com/context-ad");
    expect(parsed.adId).toBe("ad_top");
  });

  it("extracts provider instance id from nested instance records", () => {
    expect(
      parseUazapiWebhook({ instance: { id: "instance_1" } }).providerInstanceId,
    ).toBe("instance_1");
    expect(
      parseUazapiWebhook({
        whatsappInstance: { providerInstanceId: "provider_instance_1" },
      }).providerInstanceId,
    ).toBe("provider_instance_1");
  });

  it("extracts message text from top-level fallbacks", () => {
    expect(parseUazapiWebhook({ text: "from text" }).messageText).toBe(
      "from text",
    );
    expect(parseUazapiWebhook({ body: "from body" }).messageText).toBe(
      "from body",
    );
    expect(
      parseUazapiWebhook({ messageText: "from messageText" }).messageText,
    ).toBe("from messageText");
  });

  it("extracts name, ctwaClid, adId and event id from current Uazapi message payload", () => {
    const parsed = parseUazapiWebhook(realInboundMessageWithCtwa);

    expect(parsed.contactName).toBe("Luciane");
    expect(parsed.ctwaClid).toBe(
      "AfjIU6RQYlpYayfNA2FofVXxkeliu6BysDwemrjwWsYkf-_ONOcY41s3dxRY7EUKC9ohLo6fgLcH6vg35S3k29Q5NoxEzOAgiIvcn6gCIvcEyaVoEno2XI36dwlCGvo",
    );
    expect(parsed.adId).toBe("120233998877665544");
    expect(parsed.ctwaSourceUrl).toBe("https://fb.me/current-uazapi-ad");
    expect(parsed.externalEventId).toBe("555481240263:3EB0REALMESSAGEID");
    expect(parsed.phone).toBe("555481241163");
    expect(parsed.isGroupChat).toBe(false);
    expect(parsed.messageText).toBe("Boa tarde");
  });

  it("does not invent ctwaClid when current message payload has no ad reply", () => {
    const parsed = parseUazapiWebhook(realInboundMessageWithoutCtwa);

    expect(parsed.contactName).toBe("Luciane");
    expect(parsed.ctwaClid).toBeUndefined();
    expect(parsed.adId).toBeUndefined();
    expect(parsed.externalEventId).toBe("555481240263:3EB0REALMESSAGEID");
  });

  it("extracts chat-update name, labels and phone without CTWA", () => {
    const parsed = parseUazapiWebhook(realChatUpdateEvent);

    expect(parsed.contactName).toBe("Elisandra Castro");
    expect(parsed.labels).toEqual(["555197120433:39"]);
    expect(parsed.phone).toBe("+55 51 8670-0577");
    expect(parsed.ctwaClid).toBeUndefined();
    expect(parsed.isGroupChat).toBe(false);
    expect(parsed.eventType).toBe("uazapi.webhook");
  });

  it("parses ReadReceipt without inventing lead fields", () => {
    const parsed = parseUazapiWebhook(realReadReceiptEvent);

    expect(parsed.eventType).toBe("ReadReceipt");
    expect(parsed.contactName).toBeUndefined();
    expect(parsed.ctwaClid).toBeUndefined();
    expect(parsed.labels).toEqual([]);
  });

  it("marks group chat from chat.wa_isGroup", () => {
    const parsed = parseUazapiWebhook(realGroupChatMessage);

    expect(parsed.isGroupChat).toBe(true);
    expect(parsed.contactName).toBe("Grupo Clinica");
  });

  it("falls back to message.chatid and chat.wa_chatid when chat.phone is absent", () => {
    expect(
      parseUazapiWebhook({
        message: { chatid: "555481241163@s.whatsapp.net" },
      }).phone,
    ).toBe("555481241163@s.whatsapp.net");
    expect(
      parseUazapiWebhook({
        chat: { wa_chatid: "555186700577@s.whatsapp.net" },
      }).phone,
    ).toBe("555186700577@s.whatsapp.net");
  });
});

const realInboundMessageWithCtwa = {
  chat: {
    id: "",
    name: "",
    phone: "555481241163",
    owner: "555481240263",
    wa_name: "Luciane",
    wa_label: [],
    wa_isGroup: false,
    wa_chatid: "555481241163@s.whatsapp.net",
    wa_chatlid: "271411952234508@lid",
    wa_unreadCount: 1,
    wa_lastMessageType: "ExtendedTextMessage",
    lead_name: "",
    lead_tags: [],
  },
  owner: "555481240263",
  message: {
    id: "555481240263:3EB0REALMESSAGEID",
    text: "Boa tarde",
    type: "text",
    fromMe: false,
    chatid: "555481241163@s.whatsapp.net",
    sender: "271411952234508@lid",
    chatlid: "271411952234508@lid",
    content: {
      text: "Boa tarde",
      title: "Livre-se da Dor, Sem Cirurgia! 🛑",
      contextInfo: {
        expiration: 86400,
        externalAdReply: {
          body: "Agende sua avaliacao",
          title: "Livre-se da Dor, Sem Cirurgia! 🛑",
          ctwaClid:
            "AfjIU6RQYlpYayfNA2FofVXxkeliu6BysDwemrjwWsYkf-_ONOcY41s3dxRY7EUKC9ohLo6fgLcH6vg35S3k29Q5NoxEzOAgiIvcn6gCIvcEyaVoEno2XI36dwlCGvo",
          sourceID: "120233998877665544",
          sourceUrl: "https://fb.me/current-uazapi-ad",
        },
      },
    },
  },
};

const realInboundMessageWithoutCtwa = {
  chat: {
    id: "",
    name: "",
    phone: "555481241163",
    owner: "555481240263",
    wa_name: "Luciane",
    wa_label: [],
    wa_isGroup: false,
    wa_chatid: "555481241163@s.whatsapp.net",
    wa_chatlid: "271411952234508@lid",
    lead_name: "",
    lead_tags: [],
  },
  owner: "555481240263",
  message: {
    id: "555481240263:3EB0REALMESSAGEID",
    text: "Boa tarde",
    type: "text",
    fromMe: false,
    chatid: "555481241163@s.whatsapp.net",
    sender: "271411952234508@lid",
    chatlid: "271411952234508@lid",
    content: {
      text: "Boa tarde",
    },
  },
};

const realChatUpdateEvent = {
  eventType: "uazapi.webhook",
  chat: {
    name: "Elisandra Castro",
    phone: "+55 51 8670-0577",
    wa_name: "",
    wa_label: ["555197120433:39"],
    wa_isGroup: false,
    wa_chatid: "555186700577@s.whatsapp.net",
  },
};

const realReadReceiptEvent = {
  type: "ReadReceipt",
  event: {
    Chat: "555481241163@s.whatsapp.net",
    Sender: "271411952234508@lid",
  },
};

const realGroupChatMessage = {
  chat: {
    name: "Grupo Clinica",
    phone: "555481241163-group",
    wa_name: "",
    wa_label: [],
    wa_isGroup: true,
    wa_chatid: "120363025812345678@g.us",
  },
  message: {
    id: "555481240263:3EB0GROUPMSG",
    text: "aviso do grupo",
    type: "text",
    fromMe: false,
    chatid: "120363025812345678@g.us",
  },
};
