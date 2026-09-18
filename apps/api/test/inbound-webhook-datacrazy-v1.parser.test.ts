import { describe, expect, it } from "vitest";
import { buildInboundWebhookEventDedupeKey } from "../src/inbound-webhooks/providers/inbound-webhook-parser";
import {
  DataCrazyV1Parser,
  DATACRAZY_V1_PROVIDER,
} from "../src/inbound-webhooks/providers/datacrazy/datacrazy-v1.parser";

const parser = new DataCrazyV1Parser();
const context = { organizationId: "workspace_001" };

type EnvelopeOptions = {
  leadId?: string;
  body?: Record<string, unknown>;
  mensagem?: Record<string, unknown>;
};

function realEnvelope(options: EnvelopeOptions = {}) {
  const mensagem = {
    id: "message-wrapper-001",
    from: "551199991234",
    text: "Quero saber mais",
    timestamp: "2026-08-28T10:30:00.000Z",
    type: "text",
    referral: {
      ctwa_clid: "ctwa-secret-001",
      source_id: "120000000000000001",
      source_url: "https://facebook.example/ad-secret",
      source_type: "ad",
      video_url: "https://cdn.example/video-secret.mp4",
      thumbnail_url: "https://cdn.example/thumb-secret.jpg",
      headline: "Oferta especial",
      body: "Confira a oferta",
    },
    messageData: {
      id: "dc-message-001",
      date: "2026-08-28T10:30:00.000Z",
      text: "Quero saber mais",
      contact: {
        id: "dc-contact-001",
        contactId: "contact-id-not-used-as-identity",
        phoneNumber: "551199991234",
        name: "Ana Cliente",
      },
      conversationId: "conversation-001",
      attachments: [],
      hasAttachments: false,
    },
    instanceData: {
      id: "dc-instance-001",
      name: "Comercial",
    },
    ...options.mensagem,
  };
  const body = {
    nome: "Ana Cliente",
    cidade: "Sao Paulo",
    estado: "SP",
    telefone: "5511999991234",
    sourceID: "", // Intentionally ignored: CTWA only comes from referral.
    sourceURL: "",
    ctwaClid: "",
    mensagem: JSON.stringify(mensagem),
    ...options.body,
  };

  return [
    {
      leadId: options.leadId ?? "lead-external-001",
      body: JSON.stringify(body),
    },
  ];
}

function directLead(options: EnvelopeOptions = {}) {
  const [envelope] = realEnvelope(options);
  return {
    leadId: envelope.leadId,
    ...JSON.parse(envelope.body),
  };
}

describe("Data Crazy v1 inbound webhook parser", () => {
  it("parses the real array > body > mensagem envelope and keeps sensitive values out of summaries", () => {
    const result = parser.parse(realEnvelope(), context);
    const event = result.events[0]!;

    expect(result).toMatchObject({
      provider: "datacrazy",
      parserVersion: "v1",
      classification: "eligible_route_unresolved",
      error: null,
    });
    expect(event).toMatchObject({
      externalMessageId: "dc-message-001",
      organizationId: "workspace_001",
      contact: {
        externalContactId: "lead-external-001",
        phoneNumber: "551199991234",
      },
      channel: {
        providerChannelId: "dc-instance-001",
        connectedPhone: "5511999991234",
        name: "Comercial",
      },
      ctwaClid: "ctwa-secret-001",
      adId: "120000000000000001",
      hasCtwa: true,
      normalizedSummary: { phoneDivergenceDetected: true },
    });
    expect(event.dedupeKey).toBe(
      buildInboundWebhookEventDedupeKey({
        provider: DATACRAZY_V1_PROVIDER,
        organizationId: "workspace_001",
        providerChannelId: "dc-instance-001",
        externalMessageId: "dc-message-001",
      }),
    );
    const summaries = JSON.stringify({
      delivery: result.normalizedSummary,
      event: event.normalizedSummary,
    });
    for (const secret of [
      "Ana Cliente",
      "5511999991234",
      "551199991234",
      "Quero saber mais",
      "ctwa-secret-001",
      "facebook.example",
      "thumb-secret",
    ]) {
      expect(summaries).not.toContain(secret);
    }
  });

  it("uses referral.ctwa_clid exclusively and audits non-CTWA messages without ad attribution", () => {
    const result = parser.parse(
      realEnvelope({
        mensagem: { referral: undefined },
        body: {
          sourceID: "body-source-must-not-count",
          sourceURL: "https://body.example/ignored",
          ctwaClid: "body-ctwa-must-not-count",
        },
      }),
      context,
    );

    expect(result).toMatchObject({
      classification: "ignored_no_ctwa",
      events: [
        {
          hasCtwa: false,
          ctwaClid: null,
          adId: null,
          ad: null,
          classificationReason: "ctwa_missing",
        },
      ],
    });
  });

  it("parses a direct Data Crazy lead object", () => {
    const result = parser.parse(directLead(), context);

    expect(result).toMatchObject({
      classification: "eligible_route_unresolved",
      externalDeliveryId: "dc-message-001",
      events: [
        {
          contact: { externalContactId: "lead-external-001" },
          channel: { connectedPhone: "5511999991234" },
          ctwaClid: "ctwa-secret-001",
        },
      ],
    });
  });

  it("parses a live-shaped direct lead with accented fields and an audio mensagem", () => {
    const result = parser.parse(
      directLead({
        leadId: "lead-sanitized-live-001",
        body: {
          nome: "Luiz Sérgio Exemplo",
          telefone: "5511999000000",
          sourceURL: "https://facebook.example/lookaside/sanitized",
        },
        mensagem: {
          from: "5511999000001",
          type: "audio",
          messageData: {
            id: "dc-audio-sanitized-001",
            date: "2026-09-14T19:17:00.000Z",
            contact: {
              phoneNumber: "5511999000001",
              name: "Luiz Sérgio Exemplo",
            },
            attachments: [{ type: "audio", url: "https://cdn.example/audio" }],
          },
          instanceData: { id: "dc-instance-001", name: "Ageu Produtor" },
        },
      }),
      context,
    );

    expect(result).toMatchObject({
      classification: "eligible_route_unresolved",
      externalDeliveryId: "dc-audio-sanitized-001",
      events: [
        {
          contact: { externalContactId: "lead-sanitized-live-001" },
          channel: {
            name: "Ageu Produtor",
            connectedPhone: "5511999000000",
          },
          externalMessageId: "dc-audio-sanitized-001",
        },
      ],
    });
  });

  it("audits a direct lead without referral CTWA metadata", () => {
    const result = parser.parse(
      directLead({
        mensagem: { referral: undefined },
        body: { ctwaClid: "top-level-ctwa-is-ignored" },
      }),
      context,
    );

    expect(result).toMatchObject({
      classification: "ignored_no_ctwa",
      events: [
        {
          hasCtwa: false,
          ctwaClid: null,
          adId: null,
          classificationReason: "ctwa_missing",
        },
      ],
    });
  });

  it("parses an array of direct Data Crazy leads", () => {
    const result = parser.parse(
      [directLead(), directLead({ leadId: "lead-external-002" })],
      context,
    );

    expect(result.normalizedSummary.eventCount).toBe(2);
  });

  it("requires workspace context and never trusts payload organization fields", () => {
    const payload = directLead({
      mensagem: {
        organizationId: "payload-org",
        instanceData: {
          id: "dc-instance-001",
          name: "Comercial",
          organizationId: "payload-instance-org",
        },
      },
    });

    expect(parser.parse(payload)).toMatchObject({
      classification: "invalid_payload",
      events: [],
      error: { code: "datacrazy_v1_invalid_payload" },
    });
    const contextualResult = parser.parse(payload, context);
    expect(contextualResult.events[0]?.organizationId).toBe("workspace_001");
    expect(
      contextualResult.events.find(
        (event) => event.dedupeKey === contextualResult.events[0]?.dedupeKey,
      ),
    ).toMatchObject({ externalMessageId: "dc-message-001" });
  });

  it("uses messageData.id for event identity and leadId only as external contact identity", () => {
    const first = parser.parse(realEnvelope(), context);
    const retry = parser.parse(
      realEnvelope({
        leadId: "lead-external-001",
        mensagem: {
          messageData: {
            id: "dc-message-001",
            date: "2026-08-28T10:30:00.000Z",
            text: "Texto alterado sem alterar a mensagem",
            contact: { phoneNumber: "551199991234" },
          },
        },
      }),
      context,
    );

    expect(retry.events[0]?.externalMessageId).toBe("dc-message-001");
    expect(retry.events[0]?.contact.externalContactId).toBe(
      "lead-external-001",
    );
    expect(retry.events[0]?.contact.externalContactId).not.toBe(
      retry.events[0]?.contact.phoneNumber,
    );
    expect(retry.events[0]?.dedupeKey).toBe(first.events[0]?.dedupeKey);
  });

  it("emits every item in a valid batch", () => {
    const first = realEnvelope()[0]!;
    const second = realEnvelope({
      leadId: "lead-external-002",
      mensagem: {
        messageData: {
          id: "dc-message-002",
          date: "2026-08-28T10:31:00.000Z",
          text: "Segunda mensagem",
          contact: { phoneNumber: "551199991234" },
        },
        referral: undefined,
      },
    })[0]!;
    const result = parser.parse([first, second], context);

    expect(result).toMatchObject({
      classification: "eligible_route_unresolved",
      externalDeliveryId: null,
      normalizedSummary: { eventCount: 2 },
    });
    expect(result.events.map((event) => event.externalMessageId)).toEqual([
      "dc-message-001",
      "dc-message-002",
    ]);
    expect(result.events[1]?.classification).toBe("ignored_no_ctwa");
  });

  it.each([
    ["empty batch", []],
    ["legacy root messageData regression", { messageData: {} }],
  ])("fails closed for %s", (_scenario, payload) => {
    const result = parser.parse(payload, context);

    expect(result.events).toEqual([]);
    expect(result.error).toBeNull();
    expect(result.classification).toBe("unsupported_event");
  });

  it("marks malformed nested JSON as invalid payload", () => {
    for (const payload of [
      [{ leadId: "lead-001", body: "not-json" }],
      [
        {
          leadId: "lead-001",
          body: JSON.stringify({ telefone: "5511999991234", mensagem: "{" }),
        },
      ],
    ]) {
      expect(parser.parse(payload, context)).toMatchObject({
        classification: "invalid_payload",
        events: [],
        error: { code: "datacrazy_v1_invalid_payload" },
      });
    }
  });
});
