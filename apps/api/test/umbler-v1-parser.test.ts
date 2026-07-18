import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInboundWebhookEventDedupeKey } from "../src/inbound-webhooks/providers/inbound-webhook-parser";
import { UmblerV1Parser } from "../src/inbound-webhooks/providers/umbler/umbler-v1.parser";
import type { UmblerV1Envelope } from "../src/inbound-webhooks/providers/umbler/umbler-v1.types";

const fixturePath = resolve(
  __dirname,
  "fixtures",
  "umbler",
  "message-with-ctwa.json",
);

function loadFixture(): UmblerV1Envelope {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as UmblerV1Envelope;
}

describe("Umbler v1 inbound webhook parser", () => {
  const parser = new UmblerV1Parser();

  it("maps the sanitized live Message/Chat body to one canonical CTWA event", () => {
    const body = loadFixture();
    const result = parser.parse(body);
    const event = result.events[0];

    expect(result).toMatchObject({
      provider: "umbler",
      parserVersion: "v1",
      externalDeliveryId: body.EventId,
      providerEventType: "Message",
      classification: "eligible_route_unresolved",
      classificationReason: "route_resolution_pending",
      error: null,
    });
    expect(result.events).toHaveLength(1);
    expect(event).toMatchObject({
      provider: "umbler",
      externalEventId: body.EventId,
      externalMessageId: body.Payload.Content.LastMessage.Id,
      organizationId: body.Payload.Content.Organization.Id,
      occurredAt: new Date(
        body.Payload.Content.LastMessage.EventAtUTC as string,
      ),
      channel: {
        providerChannelId: body.Payload.Content.Channel.Id,
        connectedPhone: body.Payload.Content.Channel.PhoneNumber,
        name: body.Payload.Content.Channel.Name,
      },
      contact: {
        externalContactId: body.Payload.Content.Contact.Id,
        phoneNumber: body.Payload.Content.Contact.PhoneNumber,
        name: body.Payload.Content.Contact.Name,
      },
      adId: body.Payload.Content.LastMessage.Ad?.SourceId,
      ctwaClid: body.Payload.Content.LastMessage.Ad?.CTWaCLId,
      hasCtwa: true,
      classification: "eligible_route_unresolved",
    });
    expect(event?.dedupeKey).toBe(
      buildInboundWebhookEventDedupeKey({
        provider: "umbler",
        organizationId: body.Payload.Content.Organization.Id,
        providerChannelId: body.Payload.Content.Channel.Id,
        externalMessageId: body.Payload.Content.LastMessage.Id,
      }),
    );
    expect(body.Payload.Content.FirstContactMessage).toMatchObject({
      Id: body.Payload.Content.LastMessage.Id,
    });
  });

  it("keeps sensitive CTWA, message, phones and URLs out of persisted summaries", () => {
    const body = loadFixture();
    const result = parser.parse(body);
    const event = result.events[0]!;
    const summaries = JSON.stringify({
      delivery: result.normalizedSummary,
      events: result.events.map((item) => item.normalizedSummary),
    });

    expect(event.ctwaClid).toBe(body.Payload.Content.LastMessage.Ad?.CTWaCLId);
    expect(result.normalizedSummary).not.toHaveProperty("ctwaClid");
    expect(event.normalizedSummary).not.toHaveProperty("ctwaClid");
    expect(event.normalizedSummary.hasCtwa).toBe(true);

    for (const sensitiveValue of [
      body.Payload.Content.LastMessage.Ad?.CTWaCLId,
      body.Payload.Content.LastMessage.Content,
      body.Payload.Content.Contact.PhoneNumber,
      body.Payload.Content.Channel.PhoneNumber,
      body.Payload.Content.LastMessage.Ad?.SourceUrl,
      body.Payload.Content.LastMessage.Ad?.ThumbnailUrl,
      body.Payload.Content.LastMessage.Ad?.MediaUrl,
    ]) {
      expect(summaries).not.toContain(sensitiveValue);
    }
  });

  it("classifies an inbound message without CTWA as ignored_no_ctwa", () => {
    const body = loadFixture();

    delete body.Payload.Content.LastMessage.Ad?.CTWaCLId;

    const result = parser.parse(body);

    expect(result.classification).toBe("ignored_no_ctwa");
    expect(result.events[0]).toMatchObject({
      hasCtwa: false,
      ctwaClid: null,
      classification: "ignored_no_ctwa",
      classificationReason: "ctwa_missing",
    });
  });

  it("classifies organization-member and private messages explicitly", () => {
    const outbound = loadFixture();
    outbound.Payload.Content.LastMessage.Source = "OrganizationMember";
    outbound.Payload.Content.LastMessage.SentByOrganizationMember = {
      Id: "member_variant_001",
    };

    const privateNote = loadFixture();
    privateNote.Payload.Content.LastMessage.IsPrivate = true;

    expect(parser.parse(outbound)).toMatchObject({
      classification: "ignored_outbound",
      events: [
        {
          classification: "ignored_outbound",
          classificationReason: "message_not_from_contact",
        },
      ],
    });
    expect(parser.parse(privateNote)).toMatchObject({
      classification: "ignored_private",
      events: [
        {
          classification: "ignored_private",
          classificationReason: "private_message",
        },
      ],
    });
  });

  it("classifies unsupported event types without emitting a canonical event", () => {
    const body = loadFixture();
    body.Type = "ContactUpdated";

    expect(parser.parse(body)).toMatchObject({
      externalDeliveryId: body.EventId,
      providerEventType: "ContactUpdated",
      classification: "unsupported_event",
      classificationReason: "event_type_unsupported",
      events: [],
      error: null,
    });
  });

  it("returns a value-safe invalid_payload error for malformed messages", () => {
    const body = loadFixture();
    const sensitiveMalformedValue = "payload_secret_that_must_not_leak";

    (
      body.Payload.Content.LastMessage as unknown as {
        Id: unknown;
      }
    ).Id = { sensitiveMalformedValue };

    const result = parser.parse(body);

    expect(result).toMatchObject({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
      events: [],
      error: {
        code: "umbler_v1_invalid_payload",
        message: "Inbound webhook payload failed validation",
      },
    });
    expect(JSON.stringify(result.error)).not.toContain(sensitiveMalformedValue);
  });

  it("uses the message timestamp before EventDate and falls back when absent", () => {
    const body = loadFixture();
    const messageTimestamp = body.Payload.Content.LastMessage.EventAtUTC;

    expect(parser.parse(body).events[0]?.occurredAt.toISOString()).toBe(
      new Date(messageTimestamp as string).toISOString(),
    );

    body.Payload.Content.LastMessage.EventAtUTC = null;

    expect(parser.parse(body).events[0]?.occurredAt.toISOString()).toBe(
      new Date(body.EventDate).toISOString(),
    );
  });

  it("deduplicates by stable organization, channel ID and message ID", () => {
    const original = loadFixture();
    const repeatedDelivery = loadFixture();
    repeatedDelivery.EventId = "delivery_fixture_retry_002";

    const changedChannelMetadata = loadFixture();
    changedChannelMetadata.Payload.Content.Channel.Name =
      "Renamed Synthetic Channel";
    changedChannelMetadata.Payload.Content.Channel.PhoneNumber = "+15550003333";

    const changedOrganization = loadFixture();
    changedOrganization.Payload.Content.Organization.Id =
      "org_fixture_variant_002";

    const changedChannelId = loadFixture();
    changedChannelId.Payload.Content.Channel.Id = "channel_fixture_variant_002";

    const changedMessageId = loadFixture();
    changedMessageId.Payload.Content.LastMessage.Id =
      "message_fixture_variant_002";

    const first = parser.parse(original).events[0]!;
    const repeated = parser.parse(repeatedDelivery).events[0]!;
    const changed = parser.parse(changedChannelMetadata).events[0]!;
    const otherOrganization = parser.parse(changedOrganization).events[0]!;
    const otherChannel = parser.parse(changedChannelId).events[0]!;
    const otherMessage = parser.parse(changedMessageId).events[0]!;

    expect(repeated.externalEventId).not.toBe(first.externalEventId);
    expect(repeated.externalMessageId).toBe(first.externalMessageId);
    expect(repeated.dedupeKey).toBe(first.dedupeKey);
    expect(changed.dedupeKey).toBe(first.dedupeKey);
    expect(otherOrganization.dedupeKey).not.toBe(first.dedupeKey);
    expect(otherChannel.dedupeKey).not.toBe(first.dedupeKey);
    expect(otherMessage.dedupeKey).not.toBe(first.dedupeKey);
    expect(changed.channel).toMatchObject({
      providerChannelId: original.Payload.Content.Channel.Id,
      connectedPhone: "+15550003333",
      name: "Renamed Synthetic Channel",
    });
  });
});
