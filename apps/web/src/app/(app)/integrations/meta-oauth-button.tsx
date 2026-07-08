"use client";

import type { IntegrationStartActionDto } from "@wpptrack/shared";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiBaseUrl, apiFetch } from "../../../lib/api";

type MetaOAuthButtonProps = {
  connected: boolean;
  disabled?: boolean;
};

type MetaOAuthMessage = {
  type?: string;
  status?: "success" | "error";
  message?: string;
};

function apiOrigin(): string | null {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return null;
  }
}

export function MetaOAuthButton({
  connected,
  disabled = false
}: MetaOAuthButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const popupCheckRef = useRef<number | null>(null);

  const clearPopupChecker = () => {
    if (popupCheckRef.current !== null) {
      window.clearInterval(popupCheckRef.current);
      popupCheckRef.current = null;
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent<MetaOAuthMessage>) => {
      const allowedOrigins = new Set([window.location.origin]);
      const origin = apiOrigin();

      if (origin) {
        allowedOrigins.add(origin);
      }

      if (!allowedOrigins.has(event.origin)) {
        return;
      }

      const payload = event.data;

      if (payload?.type !== "meta_oauth") {
        return;
      }

      clearPopupChecker();
      setLoading(false);
      setMessageTone(payload.status === "success" ? "success" : "error");
      setMessage(
        payload.message ??
          (payload.status === "success"
            ? "Conexao Meta realizada com sucesso."
            : "Falha ao conectar com Meta.")
      );
      router.refresh();
    };

    window.addEventListener("message", onMessage);

    return () => {
      clearPopupChecker();
      window.removeEventListener("message", onMessage);
    };
  }, [router]);

  const startOAuth = async () => {
    if (disabled || loading) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const action = await apiFetch<IntegrationStartActionDto>(
        "/integrations/meta/start"
      );

      if (!action.href) {
        setLoading(false);
        setMessageTone("error");
        setMessage(
          action.missingEnv.length
            ? `Configuracao Meta incompleta: ${action.missingEnv.join(", ")}.`
            : "Nao foi possivel iniciar conexao com Meta."
        );
        return;
      }

      const width = 560;
      const height = 760;
      const left = Math.max(
        0,
        Math.floor((window.outerWidth - width) / 2) + window.screenX
      );
      const top = Math.max(
        0,
        Math.floor((window.outerHeight - height) / 2) + window.screenY
      );
      const features = [
        "popup=yes",
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`
      ].join(",");
      const popup = window.open(
        action.href,
        "wpptrack_meta_oauth_popup",
        features
      );

      if (!popup) {
        window.location.href = action.href;
        return;
      }

      popup.focus();
      clearPopupChecker();
      popupCheckRef.current = window.setInterval(() => {
        if (popup.closed) {
          clearPopupChecker();
          setLoading(false);
          router.refresh();
        }
      }, 700);
    } catch {
      setLoading(false);
      setMessageTone("error");
      setMessage("Erro ao iniciar conexao com Meta.");
    }
  };

  return (
    <div className="meta-oauth-action">
      <button
        className="button primary"
        disabled={disabled || loading}
        onClick={startOAuth}
        type="button"
      >
        {loading
          ? "Abrindo Facebook..."
          : connected
            ? "Reconectar Meta"
            : "Conectar com Facebook/Meta"}
      </button>
      {message ? (
        <span
          aria-live="polite"
          className={`action-note${messageTone === "error" ? " warn" : ""}`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
