"use client";

import type { UazapiPackageProvisionDto } from "@wpptrack/shared";
import type { ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

export type PackageBillingActionState = {
  status: "idle" | "success" | "error";
  message: string;
  checkoutUrl?: string;
  provision?: UazapiPackageProvisionDto;
};

export type PackageBillingFormAction = (
  previousState: PackageBillingActionState,
  formData: FormData,
) => Promise<PackageBillingActionState>;

const initialState: PackageBillingActionState = {
  status: "idle",
  message: "",
};

export function PackageBillingActionForm({
  action,
  children,
  className,
  showProvisionResult = false,
}: {
  action: PackageBillingFormAction;
  children: ReactNode;
  className?: string;
  showProvisionResult?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [provision, setProvision] = useState<
    UazapiPackageProvisionDto | undefined
  >();
  const [pollingMessage, setPollingMessage] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success" && state.checkoutUrl) {
      window.location.assign(state.checkoutUrl);
    }
  }, [state.checkoutUrl, state.status]);

  useEffect(() => {
    setProvision(state.provision);
    setPollingMessage(null);
  }, [state.provision]);

  useEffect(() => {
    const currentStatus = provision?.connection.connectionStatus;
    const whatsappInstanceId =
      provision?.connection.whatsappInstanceId ?? null;
    if (
      !showProvisionResult ||
      !whatsappInstanceId ||
      (currentStatus !== "pending" && currentStatus !== "qr_required")
    ) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const maxAttempts = 48;

    const poll = async () => {
      attempts += 1;
      try {
        const next = await apiFetch<UazapiPackageProvisionDto>(
          `/billing/package/uazapi/instances/${encodeURIComponent(
            whatsappInstanceId,
          )}/status`,
        );
        if (cancelled) {
          return;
        }

        setProvision(next);
        if (
          next.connection.connectionStatus === "connected" ||
          next.connection.connectionStatus === "disconnected" ||
          next.connection.connectionStatus === "error"
        ) {
          return;
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      if (attempts >= maxAttempts) {
        setPollingMessage(
          "A verificacao automatica terminou. Atualize a pagina para consultar novamente.",
        );
        return;
      }

      timeoutId = setTimeout(poll, 2_500);
    };

    timeoutId = setTimeout(poll, 2_500);
    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    provision?.connection.connectionStatus,
    provision?.connection.whatsappInstanceId,
    showProvisionResult,
  ]);

  const qrCode = provision?.connection.qrCode ?? null;
  const qrImage = qrImageSource(qrCode);

  return (
    <>
      <form action={formAction} className={className}>
        {children}
      </form>
      {state.status !== "idle" ? (
        <div
          className={`feedback-banner${state.status === "error" ? " warn" : ""}`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {state.status === "success" ? "Acao concluida" : "Acao pendente"}
          </strong>
          <span>{state.message}</span>
        </div>
      ) : null}
      {showProvisionResult && provision ? (
        <section className="package-qr-result" aria-label="Conexao WhatsApp">
          <div>
            <span className="eyebrow">Conexao preparada</span>
            <strong>
              {connectionStatusLabel(provision.connection.connectionStatus)}
            </strong>
            <small>
              {pollingMessage ??
                provision.connection.message ??
                "A instancia foi criada e ocupa uma vaga do pacote."}
            </small>
            {provision.seat.status === "reserved" ? (
              <small>
                A vaga fica reservada ate a Uazapi confirmar a conexao.
              </small>
            ) : null}
          </div>
          {qrImage ? (
            <img src={qrImage} alt="QR code para conectar o WhatsApp" />
          ) : qrCode ? (
            <code>{qrCode}</code>
          ) : (
            <span className="status-chip warn">QR ainda nao emitido</span>
          )}
        </section>
      ) : null}
    </>
  );
}

function qrImageSource(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (
    value.startsWith("data:image/") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  ) {
    return value;
  }

  const compact = value.replace(/\s+/gu, "");
  if (/^[A-Za-z0-9+/]+=*$/u.test(compact) && compact.length > 200) {
    return `data:image/png;base64,${compact}`;
  }

  return null;
}

function connectionStatusLabel(
  status: UazapiPackageProvisionDto["connection"]["connectionStatus"],
): string {
  const labels: Record<
    UazapiPackageProvisionDto["connection"]["connectionStatus"],
    string
  > = {
    pending: "Preparando conexao",
    qr_required: "Leia o QR code",
    connected: "WhatsApp conectado",
    disconnected: "WhatsApp desconectado",
    error: "Conexao requer atencao",
  };

  return labels[status];
}
