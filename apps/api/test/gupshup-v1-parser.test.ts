import { describe, expect, it } from "vitest";
import { GupshupV1Parser } from "../src/inbound-webhooks/providers/gupshup/gupshup-v1.parser";

describe("Gupshup v1 observation parser", () => {
  const parser = new GupshupV1Parser();

  it("catalogs the documented message envelope without materializing events", () => {
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
