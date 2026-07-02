import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BackofficePage from "../src/app/(backoffice)/backoffice/page";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backoffice route", () => {
  it("renders split receivers returned by the backend", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "receiver_1",
              name: "Socio Operacional",
              walletId: "wallet_asaas_1",
              email: "socio@wpptrack.com",
              percentageBps: 2500,
              active: true,
              createdAt: "2026-07-02T03:00:00.000Z",
              updatedAt: "2026-07-02T03:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/split/receivers",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Socio Operacional");
    expect(html).toContain("wallet_asaas_1");
    expect(html).toContain("25.00%");
    expect(html).toContain("Novo recebedor");
    expect(html).toContain("Adicionar recebedor");
    expect(html).toContain("Salvar recebedor");
    expect(html).toContain('name="receiverId"');
    expect(html).toContain('name="percentage"');
  });

  it("renders diagnostic retry action when backend returns events", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "diag_1",
              workspaceId: "workspace_1",
              source: "uazapi",
              eventType: "conversion_trigger",
              severity: "error",
              status: "error",
              occurredAt: "2026-07-02T03:00:00.000Z",
              title: "Conversao nao enviada",
              message: "Regra por etiqueta sem contexto Meta",
              leadId: null,
              phoneHash: null,
              campaignId: null,
              adSetId: null,
              adId: null,
              jobId: null,
              errorCode: "MISSING_META_CONTEXT"
            }
          ]),
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
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Conversao nao enviada");
    expect(html).toContain("Reprocessar");
    expect(html).toContain("/backoffice/diagnostics/diag_1");
    expect(html).toContain("diag_1");
  });

  it("renders workspace billing configuration with editable Asaas customer ids", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "workspace_1",
              name: "Comunidade NOD",
              slug: "comunidade-nod",
              asaasCustomerId: "cus_asaas_1"
            },
            {
              id: "workspace_2",
              name: "Clinica Norte",
              slug: "clinica-norte",
              asaasCustomerId: null
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/workspaces/billing",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Comunidade NOD");
    expect(html).toContain("cus_asaas_1");
    expect(html).toContain("Clinica Norte");
    expect(html).toContain("Configurar customer");
  });

  it("sends diagnostic filters to the backoffice diagnostics endpoint", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({
      searchParams: Promise.resolve({
        q: "currency",
        source: "meta",
        since: "2026-07-01",
        until: "2026-07-02",
        campaignId: "cmp_1",
        adId: "ad_1"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/diagnostics/events?limit=25&source=meta&q=currency&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z&campaignId=cmp_1&adId=ad_1",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("6 filtros ativos");
    expect(html).toContain("currency");
  });

  it("does not render demo backoffice numbers or fallback rows when APIs fail", async () => {
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
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar recebedores");
    expect(html).toContain("Nao foi possivel carregar eventos diagnosticos");
    expect(html).not.toContain("R$ 18.420");
    expect(html).not.toContain("94.2%");
    expect(html).not.toContain("128");
    expect(html).not.toContain("7 alertas");
    expect(html).not.toContain("Jobs online");
    expect(html).not.toContain("3 tokens a vencer");
    expect(html).not.toContain("Recebedor principal");
    expect(html).not.toContain("wallet_asaas_preview");
    expect(html).not.toContain("WhatsApp sessions");
    expect(html).not.toContain("Meta CAPI");
    expect(html).not.toContain("Billing split");
  });

  it("renders empty backoffice states without demo fallback rows", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const element = await BackofficePage({});
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Nenhum recebedor configurado");
    expect(html).toContain("Nenhum evento diagnostico encontrado");
    expect(html).not.toContain("Recebedor principal");
    expect(html).not.toContain("wallet_asaas_preview");
    expect(html).not.toContain("WhatsApp sessions");
    expect(html).not.toContain("Meta CAPI");
    expect(html).not.toContain("Billing split");
  });
});
