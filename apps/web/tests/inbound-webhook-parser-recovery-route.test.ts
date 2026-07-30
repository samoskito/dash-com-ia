import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import InboundWebhookParserRecoveryPage from "../src/app/(backoffice)/backoffice/inbound-webhooks/parser-recovery/[connectionId]/page";

const preview = {
  workspace: {
    id: "workspace_1",
    name: "MC Itaborai",
  },
  connection: {
    id: "connection_1",
    workspaceId: "workspace_1",
    provider: "gupshup",
    displayName: "Unidade Itaborai",
    parserVersion: "v1",
    parserReleaseStatus: "certified",
    status: "observation",
    productionActivatedAt: null,
    lastDeliveryAt: "2026-07-30T16:08:24.500Z",
    lastSuccessfulParseAt: "2026-07-30T16:08:24.500Z",
    createdAt: "2026-07-20T22:08:33.552Z",
    updatedAt: "2026-07-30T16:08:24.500Z",
  },
  counts: {
    awaitingParser: 3_374,
    recoverable: 2_058,
    expired: 1_316,
    unavailable: 0,
    inFlight: 0,
  },
  maxBatchSize: 500,
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inbound webhook parser recovery route", () => {
  it("shows the retained inventory, bounded batches and no-direct-send guard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(preview));

    const element = await InboundWebhookParserRecoveryPage({
      params: Promise.resolve({ connectionId: "connection_1" }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/connections/connection_1/parser-recovery-preview",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(html).toContain("Recuperacao controlada do parser");
    expect(html).toContain("Unidade Itaborai");
    expect(html).toContain("MC Itaborai");
    expect(html).toContain("Aguardando parser");
    expect(html).toContain("3374");
    expect(html).toContain("Recuperaveis");
    expect(html).toContain("2058");
    expect(html).toContain("Payload expirado");
    expect(html).toContain("1316");
    expect(html).toContain(
      "Esta operacao nao envia eventos diretamente para a Meta",
    );
    expect(html).toContain('value="canary_10"');
    expect(html).toContain('value="batch_100"');
    expect(html).toContain('value="batch_500"');
    expect(html).toContain('value="remaining"');
    expect(html).toContain(
      "Digite exatamente <strong>Unidade Itaborai</strong>",
    );
    expect(html).toContain("Recuperar lote");
    expect(html).not.toContain("AfhlkOT");
    expect(html).not.toContain("encryptedPayload");
  });

  it("keeps recovery unavailable when no retained payload remains", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        ...preview,
        counts: {
          ...preview.counts,
          recoverable: 0,
          expired: 3_374,
        },
      }),
    );

    const element = await InboundWebhookParserRecoveryPage({
      params: Promise.resolve({ connectionId: "connection_1" }),
    });
    const html = render(element);

    expect(html).toContain("Nenhum payload pode ser recuperado agora");
    expect(html).not.toContain("Recuperar lote");
  });

  it("keeps denied or missing connections behind a generic message", async () => {
    const sensitiveFailure =
      "workspace_very_secret failed at internal-database:5432";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ message: sensitiveFailure }, 403),
    );

    const element = await InboundWebhookParserRecoveryPage({
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
