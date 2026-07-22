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

import { authorizeInboundWebhookProductionRecoveryAction } from "../src/app/(backoffice)/backoffice/inbound-webhooks/recovery/actions";

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

describe("inbound webhook production recovery actions", () => {
  it("sends only the selected channel, canary and exact confirmation", async () => {
    serverApiFetch.mockResolvedValueOnce({
      selected: 5,
      persisted: 5,
      queued: 5,
      existing: 0,
      queueFailures: 0,
    });

    const result = await authorizeInboundWebhookProductionRecoveryAction(
      previousState,
      form({
        connectionId: "connection_1",
        channelId: "channel_1",
        confirmation: "Umbler Comercial",
        selection: "canary_5",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/connections/connection_1/production-recovery",
      {
        method: "POST",
        body: JSON.stringify({
          channelId: "channel_1",
          confirmation: "Umbler Comercial",
          selection: "canary_5",
        }),
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/recovery/connection_1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice/inbound-webhooks");
    expect(result).toMatchObject({
      status: "success",
      message: "5 evento(s) entrou(aram) na fila normal de producao.",
    });
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("payload");
    expect(JSON.stringify(serverApiFetch.mock.calls)).not.toContain("ctwa");
  });

  it("rejects malformed data before reaching the API", async () => {
    const result = await authorizeInboundWebhookProductionRecoveryAction(
      previousState,
      form({
        connectionId: "connection_1",
        channelId: "",
        confirmation: "Umbler Comercial",
        selection: "all",
      }),
    );

    expect(serverApiFetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "error",
      message: "Confirmacao invalida.",
    });
  });

  it("returns approved API guidance without exposing unexpected failures", async () => {
    serverApiFetch.mockRejectedValueOnce({
      status: 409,
      message: "Recuperacao de producao desativada",
    });

    const expectedFailure =
      await authorizeInboundWebhookProductionRecoveryAction(
        previousState,
        form({
          connectionId: "connection_1",
          channelId: "channel_1",
          confirmation: "Umbler Comercial",
          selection: "canary_1",
        }),
      );

    expect(expectedFailure.message).toBe("Recuperacao de producao desativada");

    serverApiFetch.mockRejectedValueOnce(
      new Error("database password at internal-host"),
    );

    const unexpectedFailure =
      await authorizeInboundWebhookProductionRecoveryAction(
        previousState,
        form({
          connectionId: "connection_1",
          channelId: "channel_1",
          confirmation: "Umbler Comercial",
          selection: "canary_1",
        }),
      );

    expect(unexpectedFailure.message).toBe(
      "Nao foi possivel autorizar a recuperacao de producao.",
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
