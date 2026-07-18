import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import InboundWebhookReplayPage from "../src/app/(backoffice)/backoffice/inbound-webhooks/replay/[connectionId]/page";

const preview = {
  connection: {
    id: "connection_1",
    workspaceId: "workspace_1",
    provider: "umbler",
    displayName: "observacao inicial",
    parserVersion: "v1",
    parserReleaseStatus: "observation_only",
    status: "observation",
    lastDeliveryAt: "2026-07-18T14:40:44.000Z",
    lastSuccessfulParseAt: "2026-07-18T14:40:44.000Z",
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-18T14:40:44.000Z",
  },
  parserRelease: {
    id: "parser_1",
    provider: "umbler",
    version: "v1",
    status: "observation_only",
    certifiedAt: null,
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-18T14:40:44.000Z",
  },
  replayEnabled: false,
  counts: {
    totalCtwa: 50,
    routeResolved: 0,
    routeUnresolved: 50,
    payloadAvailable: 50,
    payloadExpired: 0,
    payloadUnavailable: 0,
    alreadyMaterialized: 0,
    eligible: 0,
  },
  oldestOccurredAt: "2026-07-18T00:06:00.000Z",
  newestOccurredAt: "2026-07-18T14:40:44.000Z",
  latestBatch: null,
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inbound webhook controlled replay route", () => {
  it("shows redacted readiness and keeps replay blocked before certification", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(preview));

    const element = await InboundWebhookReplayPage({
      params: Promise.resolve({ connectionId: "connection_1" }),
    });
    const html = render(element);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3333/backoffice/inbound-webhooks/connections/connection_1/replay-preview",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
    expect(html).toContain("Replay controlado Umbler");
    expect(html).toContain("observacao inicial");
    expect(html).toContain("CTWA observados");
    expect(html).toContain(">50<");
    expect(html).toContain("Certificar parser");
    expect(html).toContain(
      "INBOUND_WEBHOOK_REPLAY_ENABLED permanece desativada.",
    );
    expect(html).toContain("O lote ainda nao pode ser autorizado");
    expect(html).not.toContain("Autorizar replay");
    expect(html).not.toContain("contact@example.com");
    expect(html).not.toContain("+5521981071538");
    expect(html).not.toContain("AfhlkOT");
  });

  it("requires the exact connection name when a certified batch is ready", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        ...preview,
        connection: {
          ...preview.connection,
          parserReleaseStatus: "certified",
        },
        parserRelease: {
          ...preview.parserRelease,
          status: "certified",
          certifiedAt: "2026-07-18T15:00:00.000Z",
        },
        replayEnabled: true,
        counts: {
          ...preview.counts,
          routeResolved: 12,
          routeUnresolved: 38,
          alreadyMaterialized: 2,
          eligible: 10,
        },
        latestBatch: {
          id: "batch_1",
          workspaceId: "workspace_1",
          connectionId: "connection_1",
          requestedByUserId: "owner_1",
          status: "completed",
          totalItems: 2,
          materializedCount: 2,
          duplicateCount: 0,
          skippedCount: 0,
          failedCount: 0,
          startedAt: "2026-07-18T15:01:00.000Z",
          completedAt: "2026-07-18T15:01:02.000Z",
          createdAt: "2026-07-18T15:00:59.000Z",
          updatedAt: "2026-07-18T15:01:02.000Z",
        },
      }),
    );

    const element = await InboundWebhookReplayPage({
      params: Promise.resolve({ connectionId: "connection_1" }),
    });
    const html = render(element);

    expect(html).toContain("Elegiveis agora");
    expect(html).toContain(">10<");
    expect(html).toContain("Resultado do replay");
    expect(html).toContain("Materializados");
    expect(html).toContain("Autorizar replay");
    expect(html).toContain(
      "Digite exatamente <strong>observacao inicial</strong>",
    );
    expect(html).toContain('name="confirmation"');
    expect(html).toContain('name="connectionId"');
    expect(html).not.toContain("Certificar parser");
  });

  it("keeps denied or missing connections behind a generic message", async () => {
    const sensitiveFailure =
      "workspace_very_secret could not decrypt payload at internal-host";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ message: sensitiveFailure }, 403),
    );

    const element = await InboundWebhookReplayPage({
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
