import { describe, expect, it } from "vitest";
import { buildInboundWebhookEventDedupeKey } from "../src/inbound-webhooks/providers/inbound-webhook-parser";
import {
  DataCrazyV1Parser,
  DATACRAZY_V1_PROVIDER,
} from "../src/inbound-webhooks/providers/datacrazy/datacrazy-v1.parser";

const parser = new DataCrazyV1Parser();

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "dc-message-001",
    received: true,
    createdAt: "2026-08-28T10:30:00.000Z",
    body: "Quero saber mais",
    contact: {
      id: "dc-contact-001",
      phoneNumber: "+55 (11) 99999-1234",
      name: "Ana Cliente",
    },
    instanceData: {
      organizationId: "dc-org-001",
      instanceId: "dc-instance-001",
      phoneNumber: "+55 (11) 98888-0000",
      name: "Comercial",
    },
    referral: {
      ctwa_clid: "ctwa-secret-001",
      source_id: "120000000000000001",
      source_url: "https://facebook.example/ad-secret",
      headline: "Oferta especial",
      thumbnail_url: "https://cdn.example/thumb-secret.jpg",
    },
    ...overrides,
  };
}

describe("Data Crazy v1 inbound webhook parser", () => {
  it("maps format A with a nested legacy message and keeps PII out of summaries", () => {
    const payload = {
      Telefone: "+55 11 99999-1234",
      Nome: "Ana Cliente",
      mensagem: JSON.stringify(message()),
    };

    const result = parser.parse(payload);
    const event = result.events[0]!;

    expect(result).toMatchObject({
      provider: "datacrazy",
      parserVersion: "v1",
      classification: "eligible_route_unresolved",
      error: null,
    });
    expect(event).toMatchObject({
      provider: "datacrazy",
      contact: { phoneNumber: "5511999991234", name: "Ana Cliente" },
      channel: {
        providerChannelId: "dc-instance-001",
        connectedPhone: "5511988880000",
      },
      message: {
        direction: "inbound",
        authorType: "contact",
        text: "Quero saber mais",
      },
      adId: "120000000000000001",
      ctwaClid: "ctwa-secret-001",
      ad: {
        sourceUrl: "https://facebook.example/ad-secret",
        title: "Oferta especial",
        thumbnailUrl: "https://cdn.example/thumb-secret.jpg",
      },
    });
    expect(event.dedupeKey).toBe(
      buildInboundWebhookEventDedupeKey({
        provider: DATACRAZY_V1_PROVIDER,
        organizationId: "dc-org-001",
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
      "Quero saber mais",
      "ctwa-secret-001",
      "facebook.example",
      "thumb-secret",
    ]) {
      expect(summaries).not.toContain(secret);
    }
  });

  it("maps format B at the root and format C with case-insensitive message fields", () => {
    const root = parser.parse(message());
    const nested = parser.parse({
      Nome: "Nome superior",
      Telefone: "+55 11 99999-1234",
      "JSON Produtos": message({ id: "dc-message-002", referral: undefined }),
    });

    expect(root.events[0]).toMatchObject({
      externalMessageId: "dc-message-001",
      classification: "eligible_route_unresolved",
    });
    expect(nested.events[0]).toMatchObject({
      externalMessageId: "dc-message-002",
      contact: { name: "Ana Cliente" },
      classification: "ignored_no_ctwa",
      classificationReason: "ctwa_missing",
    });
  });

  it("repairs literal newlines/tabs only inside nested JSON strings", () => {
    const malformed = JSON.stringify(
      message({ body: "linha um\nlinha dois\tfinal" }),
    )
      .replace("\\n", "\n")
      .replace("\\t", "\t");
    const result = parser.parse({ Mensagem: malformed });

    expect(result.events[0]?.message.text).toBe("linha um\nlinha dois\tfinal");
    expect(result.classification).toBe("eligible_route_unresolved");
  });

  it("uses balanced extraction and CTWA regex fallback when the nested template is malformed", () => {
    const balanced =
      '{"received":true,"id":"dc-message-balanced","createdAt":"2026-08-28T10:30:00.000Z","body":"Oi","contact":{"phoneNumber":"5511999991234"},"instanceData":{"organizationId":"dc-org-001","instanceId":"dc-instance-001","phoneNumber":"5511988880000"},"referral":{"ctwa_clid":"ctwa-balanced","source_id":"ad-balanced"}} trailing';
    const balancedResult = parser.parse({ mensagem: balanced });
    expect(balancedResult.events[0]).toMatchObject({
      externalMessageId: "dc-message-balanced",
      ctwaClid: "ctwa-balanced",
      adId: "ad-balanced",
    });

    const fallback =
      'broken template "ctwa_clid":"ctwa-regex", "source_id":"ad-regex", "source_url":"https://example.test/ad"';
    const fallbackResult = parser.parse({
      Telefone: "5511999991234",
      mensagem: fallback,
    });
    expect(fallbackResult).toMatchObject({
      classification: "invalid_payload",
      events: [],
      error: { code: "datacrazy_v1_invalid_payload" },
    });
  });

  it.each([
    ["missing instanceData", message({ instanceData: undefined })],
    [
      "missing organizationId",
      message({
        instanceData: {
          instanceId: "dc-instance-001",
          phoneNumber: "5511988880000",
        },
      }),
    ],
    [
      "missing providerChannelId",
      message({
        instanceData: {
          organizationId: "dc-org-001",
          phoneNumber: "5511988880000",
        },
      }),
    ],
    [
      "missing verified connected phone",
      message({
        instanceData: {
          organizationId: "dc-org-001",
          instanceId: "dc-instance-001",
          phoneNumber: "unknown",
        },
      }),
    ],
  ])("fails closed for %s without a routable event", (_scenario, payload) => {
    const result = parser.parse(payload);

    expect(result).toMatchObject({
      classification: "invalid_payload",
      events: [],
      error: { code: "datacrazy_v1_invalid_payload" },
    });
  });

  it("defaults message type only when absent or null and rejects present invalid types", () => {
    for (const payload of [
      message({ type: undefined }),
      message({ type: null }),
    ]) {
      expect(parser.parse(payload).events[0]?.message.messageType).toBe("text");
    }

    for (const type of [{}, 7, "   ", "x".repeat(121)]) {
      expect(parser.parse(message({ type }))).toMatchObject({
        classification: "invalid_payload",
        events: [],
        error: { code: "datacrazy_v1_invalid_payload" },
      });
    }
  });

  it("classifies received false and attendant fallback as outbound without enqueuing chat semantics", () => {
    const explicit = parser.parse(
      message({ id: "dc-outbound-001", received: false }),
    );
    const attendant = parser.parse(
      message({
        id: "dc-outbound-002",
        received: undefined,
        attendant: { id: "agent-1" },
      }),
    );

    for (const result of [explicit, attendant]) {
      expect(result).toMatchObject({
        classification: "ignored_outbound",
        events: [
          {
            message: {
              direction: "outbound",
              authorType: "organization_member",
            },
          },
        ],
      });
      expect(result.events[0]?.normalizedSummary).not.toHaveProperty("text");
    }
  });

  it("uses stable event identity for retries and rejects invalid or unsupported payloads without leaking values", () => {
    const first = parser.parse(message());
    const retry = parser.parse(
      message({ body: "Mudou o texto mas e a mesma mensagem" }),
    );
    expect(retry.events[0]?.dedupeKey).toBe(first.events[0]?.dedupeKey);

    const invalid = parser.parse({
      mensagem: { received: true, contact: { phoneNumber: "not-a-phone" } },
    });
    const unsupported = parser.parse({
      qualquerCoisa: "sem mensagem estruturada",
    });
    expect(invalid).toMatchObject({
      classification: "invalid_payload",
      events: [],
      error: { code: "datacrazy_v1_invalid_payload" },
    });
    expect(unsupported).toMatchObject({
      classification: "unsupported_event",
      events: [],
      error: null,
    });
    expect(JSON.stringify(invalid)).not.toContain("not-a-phone");
  });
});
