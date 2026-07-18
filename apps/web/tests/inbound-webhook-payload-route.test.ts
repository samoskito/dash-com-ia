import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InboundWebhookDeliveriesPage from "../src/app/(backoffice)/backoffice/inbound-webhooks/page";
import InboundWebhookPayloadPage from "../src/app/(backoffice)/backoffice/inbound-webhooks/[deliveryId]/payload/page";

const availableDelivery = {
  id: "delivery_available",
  workspaceId: "workspace_1",
  connectionId: "connection_1",
  connectionName: "Umbler Comercial",
  provider: "umbler",
  providerEventType: "message.received",
  parserVersion: "umbler-v1.3.0",
  parserReleaseStatus: "observation_only",
  status: "processed",
  classification: "eligible_route_resolved",
  firstReceivedAt: "2026-07-17T12:00:00.000Z",
  lastReceivedAt: "2026-07-17T12:00:01.000Z",
  attemptCount: 1,
  payloadAvailable: true,
  payloadExpiresAt: "2026-07-24T12:00:00.000Z",
  parseErrorCode: null,
  routingErrorCode: null,
  normalizedSummary: {
    eventCount: 1,
    hasCtwa: true,
  },
  eventCount: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inbound webhook payload routes", () => {
  it("renders recent deliveries with quick filters and scoped audit actions", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse([
          availableDelivery,
          {
            ...availableDelivery,
            id: "delivery_expired",
            connectionName: "Umbler Expirada",
            status: "failed",
            payloadAvailable: false,
            payloadExpiresAt: "2000-01-01T00:00:00.000Z",
          },
          {
            ...availableDelivery,
            id: "delivery_removed",
            connectionName: "Umbler Removida",
            payloadAvailable: false,
            payloadExpiresAt: "2999-01-01T00:00:00.000Z",
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          all: 423,
          ctwaPending: 50,
          ctwaRouted: 0,
          failed: 1,
          noCtwa: 373,
        }),
      );

    const element = await InboundWebhookDeliveriesPage({});
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/deliveries?limit=50",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/summary",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(html).toContain("<strong>423</strong>");
    expect(html).toContain("<strong>50</strong>");
    expect(html).toContain("<strong>373</strong>");
    expect(html).toContain("Entregas do WhatsApp");
    expect(html).toContain("Filtros avancados");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks?classification=eligible_route_unresolved"',
    );
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks?classification=ignored_no_ctwa"',
    );
    expect(html).toContain("Umbler Comercial");
    expect(html).toContain("Processado");
    expect(html).toContain("Falhou");
    expect(html).toContain("Payload disponivel");
    expect(html).toContain("Payload expirado");
    expect(html).toContain("Payload removido");
    expect(html).toContain("Ver payload");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks/delivery_available/payload"',
    );
    expect(html).toContain("Preparar replay");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks/replay/connection_1"',
    );
    expect(html).not.toContain("workspace_1");
    expect(html).not.toContain("umbler-v1.3.0");
    expectNoReleaseAction(html);
  });

  it("filters recent deliveries through the quick CTWA view", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse([
          {
            ...availableDelivery,
            id: "delivery_pending",
            connectionName: "Umbler CTWA",
            classification: "eligible_route_unresolved",
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          all: 423,
          ctwaPending: 50,
          ctwaRouted: 0,
          failed: 0,
          noCtwa: 373,
        }),
      );

    const element = await InboundWebhookDeliveriesPage({
      searchParams: Promise.resolve({
        classification: "eligible_route_unresolved",
      }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/deliveries?limit=50&classification=eligible_route_unresolved",
      expect.anything(),
    );
    expect(html).toContain("50 CTWA aguardando validacao do payload");
    expect(html).toContain("Umbler CTWA");
    expect(html).not.toContain("Umbler Organico");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks/delivery_pending/payload"',
    );
    expect(html).toContain('aria-current="page"');
  });

  it("renders escaped raw JSON beside normalized parser events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        delivery: availableDelivery,
        payload: {
          event: "message.received",
          message: {
            text: '<script>alert("raw")</script> & customer',
          },
        },
        events: [
          {
            id: "event_1",
            connectionId: "connection_1",
            deliveryId: "delivery_available",
            channelId: "channel_1",
            provider: "umbler",
            providerEventType: "message.received",
            externalMessageId: "message_external_1",
            occurredAt: "2026-07-17T12:00:00.000Z",
            connectedPhoneSuffix: "4321",
            contactIdentityHash: "hashed-contact-identity",
            adId: "ad_123",
            hasCtwa: true,
            classification: "eligible_route_resolved",
            classificationReason: "CTWA_ROUTE_RESOLVED",
            resolvedBusinessConnectionId: "business_connection_1",
            resolvedReportingAccountId: "reporting_account_1",
            resolvedConversionDestinationId: "conversion_destination_1",
            createdAt: "2026-07-17T12:00:02.000Z",
          },
        ],
      }),
    );

    const element = await InboundWebhookPayloadPage({
      params: Promise.resolve({ deliveryId: "delivery_available" }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/deliveries/delivery_available/payload",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(html).toContain("Payload bruto recebido");
    expect(html).toContain("message.received");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;/script&gt;");
    expect(html).toContain("&amp; customer");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Eventos normalizados");
    expect(html).toContain("CTWA com rota resolvida");
    expect(html).toContain("Com CTWA");
    expect(html).toContain("message_external_1");
    expect(html).toContain("ad_123");
    expect(html).toContain("CTWA_ROUTE_RESOLVED");
    expect(html).toContain("resolvida");
    expectNoReleaseAction(html);
  });

  it("renders the expiration or removal state when raw payload is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        delivery: {
          ...availableDelivery,
          id: "delivery_unavailable",
          payloadAvailable: false,
          payloadExpiresAt: "2000-01-01T00:00:00.000Z",
          normalizedSummary: null,
          eventCount: 0,
        },
        payload: null,
        events: [],
      }),
    );

    const element = await InboundWebhookPayloadPage({
      params: Promise.resolve({ deliveryId: "delivery_unavailable" }),
    });
    const html = render(element);

    expect(html).toContain("Payload bruto indisponivel");
    expect(html).toContain(
      "O periodo de retencao terminou ou os campos criptografados ja foram removidos.",
    );
    expect(html).toContain("Os metadados seguros continuam preservados.");
    expect(html).toContain("Nenhum evento normalizado");
    expect(html).not.toContain("inbound-raw-payload");
    expectNoReleaseAction(html);
  });

  it("keeps fetch failures and access denials behind generic messages", async () => {
    const sensitiveFailure = "database unavailable at internal-host:5432";
    const sensitiveDenial = "workspace manager cannot decrypt delivery_secret";

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error(sensitiveFailure))
      .mockRejectedValueOnce(new Error(sensitiveFailure))
      .mockResolvedValueOnce(
        jsonResponse({ message: sensitiveDenial }, 403),
      );

    const listElement = await InboundWebhookDeliveriesPage({});
    const payloadElement = await InboundWebhookPayloadPage({
      params: Promise.resolve({ deliveryId: "delivery_denied" }),
    });
    const listHtml = render(listElement);
    const payloadHtml = render(payloadElement);

    expect(listHtml).toContain("Nao foi possivel carregar as entregas");
    expect(listHtml).toContain(
      "Confirme a sessao de platform owner e tente novamente.",
    );
    expect(payloadHtml).toContain("Entrega nao encontrada");
    expect(payloadHtml).toContain(
      "O registro nao existe ou esta sessao nao possui acesso de platform owner.",
    );
    expect(`${listHtml}${payloadHtml}`).not.toContain(sensitiveFailure);
    expect(`${listHtml}${payloadHtml}`).not.toContain(sensitiveDenial);
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

function expectNoReleaseAction(html: string): void {
  const actionLabels =
    html.match(/<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>/gi)?.join(" ") ??
    "";

  expect(html).not.toMatch(
    /<(?:a|button|form)\b[^>]*(?:certif|production|producao)[^>]*>/i,
  );
  expect(actionLabels).not.toMatch(
    /certific|(?:ativar|liberar)[\s\S]{0,80}producao|producao[\s\S]{0,80}(?:ativar|liberar)/i,
  );
}
