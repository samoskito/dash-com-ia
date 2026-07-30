import { describe, expect, it } from "vitest";
import { auditGupshupPayload } from "../src/inbound-webhooks/providers/gupshup/gupshup-payload-audit";

describe("Gupshup retained payload audit", () => {
  it("finds the documented referral CTWA path without returning its value", () => {
    const secretCtwa = "Af-secret-click-id";
    const result = auditGupshupPayload({
      app: "democtwaapp",
      timestamp: 1_712_584_165_510,
      version: 2,
      type: "message",
      payload: {
        id: "wamid.observation",
        source: "5511999990000",
        type: "text",
        payload: { text: "private message" },
        referral: {
          source_type: "ad",
          source_id: "120000000000000",
          ctwa_clid: secretCtwa,
        },
      },
    });

    expect(result).toMatchObject({
      ctwaFieldPaths: ["$.payload.referral.ctwa_clid"],
      ctwaValuePaths: ["$.payload.referral.ctwa_clid"],
      ctwaLikeFieldPaths: [],
      referralPaths: ["$.payload.referral"],
      rootKeys: ["app", "payload", "timestamp", "type", "version"],
    });
    expect(result.payloadKeys).toEqual([
      "id",
      "payload",
      "referral",
      "source",
      "type",
    ]);
    expect(JSON.stringify(result)).not.toContain(secretCtwa);
    expect(JSON.stringify(result)).not.toContain("private message");
    expect(JSON.stringify(result)).not.toContain("5511999990000");
  });

  it("distinguishes an empty CTWA field from a usable click id", () => {
    const result = auditGupshupPayload({
      payload: {
        referral: {
          ctwa_clid: " ",
        },
      },
    });

    expect(result.ctwaFieldPaths).toEqual([
      "$.payload.referral.ctwa_clid",
    ]);
    expect(result.ctwaValuePaths).toEqual([]);
    expect(result.referralPaths).toEqual(["$.payload.referral"]);
  });

  it("catalogs unknown CTWA-like key variants for investigation", () => {
    const result = auditGupshupPayload({
      data: [{ metadata: { original_ctwa_reference: "opaque" } }],
    });

    expect(result.ctwaFieldPaths).toEqual([]);
    expect(result.ctwaValuePaths).toEqual([]);
    expect(result.ctwaLikeFieldPaths).toEqual([
      "$.data[0].metadata.original_ctwa_reference",
    ]);
  });

  it("caps traversal of unexpectedly large payloads", () => {
    const result = auditGupshupPayload(
      {
        payload: {
          first: { second: { third: "value" } },
        },
      },
      { maxDepth: 2 },
    );

    expect(result.truncated).toBe(true);
  });
});
