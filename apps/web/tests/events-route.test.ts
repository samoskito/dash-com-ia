import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import EventsPage from "../src/app/(app)/events/page";

afterEach(() => {
  vi.restoreAllMocks();
});

function auditResponse(events: unknown[]) {
  return {
    workspaceId: "workspace_1",
    rangeLabel: "2026-07-06 a 2026-07-12",
    summary: {
      total: events.length,
      sent: 1,
      queued: 0,
      blocked: 0,
      failed: events.length > 1 ? 1 : 0,
      notEligible: 0,
      shadowObserved: 0,
      historical: 0,
      discarded: 0
    },
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: events.length,
      totalPages: events.length ? 1 : 0
    },
    events
  };
}

describe("events route", () => {
  it("renders a filtered customer-facing Meta event audit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          auditResponse([
            {
              id: "event_1",
              eventName: "Purchase",
              eventLabel: "Compras",
              deliveryState: "sent",
              statusLabel: "Enviado",
              statusDetail: "Recebido pela Meta",
              source: "external_integration",
              sourceLabel: "Integracao externa",
              leadId: "lead_1",
              leadName: "Mariana Alves",
              phoneDisplay: "+55 11 99999-1020",
              campaignId: "cmp_1",
              campaignName: "Campanha WhatsApp",
              adSetId: "adset_1",
              adSetName: "Conjunto aberto",
              adId: "ad_1",
              adName: "Anuncio 1",
              pixelId: "pixel_1",
              pageId: "page_1",
              occurredAt: "2026-07-12T15:00:00.000Z",
              sentAt: "2026-07-12T15:01:00.000Z",
              status: "sent",
              providerResponseSummary: "Meta confirmou o recebimento",
              errorCode: null,
              errorMessage: null,
              valueSource: "configured_average"
            }
          ])
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await EventsPage({
      searchParams: Promise.resolve({
        since: "2026-07-06",
        until: "2026-07-12",
        eventName: "Purchase",
        status: "sent",
        source: "external_integration"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/reports/conversions/audit?since=2026-07-06&until=2026-07-12&page=1&pageSize=25&eventName=Purchase&status=sent&source=external_integration",
      expect.objectContaining({ credentials: "include" })
    );
    expect(html).toContain("Auditoria de conversoes");
    expect(html).toContain("Em sombra");
    expect(html).toContain("Mariana Alves");
    expect(html).toContain("+55 11 99999-1020");
    expect(html).toContain("Campanha WhatsApp");
    expect(html).toContain("Recebido pela Meta");
    expect(html).toContain("Auditoria");
    expect(html).toContain("Inspecionar");
    expect(html).toContain("Auditoria do evento");
    expect(html).toContain('href="/leads/lead_1"');
    expect(html).toContain('name="status"');
    expect(html).toContain('name="source"');
    expect(html).not.toContain("phone_hash");
    expect(html).not.toContain("access_token");
  });

  it("shows safe failure copy without raw provider details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          auditResponse([
            {
              id: "event_error",
              eventName: "QualifiedLead",
              eventLabel: "Lead qualificado",
              deliveryState: "failed",
              statusLabel: "Falhou",
              statusDetail: "O envio nao foi concluido",
              source: "whatsapp_automation",
              sourceLabel: "Automacao do WhatsApp",
              leadId: null,
              leadName: null,
              phoneDisplay: null,
              campaignId: null,
              campaignName: null,
              adSetId: null,
              adSetName: null,
              adId: null,
              adName: null,
              pixelId: null,
              pageId: null,
              occurredAt: "2026-07-12T15:00:00.000Z",
              sentAt: null,
              status: "error",
              providerResponseSummary: null,
              errorCode: "MetaCapiRejected",
              errorMessage: "A Meta recusou o evento",
              valueSource: null
            }
          ])
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const element = await EventsPage({
      searchParams: Promise.resolve({
        since: "2026-07-06",
        until: "2026-07-12"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("A Meta recusou o evento");
    expect(html).toContain("Lead nao vinculado");
    expect(html).toContain("Ainda nao enviado");
  });

  it("renders an unavailable state without invented events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      })
    );

    const element = await EventsPage({
      searchParams: Promise.resolve({
        since: "2026-07-06",
        until: "2026-07-12"
      })
    });
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("API indisponivel");
    expect(html).toContain("Nao foi possivel carregar a auditoria");
    expect(html).not.toContain("Mariana Alves");
  });

  it("keeps the audit summary and pagination contained on mobile", () => {
    const css = readFileSync(
      new URL("../src/styles/globals.css", import.meta.url),
      "utf8"
    );
    const auditStylesStart = css.indexOf(".audit-summary");
    const auditMobileStart = css.indexOf(
      "@media (max-width: 620px)",
      auditStylesStart
    );
    const nextMediaStart = css.indexOf("@media", auditMobileStart + 1);
    const auditMobileBlock = css.slice(
      auditMobileStart,
      nextMediaStart === -1 ? undefined : nextMediaStart
    );

    expect(css).toContain(".audit-summary");
    expect(css).toContain("grid-template-columns: repeat(8, minmax(0, 1fr));");
    expect(auditMobileBlock).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));"
    );
    expect(auditMobileBlock).toContain(".report-pagination > div");
    expect(auditMobileBlock).toContain("width: 100%;");
  });
});
