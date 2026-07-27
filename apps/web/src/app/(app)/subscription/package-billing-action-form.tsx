"use client";

import type { UazapiPackageProvisionDto } from "@wpptrack/shared";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
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

type ResumableUazapiProvisioning = {
  whatsappInstanceId: string;
  instanceName: string;
};

export function PackageBillingActionForm({
  action,
  children,
  className,
  resumeProvisioning,
  showProvisionResult = false,
}: {
  action: PackageBillingFormAction;
  children: ReactNode;
  className?: string;
  resumeProvisioning?: ResumableUazapiProvisioning | null;
  showProvisionResult?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, initialState);
  const [provision, setProvision] = useState<
    UazapiPackageProvisionDto | undefined
  >();
  const [pollingMessage, setPollingMessage] = useState<string | null>(null);
  const [pollingCycle, setPollingCycle] = useState(0);
  const [refreshingQr, setRefreshingQr] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshedConnectedInstance = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "success" && state.checkoutUrl) {
      window.location.assign(state.checkoutUrl);
    }
  }, [state.checkoutUrl, state.status]);

  useEffect(() => {
    setProvision(state.provision);
    setPollingMessage(null);
    if (state.provision) {
      setPollingCycle((current) => current + 1);
    }
  }, [state.provision]);

  useEffect(() => {
    const currentStatus = provision?.connection.connectionStatus;
    const whatsappInstanceId = provision?.connection.whatsappInstanceId ?? null;
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
    pollingCycle,
    showProvisionResult,
  ]);

  useEffect(() => {
    const connection = provision?.connection;
    if (
      connection?.connectionStatus !== "connected" ||
      refreshedConnectedInstance.current === connection.whatsappInstanceId
    ) {
      return;
    }

    refreshedConnectedInstance.current = connection.whatsappInstanceId;
    setPollingMessage(null);
    setRefreshError(null);
    router.refresh();
  }, [provision?.connection, router]);

  const whatsappInstanceId =
    provision?.connection.whatsappInstanceId ??
    resumeProvisioning?.whatsappInstanceId ??
    null;
  const connectionIsConfirmed =
    provision?.connection.connectionStatus === "connected";
  const canRefreshQr = Boolean(whatsappInstanceId) && !connectionIsConfirmed;
  const qrCode = connectionIsConfirmed
    ? null
    : (provision?.connection.qrCode ?? null);
  const qrImage = qrImageSource(qrCode);

  const refreshQr = async () => {
    if (!whatsappInstanceId || refreshingQr) {
      return;
    }

    setRefreshingQr(true);
    setRefreshError(null);
    setPollingMessage(null);
    setProvision((current) =>
      current
        ? {
            ...current,
            connection: {
              ...current.connection,
              qrCode: null,
              message: "Gerando um novo QR code.",
            },
          }
        : current,
    );
    try {
      const next = await apiFetch<UazapiPackageProvisionDto>(
        `/billing/package/uazapi/instances/${encodeURIComponent(
          whatsappInstanceId,
        )}/refresh-qr`,
        { method: "POST" },
      );
      setProvision(next);
      setPollingCycle((current) => current + 1);
    } catch {
      setRefreshError(
        "Nao foi possivel renovar o QR code. Tente novamente em alguns instantes.",
      );
    } finally {
      setRefreshingQr(false);
    }
  };

  return (
    <>
      <form action={formAction} className={className}>
        {children}
      </form>
      {state.status !== "idle" ? (
        <div
          className={`feedback-banner${
            state.status === "error" && !connectionIsConfirmed ? " warn" : ""
          }`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {connectionIsConfirmed
              ? "Conexao confirmada"
              : state.status === "success"
                ? "Acao concluida"
                : "Acao pendente"}
          </strong>
          <span>
            {connectionIsConfirmed
              ? "WhatsApp conectado e vaga ativada no pacote."
              : state.message}
          </span>
        </div>
      ) : null}
      {showProvisionResult && (provision || resumeProvisioning) ? (
        <section className="package-qr-result" aria-label="Conexao WhatsApp">
          <div>
            <span className="eyebrow">
              {connectionIsConfirmed
                ? "Conexao concluida"
                : provision
                  ? "Conexao preparada"
                  : "Conexao reservada"}
            </span>
            <strong>
              {provision
                ? connectionStatusLabel(provision.connection.connectionStatus)
                : `Continuar ${resumeProvisioning?.instanceName ?? "conexao"}`}
            </strong>
            <small>
              {connectionIsConfirmed
                ? connectedInstanceMessage(
                    provision?.connection.connectedPhone ?? null,
                  )
                : (refreshError ??
                  pollingMessage ??
                  provision?.connection.message ??
                  "O QR anterior pode ter expirado. Gere um novo para continuar na mesma instancia.")}
            </small>
            {!connectionIsConfirmed &&
            (provision?.seat.status === "reserved" || resumeProvisioning) ? (
              <small>
                A vaga fica reservada ate a Uazapi confirmar a conexao.
              </small>
            ) : null}
            {canRefreshQr ? (
              <button
                className="button secondary package-qr-refresh"
                disabled={refreshingQr}
                onClick={refreshQr}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={16} />
                {refreshingQr ? "Gerando novo QR..." : "Gerar novo QR"}
              </button>
            ) : null}
          </div>
          {qrImage ? (
            <img src={qrImage} alt="QR code para conectar o WhatsApp" />
          ) : qrCode ? (
            <code>{qrCode}</code>
          ) : connectionIsConfirmed ? (
            <span className="status-chip">Conectado</span>
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

function connectedInstanceMessage(phone: string | null): string {
  const formattedPhone = formatPhone(phone);

  return formattedPhone
    ? `Numero ${formattedPhone} conectado e ativo no pacote.`
    : "Conexao confirmada. Este numero ja esta ativo no pacote.";
}

function formatPhone(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/gu, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(
      4,
      9,
    )}-${digits.slice(9)}`;
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(
      4,
      8,
    )}-${digits.slice(8)}`;
  }

  return digits ? `+${digits}` : null;
}
