import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IntegrationsPage from "../src/app/(app)/integrations/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("integrations route", () => {
  it("renders whatsapp instances with connection actions", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            checkedAt: "2026-07-02T03:00:00.000Z",
            providers: [
              {
                provider: "uazapi",
                status: "connected",
                checkedAt: "2026-07-02T03:00:00.000Z"
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "wpp_1",
              name: "Vendas",
              provider: "uazapi",
              billingStatus: "active",
              providerInstanceId: "provider_instance_1",
              checkoutUrl: null,
              createdAt: "2026-07-02T03:00:00.000Z"
            },
            {
              id: "wpp_2",
              name: "Suporte",
              provider: "uazapi",
              billingStatus: "pending_payment",
              providerInstanceId: null,
              checkoutUrl: "https://sandbox.asaas.com/i/pay_2",
              createdAt: "2026-07-02T03:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            status: "connected",
            tokenType: "bearer",
            scopes: ["ads_read", "business_management"],
            expiresAt: null,
            connectedAt: "2026-07-02T03:00:00.000Z",
            selectedBusinessId: null,
            selectedAdAccountId: null,
            selectedPixelId: "pixel_1"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            status: "connected",
            businesses: [
              {
                id: "business_1",
                name: "BM Principal",
                verificationStatus: "verified"
              }
            ],
            adAccounts: [
              {
                id: "act_1",
                name: "Conta WhatsApp",
                accountStatus: "active",
                currency: "BRL",
                timezoneName: "America/Sao_Paulo"
              }
            ],
            pixels: [
              {
                id: "pixel_1",
                name: "Pixel Loja",
                code: "123456789"
              }
            ],
            selection: {
              businessId: "business_1",
              adAccountId: "act_1",
              pixelId: "pixel_1"
            },
            lastSyncedAt: "2026-07-02T03:00:00.000Z",
            syncError: null
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            activeInstances: 1,
            pricePerInstanceCents: 9900,
            nextInstanceAmountCents: 9900,
            currency: "BRL"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            stages: [
              {
                key: "ctwa",
                label: "CTWA",
                value: 3,
                detail: "Leads com origem de campanha Meta"
              },
              {
                key: "webhook",
                label: "Webhook",
                value: 4,
                detail: "Webhooks Uazapi recebidos"
              },
              {
                key: "lead",
                label: "Lead",
                value: 5,
                detail: "Leads rastreados pelo WhatsApp"
              },
              {
                key: "conversion_ready",
                label: "CAPI pronta",
                value: 6,
                detail: "Eventos aguardando envio para Meta"
              },
              {
                key: "meta_sent",
                label: "Meta ACK",
                value: 2,
                detail: "Eventos enviados para Meta"
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            whatsappInstanceId: "wpp_1",
            provider: "uazapi",
            billingStatus: "active",
            connectionStatus: "qr_required",
            qrCode: "qr-code-text",
            message: "Escaneie o QR Code"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await IntegrationsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/whatsapp/instances",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/meta/connection",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/meta/assets",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/billing/whatsapp-instance/quote",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/pipeline",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/whatsapp/instances/wpp_1/status",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Meta conectado");
    expect(html).toContain("pixel_1");
    expect(html).toContain("BM Principal");
    expect(html).toContain("Conta WhatsApp");
    expect(html).toContain("Pixel Loja");
    expect(html).toContain('name="businessId"');
    expect(html).toContain('name="adAccountId"');
    expect(html).toContain('name="pixelId"');
    expect(html).toContain("Salvar selecao Meta");
    expect(html).toContain("Vendas");
    expect(html).toContain("provider_instance_1");
    expect(html).toContain("Conectar WhatsApp");
    expect(html).toContain("QR pendente");
    expect(html).toContain("qr-code-text");
    expect(html).toContain("Escaneie o QR Code");
    expect(html).toContain("wpp_1");
    expect(html).toContain("Suporte");
    expect(html).toContain("Pagamento pendente");
    expect(html).toContain("Pagar agora");
    expect(html).toContain('href="https://sandbox.asaas.com/i/pay_2"');
    expect(html).toContain("Adicionar instancia");
    expect(html).toContain("99,00");
    expect(html).toContain("Antecipada via Asaas");
    expect(html).toContain("Leads com origem de campanha Meta");
    expect(html).toContain("Webhooks Uazapi recebidos");
    expect(html).toContain("Eventos enviados para Meta");
    expect(html).toContain("3");
    expect(html).toContain("4");
    expect(html).toContain("2");
    expect(html).not.toContain("aguardando dados");
  });

  it("renders unavailable states without visual fallback providers or fake pipeline metrics", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await IntegrationsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar integracoes");
    expect(html).toContain("Ativos Meta indisponiveis");
    expect(html).toContain("Nao foi possivel carregar instancias");
    expect(html).not.toContain("Fallback visual");
    expect(html).not.toContain("Fallback local");
    expect(html).not.toContain("Sem credenciais reais");
    expect(html).not.toContain("capturado");
    expect(html).not.toContain("online");
    expect(html).not.toContain("92%");
    expect(html).not.toContain("99%");
    expect(html).not.toContain("18s");
  });
});
