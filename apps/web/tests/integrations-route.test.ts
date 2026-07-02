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
              createdAt: "2026-07-02T03:00:00.000Z"
            },
            {
              id: "wpp_2",
              name: "Suporte",
              provider: "uazapi",
              billingStatus: "pending_payment",
              providerInstanceId: null,
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
    expect(html).toContain("Meta conectado");
    expect(html).toContain("pixel_1");
    expect(html).toContain("BM Principal");
    expect(html).toContain("Conta WhatsApp");
    expect(html).toContain("Pixel Loja");
    expect(html).toContain("Vendas");
    expect(html).toContain("provider_instance_1");
    expect(html).toContain("Conectar WhatsApp");
    expect(html).toContain("wpp_1");
    expect(html).toContain("Suporte");
    expect(html).toContain("Pagamento pendente");
  });
});
