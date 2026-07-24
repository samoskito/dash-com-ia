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
  reevaluateProviderConversionDecisionAction,
  retryProviderConversionDeliveryAction,
} from "../src/app/(backoffice)/backoffice/inbound-webhooks/actions";

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

describe("provider conversion trace actions", () => {
  it("retries the exact Meta log through the protected diagnostics endpoint", async () => {
    serverApiFetch.mockResolvedValueOnce({ status: "queued" });

    const result = await retryProviderConversionDeliveryAction(
      previousState,
      form({ conversionEventLogId: "meta_log_1" }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/diagnostics/conversions/meta_log_1/retry",
      {
        method: "POST",
        body: JSON.stringify({
          reason:
            "Retry de falha transitoria solicitado pela auditoria unificada",
        }),
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/conversions",
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice");
    expect(result).toMatchObject({
      status: "success",
      message: "Evento encaminhado para uma nova tentativa com a Meta.",
    });
  });

  it("rejects malformed ids and redacts unexpected failures", async () => {
    const invalid = await retryProviderConversionDeliveryAction(
      previousState,
      form({ conversionEventLogId: "" }),
    );

    expect(serverApiFetch).not.toHaveBeenCalled();
    expect(invalid).toMatchObject({
      status: "error",
      message: "Evento Meta invalido.",
    });

    serverApiFetch.mockRejectedValueOnce(
      new Error("database password at internal-host"),
    );

    const unexpected = await retryProviderConversionDeliveryAction(
      previousState,
      form({ conversionEventLogId: "meta_log_1" }),
    );

    expect(unexpected.message).toBe(
      "Nao foi possivel reenviar este evento para a Meta.",
    );
    expect(unexpected.message).not.toContain("database password");
  });

  it("creates an explicit business reevaluation with one idempotency key", async () => {
    serverApiFetch.mockResolvedValueOnce({
      previousDecisionId: "decision_1",
      decisionId: "decision_2",
      decisionVersion: 2,
      status: "reevaluated",
      executionIds: ["execution_1"],
      eligibleExecutionIds: ["execution_1"],
    });

    const result = await reevaluateProviderConversionDecisionAction(
      previousState,
      form({
        decisionId: "decision_1",
        requestKey: "backoffice:decision_1:request_123456",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/inbound-webhooks/conversion-traces/decision_1/reevaluate",
      {
        method: "POST",
        body: JSON.stringify({
          requestKey: "backoffice:decision_1:request_123456",
        }),
      },
    );
    expect(result).toMatchObject({
      status: "success",
      message: "Decisao v2 criada e encaminhada para envio.",
    });
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}
