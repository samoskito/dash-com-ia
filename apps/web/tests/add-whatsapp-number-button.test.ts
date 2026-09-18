// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { WorkspaceAddWhatsappNumberDto } from "@wpptrack/shared";
import {
  createIntentKeyStore,
  describeAddNumberState,
  resolveCheckoutRedirect,
  runAddNumberIntent,
  shouldSuppressSubmit,
  AddWhatsappNumberButton,
} from "../src/app/(app)/subscription/add-whatsapp-number-button";
import { GENERIC_ERROR_MESSAGE } from "../src/app/(app)/subscription/add-whatsapp-number-messages";

const { addWhatsappNumberAction, routerRefresh } = vi.hoisted(() => ({
  addWhatsappNumberAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("../src/app/(app)/subscription/add-whatsapp-number-action", () => ({
  addWhatsappNumberAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

const baseResult = {
  subscriptionId: "subscription_1",
  itemId: "item_1",
  chargeId: "charge_1",
  addedCapacity: 0,
  capacity: 1,
  monthlyPriceCents: 3000,
  paymentAmountCents: 3000,
  checkoutUrl: "https://asaas.example.test/checkout_1",
  externalPaymentId: "payment_1",
  status: "awaiting_payment" as const,
};

function makeResult(
  overrides: Partial<WorkspaceAddWhatsappNumberDto> = {},
): WorkspaceAddWhatsappNumberDto {
  return { ...baseResult, ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderButton(
  props: Partial<{ disabled: boolean; disabledReason: string | null }> = {},
) {
  return render(
    React.createElement(AddWhatsappNumberButton, {
      disabled: false,
      disabledReason: null,
      ...props,
    }),
  );
}

let uuidCounter: number;
let assignSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  uuidCounter = 0;
  // Deterministic, sequential UUIDs so the tests can assert "one key per
  // intent" and "a fresh key for the next intent" precisely, instead of just
  // asserting that some string was generated.
  vi.stubGlobal("crypto", { randomUUID: () => `uuid-${++uuidCounter}` });
  // jsdom's window.location.assign is non-configurable, so it can't be
  // spied on directly; replace the whole location object (redefined fresh
  // every test) with one whose assign is a plain spy, so the redirect
  // effect can be asserted without jsdom throwing "not implemented".
  assignSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: assignSpy },
  });
});

afterEach(() => {
  cleanup();
  addWhatsappNumberAction.mockReset();
  routerRefresh.mockReset();
  vi.unstubAllGlobals();
});

describe("describeAddNumberState", () => {
  it("shows the idle call-to-action when nothing has happened yet", () => {
    const view = describeAddNumberState({
      phase: "idle",
      externallyDisabled: false,
      disabledReason: null,
      errorMessage: null,
      result: null,
    });

    expect(view).toEqual({
      label: "Adicionar numero (R$ 30,00/mes)",
      disabled: false,
      busy: false,
      statusMessage: "",
      statusRole: "status",
    });
  });

  it("disables the action and surfaces the reason when the caller is ineligible", () => {
    const view = describeAddNumberState({
      phase: "idle",
      externallyDisabled: true,
      disabledReason: "Disponivel apenas com assinatura ativa.",
      errorMessage: null,
      result: null,
    });

    expect(view.disabled).toBe(true);
    expect(view.statusMessage).toBe("Disponivel apenas com assinatura ativa.");
    expect(view.statusRole).toBe("status");
  });

  it("marks the button busy and disabled while the request is pending, blocking duplicate submissions", () => {
    const view = describeAddNumberState({
      phase: "pending",
      externallyDisabled: false,
      disabledReason: null,
      errorMessage: null,
      result: null,
    });

    expect(view.busy).toBe(true);
    expect(view.disabled).toBe(true);
    expect(view.statusMessage).toContain("R$ 30,00");
  });

  it("shows a retry label and an alert-role message on error, without disabling retry", () => {
    const view = describeAddNumberState({
      phase: "error",
      externallyDisabled: false,
      disabledReason: null,
      errorMessage: "Nao foi possivel adicionar o numero agora.",
      result: null,
    });

    expect(view.label).toBe("Tentar novamente");
    expect(view.disabled).toBe(false);
    expect(view.statusRole).toBe("alert");
    expect(view.statusMessage).toBe("Nao foi possivel adicionar o numero agora.");
  });

  it("honestly reports a pending payment without claiming the number is active", () => {
    const view = describeAddNumberState({
      phase: "success",
      externallyDisabled: false,
      disabledReason: null,
      errorMessage: null,
      result: { ...baseResult, status: "awaiting_payment" },
    });

    expect(view.statusMessage).toContain("Pagamento pendente");
    expect(view.statusMessage).not.toMatch(/ativo/iu);
    expect(view.statusRole).toBe("status");
  });

  it("reports the number as active only when the backend confirms status active", () => {
    const view = describeAddNumberState({
      phase: "success",
      externallyDisabled: false,
      disabledReason: null,
      errorMessage: null,
      result: { ...baseResult, status: "active", addedCapacity: 1 },
    });

    expect(view.statusMessage).toContain("ativo");
    expect(view.statusMessage).not.toContain("Pagamento pendente");
  });
});

describe("shouldSuppressSubmit", () => {
  it("allows the submit when nothing is in flight, pending, or externally disabled", () => {
    expect(
      shouldSuppressSubmit({ inFlight: false, isPending: false, disabled: false }),
    ).toBe(false);
  });

  it("suppresses a second synchronous call while the first is still in flight, before isPending has caught up", () => {
    // This is the exact race the fix targets: isPending is render-derived and
    // has not flipped true yet for a second click fired in the same tick.
    expect(
      shouldSuppressSubmit({ inFlight: true, isPending: false, disabled: false }),
    ).toBe(true);
  });

  it("suppresses while React reports the transition pending", () => {
    expect(
      shouldSuppressSubmit({ inFlight: false, isPending: true, disabled: false }),
    ).toBe(true);
  });

  it("suppresses when externally disabled", () => {
    expect(
      shouldSuppressSubmit({ inFlight: false, isPending: false, disabled: true }),
    ).toBe(true);
  });
});

describe("createIntentKeyStore", () => {
  it("generates exactly one key per intent and returns the same key on every read until cleared", () => {
    let calls = 0;
    const store = createIntentKeyStore(() => `key-${++calls}`);

    const first = store.get();
    const second = store.get(); // simulates a same-intent retry

    expect(first).toBe("key-1");
    expect(second).toBe("key-1");
    expect(calls).toBe(1);
  });

  it("issues a fresh key for the next intent once the previous one is cleared (post-success)", () => {
    let calls = 0;
    const store = createIntentKeyStore(() => `key-${++calls}`);

    const first = store.get();
    store.clear();
    const second = store.get();

    expect(first).toBe("key-1");
    expect(second).toBe("key-2");
    expect(store.peek()).toBe("key-2");
  });
});

describe("runAddNumberIntent", () => {
  const okResult = { ...baseResult };

  it("passes a successful outcome through as a success effect", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: okResult });

    const effect = await runAddNumberIntent(action, "intent-key");

    expect(action).toHaveBeenCalledWith("intent-key");
    expect(effect).toEqual({ type: "success", data: okResult });
  });

  it("passes a classified failure's message through unchanged (401/403/409 mapping happens in the action)", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Sem permissao para gerenciar a cobranca deste workspace." });

    const effect = await runAddNumberIntent(action, "intent-key");

    expect(effect).toEqual({
      type: "error",
      message: "Sem permissao para gerenciar a cobranca deste workspace.",
    });
  });

  it("catches an unexpected rejection from the action call itself and maps it to the constant user-safe message", async () => {
    const action = vi.fn().mockRejectedValue(new TypeError("NetworkError when attempting to fetch resource."));

    const effect = await runAddNumberIntent(action, "intent-key");

    expect(effect).toEqual({ type: "error", message: GENERIC_ERROR_MESSAGE });
  });

  it("never leaks the raw rejection message to the UI", async () => {
    const action = vi.fn().mockRejectedValue(new Error("Prisma: connection terminated unexpectedly"));

    const effect = await runAddNumberIntent(action, "intent-key");

    expect(effect.type).toBe("error");
    if (effect.type === "error") {
      expect(effect.message).not.toMatch(/Prisma/iu);
      expect(effect.message).toBe(GENERIC_ERROR_MESSAGE);
    }
  });
});

describe("resolveCheckoutRedirect", () => {
  const awaitingPayment = { ...baseResult };

  it("redirects to the exact checkout URL the backend returned for an awaiting_payment result", () => {
    expect(resolveCheckoutRedirect(awaitingPayment, null)).toBe(
      "https://asaas.example.test/checkout_1",
    );
  });

  it("never redirects for an active result, and never claims activation via redirect", () => {
    const active = { ...awaitingPayment, status: "active" as const };
    expect(resolveCheckoutRedirect(active, null)).toBeNull();
  });

  it("does not redirect when there is no result yet", () => {
    expect(resolveCheckoutRedirect(null, null)).toBeNull();
  });

  it("does not redirect when awaiting_payment carries no checkoutUrl", () => {
    const noUrl = { ...awaitingPayment, checkoutUrl: "" };
    expect(resolveCheckoutRedirect(noUrl, null)).toBeNull();
  });

  it("does not re-fire the redirect for the same result object it already redirected for", () => {
    expect(resolveCheckoutRedirect(awaitingPayment, awaitingPayment)).toBeNull();
  });
});

describe("AddWhatsappNumberButton (rendered)", () => {
  it("renders enabled with an empty polite status region when idle", () => {
    renderButton();

    const button = screen.getByRole("button", {
      name: "Adicionar numero (R$ 30,00/mes)",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("disables the button and surfaces the reason when externally disabled", () => {
    renderButton({
      disabled: true,
      disabledReason: "Disponivel apenas com assinatura ativa.",
    });

    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      "Disponivel apenas com assinatura ativa.",
    );
  });

  it("sets aria-busy and disables the button while the request is pending, then clears both on completion", async () => {
    const gate = deferred<{ ok: true; data: WorkspaceAddWhatsappNumberDto }>();
    addWhatsappNumberAction.mockReturnValueOnce(gate.promise);
    const user = userEvent.setup();

    renderButton();
    const button = screen.getByRole("button") as HTMLButtonElement;

    await user.click(button);

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("R$ 30,00");

    gate.resolve({ ok: true, data: makeResult() });

    await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("false"));
    expect(button.disabled).toBe(false);
  });

  it("suppresses a rapid duplicate click fired before isPending catches up", async () => {
    const gate = deferred<{ ok: true; data: WorkspaceAddWhatsappNumberDto }>();
    addWhatsappNumberAction.mockReturnValue(gate.promise);

    renderButton();
    const button = screen.getByRole("button");

    // Two synchronous clicks in the same tick, mirroring the exact race
    // shouldSuppressSubmit guards against: inFlightRef is set synchronously
    // before isPending has a chance to flip.
    fireEvent.click(button);
    fireEvent.click(button);

    expect(addWhatsappNumberAction).toHaveBeenCalledTimes(1);

    // Settle the transition before the test ends: React's transition
    // scheduling is a shared, module-level concern, so leaving this promise
    // permanently unresolved would leak a stuck-pending lane into later
    // tests instead of just this component instance.
    gate.resolve({ ok: true, data: makeResult() });
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("false"));
  });

  it("generates exactly one UUID per intent and reuses it for a same-intent retry after an unexpected rejection", async () => {
    addWhatsappNumberAction.mockRejectedValueOnce(new TypeError("network down"));
    const user = userEvent.setup();

    renderButton();
    const button = screen.getByRole("button") as HTMLButtonElement;

    await user.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(GENERIC_ERROR_MESSAGE);
    // Safe recovery: the failed request does not leave the button stuck busy
    // or disabled, so the user can actually retry.
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");

    addWhatsappNumberAction.mockResolvedValueOnce({ ok: true, data: makeResult() });
    await user.click(button);

    await waitFor(() => expect(addWhatsappNumberAction).toHaveBeenCalledTimes(2));
    const [firstKey] = addWhatsappNumberAction.mock.calls[0];
    const [secondKey] = addWhatsappNumberAction.mock.calls[1];
    expect(secondKey).toBe(firstKey);
    expect(uuidCounter).toBe(1);
  });

  it("issues a fresh UUID for the next intent once the previous one succeeds, and redirects only to the returned checkoutUrl", async () => {
    addWhatsappNumberAction.mockResolvedValueOnce({
      ok: true,
      data: makeResult({ checkoutUrl: "https://asaas.example.test/checkout_first" }),
    });
    const user = userEvent.setup();

    renderButton();
    const button = screen.getByRole("button");

    await user.click(button);

    await waitFor(() => expect(assignSpy).toHaveBeenCalledTimes(1));
    expect(assignSpy).toHaveBeenCalledWith(
      "https://asaas.example.test/checkout_first",
    );
    expect(routerRefresh).toHaveBeenCalledTimes(1);

    addWhatsappNumberAction.mockResolvedValueOnce({
      ok: true,
      data: makeResult({ checkoutUrl: "https://asaas.example.test/checkout_second" }),
    });
    await user.click(button);

    await waitFor(() => expect(assignSpy).toHaveBeenCalledTimes(2));
    expect(assignSpy).toHaveBeenLastCalledWith(
      "https://asaas.example.test/checkout_second",
    );

    const [firstKey] = addWhatsappNumberAction.mock.calls[0];
    const [secondKey] = addWhatsappNumberAction.mock.calls[1];
    expect(secondKey).not.toBe(firstKey);
    expect(uuidCounter).toBe(2);
  });

  it("never redirects when the backend reports the number as already active", async () => {
    addWhatsappNumberAction.mockResolvedValueOnce({
      ok: true,
      data: makeResult({ status: "active", addedCapacity: 1 }),
    });
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("ativo"),
    );
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("activates the action via the Enter key when focused, like a native button", async () => {
    addWhatsappNumberAction.mockResolvedValueOnce({ ok: true, data: makeResult() });
    const user = userEvent.setup();

    renderButton();
    const button = screen.getByRole("button") as HTMLButtonElement;
    button.focus();

    await user.keyboard("{Enter}");

    await waitFor(() => expect(addWhatsappNumberAction).toHaveBeenCalledTimes(1));
  });

  it("activates the action via the Space key when focused, like a native button", async () => {
    addWhatsappNumberAction.mockResolvedValueOnce({ ok: true, data: makeResult() });
    const user = userEvent.setup();

    renderButton();
    const button = screen.getByRole("button") as HTMLButtonElement;
    button.focus();

    await user.keyboard(" ");

    await waitFor(() => expect(addWhatsappNumberAction).toHaveBeenCalledTimes(1));
  });
});
