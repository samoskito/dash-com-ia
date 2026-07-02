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

    const element = await BackofficePage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/split/receivers",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Socio Operacional");
    expect(html).toContain("wallet_asaas_1");
    expect(html).toContain("25.00%");
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

    const element = await BackofficePage();
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

    const element = await BackofficePage();
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
});
