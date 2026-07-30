import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ExternalChannelBillingAccessError } from "../src/billing/external-channel-billing-access.service";
import { InboundWebhookProductionService } from "../src/inbound-webhook-production/inbound-webhook-production.service";
import { InboundWebhookParserRegistry } from "../src/inbound-webhooks/providers/inbound-webhook-parser.registry";

const workspaceId = "workspace_1";
const connectionId = "connection_1";
const fixturePath = resolve(
  __dirname,
  "fixtures",
  "umbler",
  "message-with-ctwa.json",
);
const rawPayload = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
const gupshupPayload = {
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
                profile: { name: "Contato Gupshup" },
                wa_id: "5521988887777",
              },
            ],
            messages: [
              {
                from: "5521988887777",
                id: "wamid.gupshup-production-1",
                timestamp: "1785373200",
                type: "text",
                text: { body: "Mensagem privada" },
                referral: {
                  source_url: "https://fb.me/ad",
                  source_id: "120000000000000001",
                  source_type: "ad",
                  headline: "Titulo do anuncio",
                  body: "Descricao do anuncio",
                  image_url: "https://cdn.example.com/ad.jpg",
                  ctwa_clid: "ctwa-secret-value",
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

function createHarness(
  input: {
    channelStatus?: "active" | "paused";
    provider?: "umbler" | "gupshup";
  } = {},
) {
  const provider = input.provider ?? "umbler";
  const providerPayload = provider === "gupshup" ? gupshupPayload : rawPayload;
  const parserRegistry = new InboundWebhookParserRegistry();
  const parser = parserRegistry.resolve({
    provider,
    parserVersion: "v1",
    parserReleaseStatus: "certified",
  });
  const parsed = parser.parse(providerPayload).events[0]!;
  const activatedAt = new Date("2026-07-21T12:00:00.000Z");
  const firstReceivedAt = new Date("2026-07-21T12:00:01.000Z");
  const item = {
    id: "production_item_1",
    workspaceId,
    eventId: "inbound_event_1",
    status: "queued",
    errorCode: null,
    attemptCount: 0,
    event: {
      id: "inbound_event_1",
      workspaceId,
      provider,
      classification: "eligible_route_resolved",
      hasCtwa: true,
      adId: parsed.adId,
      externalMessageId: parsed.externalMessageId,
      dedupeKey: parsed.dedupeKey,
      occurredAt: parsed.occurredAt,
      channelId: "channel_1",
      resolvedBusinessConnectionId: "business_1",
      resolvedReportingAccountId: "reporting_1",
      resolvedConversionDestinationId: "destination_1",
      delivery: {
        id: "delivery_1",
        workspaceId,
        connectionId,
        parserVersion: "v1",
        firstReceivedAt,
        payloadExpiresAt: new Date("2099-07-21T12:00:00.000Z"),
        encryptedPayload: "ciphertext",
        payloadIv: "iv",
        payloadTag: "tag",
        encryptionKeyVersion: 1,
      },
      connection: {
        id: connectionId,
        provider,
        status: "production",
        removedAt: null,
        productionActivatedAt: activatedAt,
        parserRelease: {
          version: "v1",
          status: "certified",
        },
      },
      channel: {
        status: input.channelStatus ?? "active",
        productionActivatedAt: activatedAt,
        routes: [
          {
            metaBusinessConnectionId: "business_1",
            metaReportingAccountId: "reporting_1",
            metaConversionDestinationId: "destination_1",
          },
        ],
      },
      resolvedBusinessConnection: {
        id: "business_1",
        status: "active",
        credential: { status: "active" },
      },
      resolvedReportingAccount: {
        id: "reporting_1",
        active: true,
        businessConnectionId: "business_1",
        adAccountId: "act_1",
      },
      resolvedConversionDestination: {
        id: "destination_1",
        status: "configured",
      },
    },
  };
  const updateItem = vi.fn(async ({ data }) => {
    if (typeof data.attemptCount === "object") {
      item.attemptCount += data.attemptCount.increment;
    }

    Object.assign(item, {
      ...data,
      attemptCount: item.attemptCount,
    });
    return item;
  });
  const prisma = {
    inboundWebhookProductionItem: {
      findFirst: vi.fn(async () => item),
      update: updateItem,
    },
    metaAd: {
      findFirst: vi.fn(async () => ({
        campaignId: "campaign_1",
        adSetId: "adset_1",
        adAccountId: "act_1",
      })),
    },
  };
  const payloadEncryption = {
    decrypt: vi.fn(() => Buffer.from(JSON.stringify(providerPayload), "utf8")),
  };
  const leads = {
    upsertFromWhatsappWebhook: vi.fn(async () => ({ id: "lead_1" })),
  };
  const conversions = {
    recordExternalConversion: vi.fn(async () => ({
      conversionEventLogId: "conversion_1",
      status: "created",
      deliveryStatus: "ready_to_send",
    })),
  };
  const conversionQueue = {
    enqueueSend: vi.fn(async () => ({ status: "queued" })),
  };
  const billingAccess = {
    assertProductionAccess: vi.fn(async () => undefined),
  };
  const service = new InboundWebhookProductionService(
    prisma as never,
    payloadEncryption as never,
    parserRegistry,
    leads as never,
    conversions as never,
    conversionQueue as never,
    billingAccess as never,
    {
      NODE_ENV: "test",
      API_PUBLIC_URL: "http://localhost:3333",
      INBOUND_WEBHOOKS_ENABLED: "true",
      INBOUND_WEBHOOK_PRODUCTION_ENABLED: "true",
      INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
    },
  );

  return {
    conversionQueue,
    conversions,
    billingAccess,
    item,
    leads,
    parsed,
    service,
    updateItem,
  };
}

describe("inbound webhook production service", () => {
  it("materializes and queues a live Umbler lead exactly once", async () => {
    const harness = createHarness();

    expect(
      await harness.service.processItem({
        productionItemId: harness.item.id,
        workspaceId,
      }),
    ).toEqual({ status: "materialized" });
    expect(
      await harness.service.processItem({
        productionItemId: harness.item.id,
        workspaceId,
      }),
    ).toEqual({ status: "unchanged" });

    expect(harness.leads.upsertFromWhatsappWebhook).toHaveBeenCalledOnce();
    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledOnce();
    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        sourceTrigger: "inbound_webhook:umbler",
        eventName: "LeadSubmitted",
        adId: harness.parsed.adId,
        ctwaClid: harness.parsed.ctwaClid,
        metaBusinessConnectionId: "business_1",
        metaConversionDestinationId: "destination_1",
        sourcePayload: expect.objectContaining({
          processingMode: "live_production",
        }),
      }),
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledOnce();
    expect(harness.item.status).toBe("materialized");
  });

  it("materializes and queues a live Gupshup lead with provider-specific audit data", async () => {
    const harness = createHarness({ provider: "gupshup" });

    await expect(
      harness.service.processItem({
        productionItemId: harness.item.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.leads.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        source: "gupshup",
        adId: harness.parsed.adId,
        ctwaClid: harness.parsed.ctwaClid,
      }),
    );
    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        sourceTrigger: "inbound_webhook:gupshup",
        eventId: expect.stringMatching(/^gupshup_lead_[a-f0-9]{64}$/u),
        sourcePayload: expect.objectContaining({
          provider: "gupshup",
          processingMode: "live_production",
        }),
      }),
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledOnce();
  });

  it("rejects a paused channel before creating a lead or conversion", async () => {
    const harness = createHarness({ channelStatus: "paused" });

    await expect(
      harness.service.processItem({
        productionItemId: harness.item.id,
        workspaceId,
      }),
    ).rejects.toThrow("Inbound webhook production item failed");

    expect(harness.item).toMatchObject({
      status: "failed",
      errorCode: "inbound_webhook_production_context_changed",
    });
    expect(harness.leads.upsertFromWhatsappWebhook).not.toHaveBeenCalled();
    expect(harness.conversions.recordExternalConversion).not.toHaveBeenCalled();
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
  });

  it("preserves the item without creating side effects when billing access is suspended", async () => {
    const harness = createHarness();
    harness.billingAccess.assertProductionAccess.mockRejectedValueOnce(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      ),
    );

    await expect(
      harness.service.processItem({
        productionItemId: harness.item.id,
        workspaceId,
      }),
    ).rejects.toThrow("Inbound webhook production item failed");

    expect(harness.item).toMatchObject({
      status: "failed",
      errorCode: "external_channel_billing_seat_inactive",
    });
    expect(harness.leads.upsertFromWhatsappWebhook).not.toHaveBeenCalled();
    expect(harness.conversions.recordExternalConversion).not.toHaveBeenCalled();
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
  });
});
