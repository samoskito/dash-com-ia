import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InboundWebhookDeliveriesPage from "../src/app/(backoffice)/backoffice/inbound-webhooks/page";
import InboundWebhookPayloadPage from "../src/app/(backoffice)/backoffice/inbound-webhooks/[deliveryId]/payload/page";

const availableDelivery = {
  id: "delivery_available",
  workspaceId: "workspace_1",
  workspaceName: "Cliente Teste",
  connectionId: "connection_1",
  connectionName: "Umbler Comercial",
  provider: "umbler",
  providerEventType: "message.received",
  parserVersion: "umbler-v1.3.0",
  parserReleaseStatus: "observation_only",
  purpose: "message_observation",
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
  channels: [
    {
      id: "channel_1",
      displayName: "Comercial",
      connectedPhone: "+5511999999999",
    },
  ],
};

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
          lastDeliveryAt: "2026-07-17T12:00:01.000Z",
          channels: [
            {
              id: "channel_1",
              displayName: "Comercial",
              connectedPhone: "+5511999999999",
              status: "active",
              lastSeenAt: "2026-07-17T12:00:01.000Z",
            },
          ],
        },
      ],
      directInstances: [],
    },
  ],
};

const nodApiOperationsScope = {
  workspaces: [
    {
      id: "workspace_nod",
      name: "Comunidade NOD",
      connections: [],
      directInstances: [
        {
          id: "instance_nod",
          displayName: "teste - nod",
          provider: "uazapi",
          status: "active",
          connectedPhone: "+5511911166170",
          seatStatus: "active",
          lastSeenAt: "2026-07-29T15:00:00.000Z",
        },
      ],
    },
  ],
};

const nodApiWebhookLog = {
  id: "webhook_nod_1",
  workspaceId: "workspace_nod",
  whatsappInstanceId: "instance_nod",
  source: "uazapi",
  eventType: "messages",
  externalEventId: "message_nod_1",
  status: "received",
  receivedAt: "2026-07-29T15:01:00.000Z",
  processedAt: null,
  leadId: null,
  phoneHash: "phone_hash_nod",
  campaignId: null,
  adSetId: null,
  adId: null,
  jobId: null,
  errorCode: null,
  errorMessage: null,
  payloadAvailable: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inbound webhook payload routes", () => {
  it("renders recent deliveries with quick filters and scoped audit actions", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(operationsScope))
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
          automationCallbacks: 12,
          awaitingParser: 4,
        }),
      );

    const element = await InboundWebhookDeliveriesPage({});
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/deliveries?limit=51&offset=0",
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
    expect(html).toContain("Cliente, conexao e canal");
    expect(html).toContain("Cliente Teste");
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
    expect(html).toContain("Replay historico");
    expect(html).toContain("Recuperar producao");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks/replay/connection_1"',
    );
    expect(html).not.toContain("Workspace ID");
    expect(html).not.toContain("Conexao ID");
    expect(html).not.toContain("umbler-v1.3.0");
    expectNoReleaseAction(html);
  });

  it("lists NOD API workspaces and opens their persisted payloads", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(nodApiOperationsScope))
      .mockResolvedValueOnce(jsonResponse([nodApiWebhookLog]));

    const element = await InboundWebhookDeliveriesPage({
      searchParams: Promise.resolve({
        workspaceId: "workspace_nod",
        connectionId: "nod-api:workspace_nod",
        channelId: "instance_nod",
      }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/webhooks?workspaceId=workspace_nod&source=uazapi&limit=51&offset=0&whatsappInstanceId=instance_nod",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(html).toContain("Comunidade NOD");
    expect(html).toContain("NOD API por QR code");
    expect(html).toContain("teste - nod");
    expect(html).toContain("+5511911166170");
    expect(html).toContain("messages");
    expect(html).toContain("Payload disponivel");
    expect(html).toContain('href="/backoffice/webhooks/webhook_nod_1/payload"');
    expect(html).not.toContain("Replay historico");
    expect(html).not.toContain("Recuperar producao");
  });

  it("filters recent deliveries through the quick CTWA view", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(operationsScope))
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
          automationCallbacks: 12,
          awaitingParser: 4,
        }),
      );

    const element = await InboundWebhookDeliveriesPage({
      searchParams: Promise.resolve({
        classification: "eligible_route_unresolved",
      }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/deliveries?classification=eligible_route_unresolved&limit=51&offset=0",
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

  it("offers a dedicated parser recovery only for retained unsupported Gupshup deliveries", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(operationsScope))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            ...availableDelivery,
            id: "delivery_gupshup_unsupported",
            provider: "gupshup",
            providerEventType: "message",
            parserVersion: "gupshup-v1",
            classification: "unsupported_event",
            eventCount: 0,
            normalizedSummary: {
              eventCount: 0,
              hasCtwa: false,
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          all: 0,
          ctwaPending: 0,
          ctwaRouted: 0,
          failed: 0,
          noCtwa: 0,
          automationCallbacks: 0,
          awaitingParser: 1,
        }),
      );

    const element = await InboundWebhookDeliveriesPage({});
    const html = render(element);

    expect(html).toContain("Reprocessar parser");
    expect(html).not.toContain("Reprocessar conversao");
    expect(html).toContain(
      'value="delivery_gupshup_unsupported"',
    );
  });

  it("separates retained conversion automation callbacks from message events", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(operationsScope))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            ...availableDelivery,
            id: "delivery_automation",
            purpose: "conversion_automation",
            providerEventType: "automation_callback",
            classification: "unsupported_event",
            eventCount: 0,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          all: 423,
          ctwaPending: 0,
          ctwaRouted: 0,
          failed: 0,
          noCtwa: 373,
          automationCallbacks: 12,
          awaitingParser: 12,
        }),
      );

    const element = await InboundWebhookDeliveriesPage({
      searchParams: Promise.resolve({
        purpose: "conversion_automation",
      }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/deliveries?purpose=conversion_automation&limit=51&offset=0",
      expect.anything(),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/summary?purpose=conversion_automation",
      expect.anything(),
    );
    expect(html).toContain("Callbacks de automacao");
    expect(html).toContain("Automacao de conversao / automation_callback");
    expect(html).toContain("Callback preservado");
    expect(html).toContain(
      "Payload da automacao retido para validar e certificar o parser.",
    );
    expect(html).not.toContain("Replay historico");
  });

  it("paginates older deliveries while preserving the active filters", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(operationsScope))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            ...availableDelivery,
            id: "delivery_page_2",
            classification: "ignored_outbound",
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          all: 423,
          ctwaPending: 0,
          ctwaRouted: 0,
          failed: 0,
          noCtwa: 373,
          automationCallbacks: 12,
          awaitingParser: 4,
        }),
      );

    const element = await InboundWebhookDeliveriesPage({
      searchParams: Promise.resolve({
        workspaceId: "workspace_1",
        connectionId: "connection_1",
        channelId: "channel_1",
        provider: "umbler",
        purpose: "message_observation",
        status: "processed",
        classification: "ignored_outbound",
        page: "2",
      }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/deliveries?workspaceId=workspace_1&connectionId=connection_1&channelId=channel_1&provider=umbler&purpose=message_observation&status=processed&classification=ignored_outbound&limit=51&offset=50",
      expect.anything(),
    );
    expect(html).toContain("Pagina 2 - 50 entregas por pagina");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks?workspaceId=workspace_1&amp;connectionId=connection_1&amp;channelId=channel_1&amp;provider=umbler&amp;purpose=message_observation&amp;status=processed&amp;classification=ignored_outbound"',
    );
    expect(html).toContain("Anterior");
    expect(html).toContain("delivery_page_2");
  });

  it("filters and paginates high-volume shadow decisions by event and minute", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(operationsScope))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          all: 1_400,
          ctwaPending: 0,
          ctwaRouted: 400,
          failed: 0,
          noCtwa: 1_000,
          automationCallbacks: 0,
          awaitingParser: 0,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          channel: {
            id: "channel_1",
            displayName: "Comercial",
            connectedPhone: "+5511999999999",
            mode: "shadow",
          },
          counts: {
            comparisons: 1_200,
            matches: 1_190,
            mismatches: 10,
          },
          filteredCounts: {
            comparisons: 45,
            matches: 40,
            mismatches: 5,
          },
          pagination: {
            offset: 20,
            limit: 20,
            total: 45,
            hasPrevious: true,
            hasNext: true,
          },
          mismatchReasons: [],
          latestComparisonAt: "2026-07-24T14:00:00.000Z",
          canActivateCanonical: true,
          canonicalBlocker: null,
          comparisons: [
            {
              id: "comparison_21",
              occurrenceKey: "message_21:rule_1",
              eventName: "Purchase",
              authoritativeEngine: "legacy",
              matches: false,
              mismatchCode: "decision_code_mismatch",
              legacy: {
                engineVersion: "legacy-v1",
                decisionCode: "eligible",
                reasonCode: "catalog_match",
              },
              canonical: {
                engineVersion: "canonical-v1",
                decisionCode: "review_required",
                reasonCode: "catalog_ambiguous",
              },
              sourceDeliveryId: "delivery_shadow_21",
              createdAt: "2026-07-24T13:40:00.000Z",
            },
          ],
        }),
      );

    const element = await InboundWebhookDeliveriesPage({
      searchParams: Promise.resolve({
        workspaceId: "workspace_1",
        connectionId: "connection_1",
        channelId: "channel_1",
        shadowDecision: "with_decision",
        shadowCode: "review_required",
        shadowResult: "mismatches",
        shadowEvent: "Purchase",
        shadowFrom: "2026-07-24T10:30",
        shadowUntil: "2026-07-24T11:00",
        shadowPage: "2",
      }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/conversion-rollout/channels/channel_1?comparisonResult=mismatches&decisionPresence=with_decision&limit=20&offset=20&eventName=Purchase&decisionCode=review_required&createdFrom=2026-07-24T10%3A30&createdUntil=2026-07-24T11%3A00",
      expect.anything(),
    );
    expect(html).toContain("Historico pesquisavel");
    expect(html).toContain("45 no filtro");
    expect(html).toContain("Compras");
    expect(html).toContain("Requer revisao");
    expect(html).toContain("Pagina 2 de 3");
    expect(html).toContain("Anterior");
    expect(html).toContain("Proxima");
    expect(html).toContain(
      'href="/backoffice/inbound-webhooks/delivery_shadow_21/payload"',
    );
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
      .mockRejectedValueOnce(new Error(sensitiveFailure))
      .mockResolvedValueOnce(jsonResponse({ message: sensitiveDenial }, 403));

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
