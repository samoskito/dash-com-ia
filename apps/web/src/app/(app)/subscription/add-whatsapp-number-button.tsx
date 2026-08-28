"use client";

import type { WorkspaceAddWhatsappNumberDto } from "@wpptrack/shared";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addWhatsappNumberAction,
  type AddWhatsappNumberActionResult,
} from "./add-whatsapp-number-action";
import { GENERIC_ERROR_MESSAGE } from "./add-whatsapp-number-messages";

export type AddNumberPhase = "idle" | "pending" | "success" | "error";

/**
 * One idempotency key per user intent. Reused across retries of that same
 * intent (see add-whatsapp-number-action.ts docs); cleared once the intent
 * lands so the next submission starts a fresh charge attempt. Kept as a
 * plain closure (not React state/ref) so the dedup rule itself can be unit
 * tested without mounting a component.
 */
export function createIntentKeyStore(
  generateKey: () => string = defaultGenerateKey,
) {
  let current: string | null = null;
  return {
    get(): string {
      if (!current) {
        current = generateKey();
      }
      return current;
    },
    clear(): void {
      current = null;
    },
    peek(): string | null {
      return current;
    },
  };
}

function defaultGenerateKey(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : fallbackUuid();
}

/**
 * Synchronous reentrancy guard. `isPending` from useTransition is
 * render-derived: two clicks (or two programmatic calls) fired back to back
 * within the same tick both see `isPending === false`, because the pending
 * state only flips on the next commit. `inFlight` is checked and set
 * synchronously by the caller before any await, so the second call is
 * suppressed even though isPending hasn't caught up yet.
 */
export function shouldSuppressSubmit(state: {
  inFlight: boolean;
  isPending: boolean;
  disabled: boolean;
}): boolean {
  return state.inFlight || state.isPending || state.disabled;
}

export type AddNumberIntentEffect =
  | { type: "success"; data: WorkspaceAddWhatsappNumberDto }
  | { type: "error"; message: string };

/**
 * Runs one intent against the server action and normalizes the result,
 * including the case the action itself never returns: an unexpected
 * rejection (e.g. the client-to-server-action call itself failing) is
 * caught here and mapped to the same user-safe, constant PT-BR message used
 * for other unclassified failures, instead of surfacing raw error text or
 * leaving the caller with an unhandled rejection.
 */
export async function runAddNumberIntent(
  action: (
    idempotencyKey: string,
  ) => Promise<AddWhatsappNumberActionResult>,
  idempotencyKey: string,
): Promise<AddNumberIntentEffect> {
  try {
    const outcome = await action(idempotencyKey);
    return outcome.ok
      ? { type: "success", data: outcome.data }
      : { type: "error", message: outcome.message };
  } catch {
    return { type: "error", message: GENERIC_ERROR_MESSAGE };
  }
}

/**
 * Decides whether a result should redirect to Asaas checkout. Only ever
 * points at the checkout URL the backend actually returned for this result,
 * never a guessed/derived one, and never claims activation: a status of
 * "active" (or a missing checkoutUrl) never redirects. Also guards against
 * re-firing the redirect for the same result object across re-renders.
 */
export function resolveCheckoutRedirect(
  result: WorkspaceAddWhatsappNumberDto | null,
  alreadyRedirectedFor: WorkspaceAddWhatsappNumberDto | null,
): string | null {
  if (!result || result.status !== "awaiting_payment" || !result.checkoutUrl) {
    return null;
  }
  if (alreadyRedirectedFor === result) {
    return null;
  }
  return result.checkoutUrl;
}

export type AddNumberViewState = {
  label: string;
  disabled: boolean;
  busy: boolean;
  statusMessage: string;
  statusRole: "status" | "alert";
};

/**
 * Pure view-state derivation, kept outside the component so it can be unit
 * tested without a DOM. Never claims the number is active unless the
 * backend response itself reports status "active".
 */
export function describeAddNumberState({
  phase,
  externallyDisabled,
  disabledReason,
  errorMessage,
  result,
}: {
  phase: AddNumberPhase;
  externallyDisabled: boolean;
  disabledReason: string | null;
  errorMessage: string | null;
  result: WorkspaceAddWhatsappNumberDto | null;
}): AddNumberViewState {
  const busy = phase === "pending";
  const label =
    phase === "error" ? "Tentar novamente" : "Adicionar numero (R$ 30,00/mes)";
  const disabled = busy || externallyDisabled;

  let statusMessage = "";
  let statusRole: "status" | "alert" = "status";

  if (busy) {
    statusMessage = "Criando cobranca de R$ 30,00 para o numero adicional.";
  } else if (phase === "error" && errorMessage) {
    statusMessage = errorMessage;
    statusRole = "alert";
  } else if (phase === "success" && result) {
    statusMessage =
      result.status === "active"
        ? "Numero adicional ativo. A capacidade do pacote foi aumentada."
        : "Pagamento pendente. Conclua o pagamento de R$ 30,00 para ativar este numero.";
  } else if (externallyDisabled && disabledReason) {
    statusMessage = disabledReason;
  }

  return { label, disabled, busy, statusMessage, statusRole };
}

export function AddWhatsappNumberButton({
  disabled,
  disabledReason,
}: {
  disabled: boolean;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<WorkspaceAddWhatsappNumberDto | null>(
    null,
  );
  const intentKeyStoreRef = useRef(createIntentKeyStore());
  const inFlightRef = useRef(false);
  const redirectedForResultRef = useRef<WorkspaceAddWhatsappNumberDto | null>(
    null,
  );

  useEffect(() => {
    const checkoutUrl = resolveCheckoutRedirect(
      result,
      redirectedForResultRef.current,
    );
    if (checkoutUrl && result) {
      redirectedForResultRef.current = result;
      window.location.assign(checkoutUrl);
    }
  }, [result]);

  function submitIntent() {
    if (shouldSuppressSubmit({ inFlight: inFlightRef.current, isPending, disabled })) {
      return;
    }

    const idempotencyKey = intentKeyStoreRef.current.get();
    inFlightRef.current = true;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const effect = await runAddNumberIntent(
          addWhatsappNumberAction,
          idempotencyKey,
        );
        if (effect.type === "success") {
          intentKeyStoreRef.current.clear();
          setResult(effect.data);
          router.refresh();
        } else {
          setErrorMessage(effect.message);
        }
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  const phase: AddNumberPhase = isPending
    ? "pending"
    : errorMessage
      ? "error"
      : result
        ? "success"
        : "idle";
  const view = describeAddNumberState({
    phase,
    externallyDisabled: disabled,
    disabledReason,
    errorMessage,
    result,
  });

  return (
    <div className="package-add-number">
      <button
        type="button"
        className="button primary"
        onClick={submitIntent}
        disabled={view.disabled}
        aria-busy={view.busy}
      >
        {view.busy ? "Adicionando..." : view.label}
      </button>
      {view.statusRole === "alert" ? (
        <div className="feedback-banner error" role="alert">
          <strong>Nao foi possivel adicionar o numero</strong>
          <span>{view.statusMessage}</span>
        </div>
      ) : (
        <span className="form-status" role="status" aria-live="polite">
          {view.statusMessage}
        </span>
      )}
    </div>
  );
}

function fallbackUuid(): string {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/gu, (char) => {
    const value = Number(char);
    const random = (Math.random() * 16) | 0;
    const output = value === 0 ? random : (value & 0x3) | 0x8;
    return output.toString(16);
  });
}
