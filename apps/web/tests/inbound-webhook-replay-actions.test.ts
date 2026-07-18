import { afterEach, describe, expect, it, vi } from "vitest";

const { isApiRequestError, revalidatePath, serverApiFetch } = vi.hoisted(
  () => ({
    isApiRequestError: vi.fn(
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        "message" in error,
    ),
    revalidatePath: vi.fn(),
    serverApiFetch: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../src/lib/server-api", () => ({
  isApiRequestError,
  serverApiFetch,
}));

import {
  authorizeInboundWebhookReplayAction,
  certifyInboundWebhookParserAction,
  retryInboundWebhookReplayAction,
} from "../src/app/(backoffice)/backoffice/inbound-webhooks/replay/actions";

const previousState = {
  status: "idle" as const,
  message: "",
  nonce: 0,
};

afterEach(() => {
  isApiRequestError.mockClear();
  revalidatePath.mockReset();
  serverApiFetch.mockReset();
});

describe("inbound webhook replay actions", () => {
  it("certifies an exact parser release and refreshes only the replay page", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "parser_1",
      status: "certified",
    });

    const result = await certifyInboundWebhookParserAction(
      previousState,
      form({
        connectionId: "connection_1",
        releaseId: "parser_1",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/parser-releases/parser_1/certify",
      {
        method: "POST",
        body: "{}",
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/replay/connection_1",
    );
    expect(result).toMatchObject({
      status: "success",
      message: "Parser certificado com evidencia CTWA real.",
    });
  });

  it("authorizes identifiers and the typed connection name only", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "batch_1",
      totalItems: 12,
    });

    const result = await authorizeInboundWebhookReplayAction(
      previousState,
      form({
        connectionId: "connection_1",
        confirmation: "observacao inicial",
        selection: "canary_1",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/connections/connection_1/replay",
      {
        method: "POST",
        body: JSON.stringify({
          confirmation: "observacao inicial",
          selection: "canary_1",
        }),
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/replay/connection_1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice/inbound-webhooks");
    expect(result).toMatchObject({
      status: "success",
      message: "12 evento(s) autorizado(s) para replay controlado.",
    });
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("phone");
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("payload");
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("ctwa");
  });

  it("rejects malformed identifiers before reaching the API", async () => {
    const result = await authorizeInboundWebhookReplayAction(
      previousState,
      form({
        connectionId: "",
        confirmation: "observacao inicial",
      }),
    );

    expect(serverApiFetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "error",
      message: "Confirmacao invalida.",
    });
  });

  it("keeps unexpected API failures generic", async () => {
    serverApiFetch.mockRejectedValueOnce(
      new Error("database password at internal-host"),
    );

    const result = await authorizeInboundWebhookReplayAction(
      previousState,
      form({
        connectionId: "connection_1",
        confirmation: "observacao inicial",
        selection: "canary_1",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Nao foi possivel autorizar o replay.",
    });
    expect(result.message).not.toContain("database password");
  });

  it("retries a terminal batch without sending event data", async () => {
    serverApiFetch.mockResolvedValueOnce({
      id: "batch_1",
    });

    const result = await retryInboundWebhookReplayAction(
      previousState,
      form({
        connectionId: "connection_1",
        batchId: "batch_1",
        confirmation: "observacao inicial",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/connections/connection_1/replay-batches/batch_1/retry",
      {
        method: "POST",
        body: JSON.stringify({ confirmation: "observacao inicial" }),
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/replay/connection_1",
    );
    expect(result).toMatchObject({
      status: "success",
      message: "Lote batch_1 retornou para recuperacao controlada.",
    });
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("payload");
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("ctwa");
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}
