import { afterEach, describe, expect, it, vi } from "vitest";

const { isApiRequestError, revalidatePath, serverApiFetch } = vi.hoisted(
  () => ({
    isApiRequestError: vi.fn(
      (error: unknown) =>
        error instanceof Error && error.name === "ApiRequestError",
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

import { addWhatsappNumberAction } from "../src/app/(app)/subscription/add-whatsapp-number-action";

function apiError(status: number, message = "backend detail"): Error {
  const error = new Error(message);
  error.name = "ApiRequestError";
  Object.assign(error, { status });
  return error;
}

afterEach(() => {
  revalidatePath.mockReset();
  serverApiFetch.mockReset();
});

describe("addWhatsappNumberAction", () => {
  it("sends the idempotency key only as a header, with an empty JSON body", async () => {
    serverApiFetch.mockResolvedValueOnce({
      subscriptionId: "subscription_1",
      itemId: "item_1",
      chargeId: "charge_1",
      addedCapacity: 0,
      capacity: 1,
      monthlyPriceCents: 3000,
      paymentAmountCents: 3000,
      checkoutUrl: "https://asaas.example.test/checkout_1",
      externalPaymentId: "payment_1",
      status: "awaiting_payment",
    });

    const result = await addWhatsappNumberAction("intent-key-1");

    expect(serverApiFetch).toHaveBeenCalledWith("/billing/package/add-number", {
      method: "POST",
      headers: { "Idempotency-Key": "intent-key-1" },
      body: JSON.stringify({}),
    });
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ status: "awaiting_payment" }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/subscription");
  });

  it("never places the idempotency key inside the request body", async () => {
    serverApiFetch.mockResolvedValueOnce({ status: "active" });

    await addWhatsappNumberAction("intent-key-body-check");

    const [, init] = serverApiFetch.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({}));
    expect(init.body).not.toContain("intent-key-body-check");
  });

  it("reuses the exact same key across a retry of the same intent", async () => {
    serverApiFetch.mockRejectedValueOnce(apiError(409));
    serverApiFetch.mockResolvedValueOnce({ status: "awaiting_payment" });

    const first = await addWhatsappNumberAction("retry-intent-key");
    expect(first.ok).toBe(false);

    const second = await addWhatsappNumberAction("retry-intent-key");
    expect(second.ok).toBe(true);

    expect(serverApiFetch).toHaveBeenNthCalledWith(
      1,
      "/billing/package/add-number",
      { method: "POST", headers: { "Idempotency-Key": "retry-intent-key" }, body: JSON.stringify({}) },
    );
    expect(serverApiFetch).toHaveBeenNthCalledWith(
      2,
      "/billing/package/add-number",
      { method: "POST", headers: { "Idempotency-Key": "retry-intent-key" }, body: JSON.stringify({}) },
    );
  });

  it("rejects a blank idempotency key before calling the API", async () => {
    const result = await addWhatsappNumberAction("   ");

    expect(result).toEqual({
      ok: false,
      message:
        "Nao foi possivel adicionar o numero agora. Tente novamente em instantes.",
    });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("maps a 401 to a constant session-expired message, not the backend text", async () => {
    serverApiFetch.mockRejectedValueOnce(apiError(401, "jwt malformed at line 42"));

    const result = await addWhatsappNumberAction("intent-key-401");

    expect(result).toEqual({
      ok: false,
      message: "Sua sessao expirou. Faca login novamente para continuar.",
    });
  });

  it("maps a 403 to a constant permission message, not the backend text", async () => {
    serverApiFetch.mockRejectedValueOnce(
      apiError(403, "Sem permissao para gerenciar cobranca"),
    );

    const result = await addWhatsappNumberAction("intent-key-403");

    expect(result).toEqual({
      ok: false,
      message: "Sem permissao para gerenciar a cobranca deste workspace.",
    });
  });

  it("maps a 409 to a constant conflict message, not the backend text", async () => {
    serverApiFetch.mockRejectedValueOnce(
      apiError(409, "Dados de cobranca Asaas incompletos"),
    );

    const result = await addWhatsappNumberAction("intent-key-409");

    expect(result).toEqual({
      ok: false,
      message:
        "Nao foi possivel adicionar o numero agora. Verifique o contrato e os dados de cobranca.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/Asaas/iu);
      expect(result.message).not.toMatch(/Prisma/iu);
    }
  });

  it("maps a 400 validation error to a constant message", async () => {
    serverApiFetch.mockRejectedValueOnce(
      apiError(400, "Solicitacao de numero invalida"),
    );

    const result = await addWhatsappNumberAction("intent-key-400");

    expect(result).toEqual({
      ok: false,
      message: "Solicitacao invalida. Atualize a pagina e tente novamente.",
    });
  });

  it("maps an unexpected internal error (5xx) to the constant fallback message without leaking details", async () => {
    serverApiFetch.mockRejectedValueOnce(
      apiError(500, "PrismaClientKnownRequestError: connection terminated"),
    );

    const result = await addWhatsappNumberAction("intent-key-500");

    expect(result).toEqual({
      ok: false,
      message:
        "Nao foi possivel adicionar o numero agora. Tente novamente em instantes.",
    });
  });

  it("maps a network failure (non ApiRequestError) to a constant offline message", async () => {
    serverApiFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await addWhatsappNumberAction("intent-key-network");

    expect(result).toEqual({
      ok: false,
      message: "Falha de conexao. Verifique sua internet e tente novamente.",
    });
  });
});
