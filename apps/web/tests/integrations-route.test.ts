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
            status: "active",
            planName: "Por instancia",
            activeInstances: 2,
            pricePerWhatsappInstanceCents: 9900,
            monthlyAmountCents: 19800,
            currentPeriodEnd: "2026-08-02T03:00:00.000Z",
            asaasSubscriptionId: "sub_asaas_1"
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
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "owner",
            permissions: {
              canInviteMembers: true,
              canManageBilling: true,
              canManageIntegrations: true,
              canViewReports: true
            }
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
      "http://localhost:3333/billing/subscription",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/integrations/pipeline",
      expect.objectContaining({ credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/workspaces/current",
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
    expect(html).toContain("Assinatura");
    expect(html).toContain("Por instancia");
    expect(html).toContain("198,00");
    expect(html).toContain("sub_asaas_1");
    expect(html).toContain("Antecipada via Asaas");
    expect(html).toContain("Leads com origem de campanha Meta");
    expect(html).toContain("Webhooks Uazapi recebidos");
    expect(html).toContain("Eventos enviados para Meta");
    expect(html).toContain("3");
    expect(html).toContain("4");
    expect(html).toContain("2");
    expect(html).not.toContain("aguardando dados");
  });

  it("hides integration mutation actions for workspace members", async () => {
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
            scopes: ["ads_read"],
            expiresAt: null,
            connectedAt: "2026-07-02T03:00:00.000Z",
            selectedBusinessId: "business_1",
            selectedAdAccountId: "act_1",
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
            businesses: [{ id: "business_1", name: "BM Principal" }],
            adAccounts: [{ id: "act_1", name: "Conta WhatsApp" }],
            pixels: [{ id: "pixel_1", name: "Pixel Loja", code: "123456789" }],
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
            status: "active",
            planName: "Por instancia",
            activeInstances: 1,
            pricePerWhatsappInstanceCents: 9900,
            monthlyAmountCents: 9900,
            currentPeriodEnd: null,
            asaasSubscriptionId: null
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            stages: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "member",
            permissions: {
              canInviteMembers: false,
              canManageBilling: false,
              canManageIntegrations: false,
              canViewReports: true
            }
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
            connectionStatus: "connected",
            qrCode: null,
            message: "WhatsApp conectado"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await IntegrationsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("BM Principal");
    expect(html).toContain("Vendas");
    expect(html).toContain("Ativa");
    expect(html).toContain("Nao vinculada");
    expect(html).toContain("Sem permissao para alterar Meta");
    expect(html).toContain("Sem permissao para adicionar instancias");
    expect(html).not.toContain("pendente");
    expect(html).not.toContain("Salvar selecao Meta");
    expect(html).not.toContain("Adicionar instancia");
    expect(html).not.toContain("Conectar WhatsApp");
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

  it("renders unknown integration statuses as explicit unknown states", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            checkedAt: "2026-07-02T03:00:00.000Z",
            providers: [
              {
                provider: "uazapi",
                status: "rate_limited",
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
              billingStatus: "provisioning_hold",
              providerInstanceId: null,
              checkoutUrl: null,
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
            status: "sync_paused",
            tokenType: "bearer",
            scopes: [],
            expiresAt: null,
            connectedAt: null,
            selectedBusinessId: null,
            selectedAdAccountId: null,
            selectedPixelId: null
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            status: "sync_paused",
            businesses: [],
            adAccounts: [],
            pixels: [],
            selection: {
              businessId: null,
              adAccountId: null,
              pixelId: null
            },
            lastSyncedAt: null,
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
            status: "manual_review",
            planName: "Por instancia",
            activeInstances: 1,
            pricePerWhatsappInstanceCents: 9900,
            monthlyAmountCents: 9900,
            currentPeriodEnd: null,
            asaasSubscriptionId: null
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            stages: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "owner",
            permissions: {
              canInviteMembers: true,
              canManageBilling: true,
              canManageIntegrations: true,
              canViewReports: true
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await IntegrationsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Meta com status desconhecido");
    expect(html).toContain("Status desconhecido");
    expect(html).not.toContain("rate_limited");
    expect(html).not.toContain("sync_paused");
    expect(html).not.toContain("provisioning_hold");
    expect(html).not.toContain("manual_review");
  });

  it("renders stale Meta asset selections as resync-required states", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            checkedAt: "2026-07-02T03:00:00.000Z",
            providers: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            status: "connected",
            tokenType: "bearer",
            scopes: ["ads_read"],
            expiresAt: null,
            connectedAt: "2026-07-02T03:00:00.000Z",
            selectedBusinessId: "business_old",
            selectedAdAccountId: "act_old",
            selectedPixelId: "pixel_old"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            status: "connected",
            businesses: [{ id: "business_new", name: "BM Nova" }],
            adAccounts: [{ id: "act_new", name: "Conta Nova" }],
            pixels: [{ id: "pixel_new", name: "Pixel Novo", code: "999" }],
            selection: {
              businessId: "business_old",
              adAccountId: "act_old",
              pixelId: "pixel_old"
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
            activeInstances: 0,
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
            status: "active",
            planName: "Por instancia",
            activeInstances: 0,
            pricePerWhatsappInstanceCents: 9900,
            monthlyAmountCents: 0,
            currentPeriodEnd: null,
            asaasSubscriptionId: null
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: "workspace_1",
            rangeLabel: "Ultimos 7 dias",
            stages: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "workspace_1",
            name: "Workspace",
            slug: "workspace",
            role: "owner",
            permissions: {
              canInviteMembers: true,
              canManageBilling: true,
              canManageIntegrations: true,
              canViewReports: true
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await IntegrationsPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Ativo selecionado fora da ultima sincronizacao");
    expect(html).toContain("Ressincronize a Meta ou escolha outro ativo");
    expect(html).not.toContain("ativo selecionado nao encontrado");
  });
});
