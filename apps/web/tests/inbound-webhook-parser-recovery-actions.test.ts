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

import { recoverInboundWebhookParserBatchAction } from "../src/app/(backoffice)/backoffice/inbound-webhooks/parser-recovery/actions";

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

describe("inbound webhook parser recovery actions", () => {
  it("sends only the exact connection confirmation and bounded selection", async () => {
    serverApiFetch.mockResolvedValueOnce({
      connectionId: "connection_1",
      selection: "canary_10",
      requestedLimit: 10,
      selected: 10,
      claimed: 10,
      queued: 10,
      existing: 0,
      queueFailures: 0,
      remainingRecoverable: 2_048,
    });

    const result = await recoverInboundWebhookParserBatchAction(
      previousState,
      form({
        connectionId: "connection_1",
        confirmation: "Unidade Itaborai",
        selection: "canary_10",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/connections/connection_1/parser-recovery",
      {
        method: "POST",
        body: JSON.stringify({
          confirmation: "Unidade Itaborai",
          selection: "canary_10",
        }),
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/parser-recovery/connection_1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice/inbound-webhooks");
    expect(result).toMatchObject({
      status: "success",
      message:
        "10 entrega(s) entrou(aram) na fila do parser. Restam 2048 recuperavel(is).",
    });
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("payload");
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("ctwa");
  });

  it("rejects unbounded or malformed selections before reaching the API", async () => {
    const result = await recoverInboundWebhookParserBatchAction(
      previousState,
      form({
        connectionId: "connection_1",
        confirmation: "Unidade Itaborai",
        selection: "all",
      }),
    );

    expect(serverApiFetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "error",
      message: "Confirmacao invalida.",
    });
  });

  it("keeps failed queue items visible for another safe attempt", async () => {
    serverApiFetch.mockResolvedValueOnce({
      connectionId: "connection_1",
      selection: "batch_100",
      requestedLimit: 100,
      selected: 100,
      claimed: 100,
      queued: 98,
      existing: 0,
      queueFailures: 2,
      remainingRecoverable: 1_960,
    });

    const result = await recoverInboundWebhookParserBatchAction(
      previousState,
      form({
        connectionId: "connection_1",
        confirmation: "Unidade Itaborai",
        selection: "batch_100",
      }),
    );

    expect(result.message).toContain(
      "2 entrega(s) permanecem protegidas e a fila interna tentara novamente.",
    );
  });

  it("returns approved API guidance without exposing unexpected failures", async () => {
    serverApiFetch.mockRejectedValueOnce({
      status: 409,
      message: "O parser desta conexao nao esta disponivel",
    });

    const expectedFailure = await recoverInboundWebhookParserBatchAction(
      previousState,
      form({
        connectionId: "connection_1",
        confirmation: "Unidade Itaborai",
        selection: "canary_10",
      }),
    );

    expect(expectedFailure.message).toBe(
      "O parser desta conexao nao esta disponivel",
    );

    serverApiFetch.mockRejectedValueOnce(
      new Error("database password at internal-host"),
    );

    const unexpectedFailure = await recoverInboundWebhookParserBatchAction(
      previousState,
      form({
        connectionId: "connection_1",
        confirmation: "Unidade Itaborai",
        selection: "canary_10",
      }),
    );

    expect(unexpectedFailure.message).toBe(
      "Nao foi possivel iniciar a recuperacao do parser.",
    );
    expect(unexpectedFailure.message).not.toContain("database password");
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}
