import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProviderConversionTracePage from "../src/app/(backoffice)/backoffice/inbound-webhooks/conversions/page";

const operationsScope = {
  workspaces: [
    {
      id: "workspace_1",
      name: "Cliente Teste",
      connections: [
        {
          id: "connection_1",
          displayName: "Umbler Comercial",
          provider: "umbler",
          status: "production",
          lastDeliveryAt: "2026-07-23T13:36:40.000Z",
          channels: [
            {
              id: "channel_1",
              displayName: "Comercial",
              connectedPhone: "+5511999999999",
              status: "active",
              lastSeenAt: "2026-07-23T13:36:40.000Z",
            },
          ],
        },
      ],
    },
  ],
};

const traceItem = {
  decisionId: "decision_1",
  decisionVersion: 2,
  occurrenceKey: "occurrence_1",
  occurredAt: "2026-07-23T13:36:35.000Z",
  createdAt: "2026-07-23T13:36:36.000Z",
  workspace: {
    id: "workspace_1",
    name: "Cliente Teste",
  },
  connection: {
    id: "connection_1",
    name: "Umbler Comercial",
    provider: "umbler",
  },
  channel: {
    id: "channel_1",
    name: "Comercial",
    connectedPhone: "+5511999999999",
  },
  rule: {
    id: "rule_1",
    name: "Compra confirmada",
    eventName: "Purchase",
    mode: "production",
  },
  decision: {
    code: "eligible",
    reasonCode: "catalog_combination_matched",
    engineVersion: "canonical-v1",
    parserVersion: "umbler-v1",
    valueCents: 359700,
    currency: "BRL",
  },
  delivery: {
    id: "delivery_1",
    purpose: "message_observation",
    status: "processed",
    classification: "eligible_route_resolved",
    firstReceivedAt: "2026-07-23T13:36:39.000Z",
    lastReceivedAt: "2026-07-23T13:36:40.000Z",
    payloadAvailable: true,
    payloadExpiresAt: "2026-07-30T13:36:40.000Z",
  },
  review: null,
  execution: {
    id: "execution_1",
    status: "failed",
    reasonCode: "MetaCapiNetworkError",
    conversionEventLogId: "meta_log_1",
    attemptCount: 1,
    lastAttemptedAt: "2026-07-23T13:37:00.000Z",
    processedAt: "2026-07-23T13:37:01.000Z",
  },
  meta: {
    id: "meta_log_1",
    status: "error",
    eventName: "Purchase",
    sentAt: null,
    pixelId: "pixel_1",
    pageId: "page_1",
    eventId: "event_1",
    errorCode: "MetaCapiNetworkError",
    errorMessage: "Network request failed",
    requestPayload: null,
    responseSummary: {
      error: "timeout",
    },
  },
  state: "failed_retryable",
  retryable: true,
  reevaluable: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider conversion trace route", () => {
  it("renders one filtered operational truth with payload, Meta audit and safe retry", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          items: [traceItem],
          total: 1,
          summary: {
            all: 1,
            internalOutcome: 0,
            reviewRequired: 0,
            observed: 0,
            queued: 0,
            sent: 0,
            duplicate: 0,
            blockedConfiguration: 0,
            failedRetryable: 1,
            failedPermanent: 0,
          },
          facets: {
            rules: [
              {
                id: "rule_1",
                name: "Compra confirmada",
                eventName: "Purchase",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(operationsScope));

    const element = await ProviderConversionTracePage({
      searchParams: Promise.resolve({
        workspaceId: "workspace_1",
        connectionId: "connection_1",
        channelId: "channel_1",
        providerRuleId: "rule_1",
        eventName: "Purchase",
        decisionCode: "eligible",
        state: "failed_retryable",
        receivedFrom: "2026-07-23T10:36",
        receivedUntil: "2026-07-23T10:36",
      }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/conversion-traces?workspaceId=workspace_1&connectionId=connection_1&channelId=channel_1&providerRuleId=rule_1&eventName=Purchase&decisionCode=eligible&state=failed_retryable&receivedFrom=2026-07-23T10%3A36&receivedUntil=2026-07-23T10%3A36&limit=50&offset=0",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(html).toContain("Auditoria de conversoes");
    expect(html).toContain("Cliente Teste");
    expect(html).toContain("Compra confirmada");
    expect(html).toContain("Falha transitoria");
    expect(html).toContain("R$");
    expect(html).toContain("3.597,00");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks/delivery_1/payload"',
    );
    expect(html).toContain(
      "area=health&amp;section=conversions&amp;q=meta_log_1",
    );
    expect(html).toContain("Tentar novamente");
    expect(html).toContain("Falha de comunicacao com a Meta");
    expect(html).toContain("Network request failed");
  });

  it("keeps a payload-originated audit scoped to the exact delivery", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          items: [],
          total: 0,
          summary: {
            all: 0,
            internalOutcome: 0,
            reviewRequired: 0,
            observed: 0,
            queued: 0,
            sent: 0,
            duplicate: 0,
            blockedConfiguration: 0,
            failedRetryable: 0,
            failedPermanent: 0,
          },
          facets: { rules: [] },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(operationsScope));

    const element = await ProviderConversionTracePage({
      searchParams: Promise.resolve({ deliveryId: "delivery_1" }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/conversion-traces?deliveryId=delivery_1&limit=50&offset=0",
      expect.anything(),
    );
    expect(html).toContain('name="deliveryId" value="delivery_1"');
    expect(html).toContain("Entrega selecionada");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks/conversions?deliveryId=delivery_1"',
    );
  });

  it("shows business reevaluation only for a retained reevaluable decision", async () => {
    const reviewItem = {
      ...traceItem,
      decision: {
        ...traceItem.decision,
        code: "review_required",
        reasonCode: "catalog_combination_unknown",
      },
      state: "review_required",
      retryable: false,
      reevaluable: true,
      execution: null,
      meta: null,
      review: {
        id: "review_1",
        status: "pending",
        classificationCode: "catalog_combination_unknown",
        reasonCode: "catalog_combination_unknown",
        decidedAt: null,
      },
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          items: [reviewItem],
          total: 1,
          summary: {
            all: 1,
            internalOutcome: 0,
            reviewRequired: 1,
            observed: 0,
            queued: 0,
            sent: 0,
            duplicate: 0,
            blockedConfiguration: 0,
            failedRetryable: 0,
            failedPermanent: 0,
          },
          facets: { rules: [] },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(operationsScope));

    const element = await ProviderConversionTracePage({
      searchParams: Promise.resolve({ deliveryId: "delivery_1" }),
    });
    const html = render(element);

    expect(html).toContain("Reavaliar decisao");
    expect(html).toContain('name="decisionId" value="decision_1"');
    expect(html).not.toContain("Tentar novamente");
  });
});

function render(element: ReactNode): string {
  return renderToStaticMarkup(createElement("div", null, element));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
