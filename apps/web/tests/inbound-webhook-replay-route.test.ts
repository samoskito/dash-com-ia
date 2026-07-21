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
    productionActivatedAt: null,
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
  nextPayloadExpiresAt: null,
  channels: [
    {
      id: "channel_1",
      displayName: "Central de Vendas",
      connectedPhone: "+551143377011",
      totalCtwa: 50,
      routeResolved: 0,
      routeUnresolved: 50,
      payloadAvailable: 50,
      alreadyMaterialized: 0,
      eligible: 0,
    },
  ],
  latestBatch: null,
  recentBatches: [],
} as const;

afterEach(() => {
  vi.useRealTimers();
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
    expect(html).not.toContain("Autorizar lote");
    expect(html).not.toContain("contact@example.com");
    expect(html).not.toContain("+5521981071538");
    expect(html).not.toContain("AfhlkOT");
  });

  it("requires the exact connection name when a certified batch is ready", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));

    const completedBatch = {
      id: "batch_1",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      requestedByUserId: "owner_1",
      status: "completed_with_failures",
      selection: "canary_5",
      requestedLimit: 5,
      totalItems: 5,
      materializedCount: 4,
      duplicateCount: 0,
      skippedCount: 0,
      failedCount: 1,
      retryableFailedCount: 1,
      retryCount: 0,
      lastRetriedAt: null,
      startedAt: "2026-07-18T15:01:00.000Z",
      completedAt: "2026-07-18T15:01:02.000Z",
      createdAt: "2026-07-18T15:00:59.000Z",
      updatedAt: "2026-07-18T15:01:02.000Z",
    } as const;

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
        channels: [
          {
            ...preview.channels[0],
            routeResolved: 12,
            routeUnresolved: 38,
            alreadyMaterialized: 2,
            eligible: 10,
          },
        ],
        nextPayloadExpiresAt: "2026-07-19T12:00:00.000Z",
        latestBatch: completedBatch,
        recentBatches: [completedBatch],
      }),
    );

    const element = await InboundWebhookReplayPage({
      params: Promise.resolve({ connectionId: "connection_1" }),
    });
    const html = render(element);

    expect(html).toContain("Elegiveis agora");
    expect(html).toContain(">10<");
    expect(html).toContain("1d 0h restantes");
    expect(html).toContain("Ultimos lotes");
    expect(html).toContain("Canario de 5");
    expect(html).toContain("Materializados");
    expect(html).toContain("Recuperar falhas");
    expect(html).toContain("Autorizar lote");
    expect(html).toContain('name="selection"');
    expect(html).toContain('value="canary_1"');
    expect(html).toContain('value="canary_5"');
    expect(html).toContain('value="canary_10"');
    expect(html).toContain('value="remaining"');
    expect(html).toContain(
      "Digite exatamente <strong>observacao inicial</strong>",
    );
    expect(html).toContain('name="confirmation"');
    expect(html).toContain('name="connectionId"');
    expect(html).toContain('name="channelId"');
    expect(html).toContain('value="channel_1"');
    expect(html).not.toContain("Certificar parser");
  });

  it("allows the historical gap replay while live production remains active", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        ...preview,
        connection: {
          ...preview.connection,
          parserReleaseStatus: "certified",
          status: "production",
          productionActivatedAt: "2026-07-18T12:30:00.000Z",
        },
        parserRelease: {
          ...preview.parserRelease,
          status: "certified",
          certifiedAt: "2026-07-18T12:00:00.000Z",
        },
        replayEnabled: true,
        counts: {
          ...preview.counts,
          routeResolved: 81,
          routeUnresolved: 0,
          alreadyMaterialized: 69,
          eligible: 12,
        },
        channels: [
          {
            ...preview.channels[0],
            totalCtwa: 81,
            routeResolved: 81,
            routeUnresolved: 0,
            alreadyMaterialized: 69,
            eligible: 12,
          },
        ],
      }),
    );

    const element = await InboundWebhookReplayPage({
      params: Promise.resolve({ connectionId: "connection_1" }),
    });
    const html = render(element);

    expect(html).toContain("Replay isolado da fila ao vivo");
    expect(html).toContain("Conexao em envio automatico");
    expect(html).toContain("apenas a lacuna historica");
    expect(html).toContain("Autorizar lote");
    expect(html).toContain(">12<");
    expect(html).not.toContain(
      "Retome a conexao em observacao antes do replay.",
    );
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
