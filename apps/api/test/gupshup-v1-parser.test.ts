import { describe, expect, it } from "vitest";
import { GupshupV1Parser } from "../src/inbound-webhooks/providers/gupshup/gupshup-v1.parser";

function cloudMessagePayload(
  messageOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    gs_app_id: "gupshup-app-1",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+55 21 99999-0000",
                phone_number_id: "phone-number-id-1",
              },
              contacts: [
                {
                  profile: {
                    name: "Contato de teste",
                  },
                  wa_id: "5521988887777",
                },
              ],
              messages: [
                {
                  from: "5521988887777",
                  id: "wamid.gupshup-cloud-1",
                  timestamp: "1785373200",
                  type: "text",
                  text: {
                    body: "Mensagem privada que nao pode vazar no resumo",
                  },
                  referral: {
                    source_url: "https://fb.me/ad",
                    source_id: "120000000000000001",
                    source_type: "ad",
                    headline: "Titulo do anuncio",
                    body: "Descricao do anuncio",
                    image_url: "https://cdn.example.com/ad.jpg",
                    ctwa_clid: "ctwa-secret-value",
                  },
                  ...messageOverrides,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("Gupshup v1 parser", () => {
  const parser = new GupshupV1Parser();

  it("parses the observed Cloud envelope and recognizes a CTWA message", () => {
    const result = parser.parse(cloudMessagePayload());

    expect(result).toMatchObject({
      provider: "gupshup",
      parserVersion: "v1",
      externalDeliveryId: "wamid.gupshup-cloud-1",
      providerEventType: "messages",
      classification: "eligible_route_unresolved",
      classificationReason: "route_resolution_pending",
      error: null,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      provider: "gupshup",
      providerEventType: "messages",
      externalEventId: "wamid.gupshup-cloud-1",
      externalMessageId: "wamid.gupshup-cloud-1",
      organizationId: "gupshup-app-1",
      occurredAt: new Date("2026-07-30T01:00:00.000Z"),
      channel: {
        providerChannelId: "phone-number-id-1",
        connectedPhone: "+55 21 99999-0000",
        name: null,
      },
      contact: {
        externalContactId: "5521988887777",
        phoneNumber: "5521988887777",
        name: "Contato de teste",
      },
      message: {
        direction: "inbound",
        authorType: "contact",
        messageType: "text",
        isPrivate: false,
      },
      adId: "120000000000000001",
      ad: {
        sourceUrl: "https://fb.me/ad",
        description: "Descricao do anuncio",
        title: "Titulo do anuncio",
        thumbnailUrl: null,
        mediaUrl: "https://cdn.example.com/ad.jpg",
        sourceType: "ad",
      },
      ctwaClid: "ctwa-secret-value",
      hasCtwa: true,
      classification: "eligible_route_unresolved",
      classificationReason: "route_resolution_pending",
    });
    expect(result.events[0]?.dedupeKey).toMatch(/^sha256:[a-f0-9]{64}$/u);

    const summaries = JSON.stringify({
      delivery: result.normalizedSummary,
      event: result.events[0]?.normalizedSummary,
    });

    expect(summaries).not.toContain("Mensagem privada");
    expect(summaries).not.toContain("ctwa-secret-value");
    expect(summaries).not.toContain("5521988887777");
    expect(summaries).not.toContain("https://fb.me/ad");
  });

  it("keeps a referral without ctwa_clid outside the routable funnel", () => {
    const payload = cloudMessagePayload({
      referral: {
        source_url: "https://fb.me/ad",
        source_id: "120000000000000001",
        source_type: "ad",
        headline: "Titulo do anuncio",
        body: "Descricao do anuncio",
      },
    });
    const result = parser.parse(payload);

    expect(result).toMatchObject({
      classification: "ignored_no_ctwa",
      classificationReason: "ctwa_missing",
      providerEventType: "messages",
      error: null,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      adId: "120000000000000001",
      ctwaClid: null,
      hasCtwa: false,
      classification: "ignored_no_ctwa",
      classificationReason: "ctwa_missing",
    });
  });

  it("does not turn status notifications into message events", () => {
    const result = parser.parse({
      object: "whatsapp_business_account",
      gs_app_id: "gupshup-app-1",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "+55 21 99999-0000",
                  phone_number_id: "phone-number-id-1",
                },
                statuses: [
                  {
                    id: "wamid.status-1",
                    status: "delivered",
                    timestamp: "1785373200",
                    recipient_id: "5521988887777",
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      providerEventType: "messages",
      externalDeliveryId: null,
      classification: "unsupported_event",
      classificationReason: "message_event_not_found",
      events: [],
      error: null,
    });
  });

  it("fails closed when a message in the observed envelope is malformed", () => {
    const result = parser.parse(
      cloudMessagePayload({
        from: "telefone-invalido",
      }),
    );

    expect(result).toMatchObject({
      providerEventType: "messages",
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
      events: [],
      error: {
        code: "gupshup_v1_invalid_payload",
      },
    });
  });

  it("keeps the older documented wrapper in observation", () => {
    const result = parser.parse({
      app: "client-app",
      timestamp: 1_721_111_222_333,
      version: 2,
      type: "message",
      payload: {
        id: "wamid.gupshup-observation-1",
        source: "5511999990000",
        type: "text",
        payload: {
          text: "Mensagem privada que nao pode vazar no resumo",
        },
      },
    });

    expect(result).toMatchObject({
      provider: "gupshup",
      parserVersion: "v1",
      externalDeliveryId: "wamid.gupshup-observation-1",
      providerEventType: "message",
      classification: "unsupported_event",
      classificationReason: "gupshup_observation_only",
      events: [],
      error: null,
    });
    expect(JSON.stringify(result.normalizedSummary)).not.toContain(
      "Mensagem privada",
    );
  });

  it("retains unknown JSON shapes as unsupported observation data", () => {
    const result = parser.parse(["unknown", { secret: "private" }]);

    expect(result).toMatchObject({
      externalDeliveryId: null,
      providerEventType: null,
      classification: "unsupported_event",
      events: [],
      error: null,
    });
    expect(JSON.stringify(result.normalizedSummary)).not.toContain("private");
  });
});
