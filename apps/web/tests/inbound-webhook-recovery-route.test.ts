import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import InboundWebhookProductionRecoveryPage from "../src/app/(backoffice)/backoffice/inbound-webhooks/recovery/[connectionId]/page";

const preview = {
  workspace: {
    id: "workspace_1",
    name: "Cliente Teste",
  },
  connection: {
    id: "connection_1",
    workspaceId: "workspace_1",
    provider: "umbler",
    displayName: "Umbler Comercial",
    parserVersion: "v1",
    parserReleaseStatus: "certified",
    status: "production",
    productionActivatedAt: "2026-07-21T12:00:00.000Z",
    lastDeliveryAt: "2026-07-21T13:00:00.000Z",
    lastSuccessfulParseAt: "2026-07-21T13:00:00.000Z",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-21T13:00:00.000Z",
  },
  productionEnabled: true,
  counts: {
    totalCtwa: 30,
    historical: 10,
    routeUnresolved: 2,
    unavailable: 1,
    alreadyQueued: 12,
    eligible: 5,
  },
  channels: [
    {
      id: "channel_1",
      displayName: "Comercial",
      connectedPhone: "+5511999999999",
      status: "active",
      productionActivatedAt: "2026-07-21T12:05:00.000Z",
      totalCtwa: 30,
      historical: 10,
      routeUnresolved: 2,
      unavailable: 1,
      alreadyQueued: 12,
      eligible: 5,
    },
  ],
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inbound webhook production recovery route", () => {
  it("shows a distinct post-activation recovery lane with canaries", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(preview));

    const element = await InboundWebhookProductionRecoveryPage({
      params: Promise.resolve({ connectionId: "connection_1" }),
      searchParams: Promise.resolve({ channelId: "channel_1" }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/connections/connection_1/production-recovery-preview",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(html).toContain("Recuperacao de producao Umbler");
    expect(html).toContain("Cliente Teste");
    expect(html).toContain("Historicos");
    expect(html).toContain("Fora da recuperacao");
    expect(html).toContain("Elegiveis agora");
    expect(html).toContain("Replay historico");
    expect(html).toContain("Autorizar recuperacao");
    expect(html).toContain('name="channelId"');
    expect(html).toContain('value="channel_1"');
    expect(html).toContain('value="canary_1"');
    expect(html).toContain('value="canary_5"');
    expect(html).toContain('value="canary_10"');
    expect(html).toContain('value="remaining"');
    expect(html).toContain(
      "Digite exatamente <strong>Umbler Comercial</strong>",
    );
    expect(html).not.toContain("AfhlkOT");
    expect(html).not.toContain("contact@example.com");
  });

  it("keeps authorization blocked when production is disabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        ...preview,
        productionEnabled: false,
      }),
    );

    const element = await InboundWebhookProductionRecoveryPage({
      params: Promise.resolve({ connectionId: "connection_1" }),
    });
    const html = render(element);

    expect(html).toContain(
      "INBOUND_WEBHOOK_PRODUCTION_ENABLED permanece desativada.",
    );
    expect(html).toContain("A recuperacao ainda nao pode ser autorizada");
    expect(html).not.toContain("Autorizar recuperacao");
  });

  it("keeps denied or missing connections behind a generic message", async () => {
    const sensitiveFailure =
      "workspace_very_secret failed at internal-database:5432";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ message: sensitiveFailure }, 403),
    );

    const element = await InboundWebhookProductionRecoveryPage({
      params: Promise.resolve({ connectionId: "connection_denied" }),
    });
    const html = render(element);

    expect(html).toContain("Conexao indisponivel");
    expect(html).toContain(
      "O registro nao existe ou esta sessao nao possui acesso de platform owner.",
    );
    expect(html).not.toContain(sensitiveFailure);
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
