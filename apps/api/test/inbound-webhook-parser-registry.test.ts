import { describe, expect, it } from "vitest";
import {
  InboundWebhookParserRegistry,
  InboundWebhookParserResolutionError,
} from "../src/inbound-webhooks/providers/inbound-webhook-parser.registry";
import { GupshupV1Parser } from "../src/inbound-webhooks/providers/gupshup/gupshup-v1.parser";
import { UmblerV1Parser } from "../src/inbound-webhooks/providers/umbler/umbler-v1.parser";

describe("inbound webhook parser registry", () => {
  it("resolves the registered parser by exact provider and parserVersion", () => {
    const registry = new InboundWebhookParserRegistry();
    const parser = registry.resolve({
      provider: "umbler",
      parserVersion: "v1",
    });

    expect(parser).toBeInstanceOf(UmblerV1Parser);
    expect(parser.provider).toBe("umbler");
    expect(parser.parserVersion).toBe("v1");
  });

  it("resolves the Gupshup observation parser without falling back to Umbler", () => {
    const registry = new InboundWebhookParserRegistry();
    const parser = registry.resolve({
      provider: "gupshup",
      parserVersion: "v1",
    });

    expect(parser).toBeInstanceOf(GupshupV1Parser);
    expect(parser.provider).toBe("gupshup");
    expect(parser.parserVersion).toBe("v1");
  });

  it("does not fall back for an unknown provider or parser version", () => {
    const registry = new InboundWebhookParserRegistry();

    for (const connection of [
      { provider: "unknown-provider", parserVersion: "v1" },
      { provider: "umbler", parserVersion: "v2" },
      { provider: "umbler", parserVersion: "v1 " },
    ]) {
      expect(() => registry.resolve(connection)).toThrow(
        InboundWebhookParserResolutionError,
      );

      try {
        registry.resolve(connection);
      } catch (error) {
        expect(error).toMatchObject({
          code: "inbound_webhook_parser_not_found",
        });
      }
    }
  });

  it("rejects a retired parser release even when its exact parser exists", () => {
    const registry = new InboundWebhookParserRegistry();

    expect(() =>
      registry.resolve({
        provider: "umbler",
        parserVersion: "v1",
        parserReleaseStatus: "retired",
      }),
    ).toThrow(InboundWebhookParserResolutionError);

    try {
      registry.resolve({
        provider: "umbler",
        parserVersion: "v1",
        parserReleaseStatus: "retired",
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: "inbound_webhook_parser_retired",
      });
    }
  });
});
