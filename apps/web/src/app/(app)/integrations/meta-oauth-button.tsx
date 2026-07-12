"use client";

import type {
  IntegrationStartActionDto,
  MetaAssetsDto,
  MetaConnectionDto
} from "@wpptrack/shared";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiBaseUrl, apiFetch } from "../../../lib/api";
import { metaAssetsRefreshSucceeded } from "./meta-connection-state";

type MetaOAuthButtonProps = {
  connected: boolean;
  disabled?: boolean;
};

type MetaOAuthMessage = {
  type?: string;
  status?: "success" | "error";
  message?: string;
};

type MetaOAuthApiFetch = (
  path: string,
  init?: RequestInit
) => Promise<unknown>;

export async function refreshMetaAssetsAfterOAuth(
  fetcher: MetaOAuthApiFetch = apiFetch
): Promise<MetaAssetsDto> {
  const connection = (await fetcher(
    "/integrations/meta/connection"
  )) as MetaConnectionDto;

  if (connection.status !== "connected") {
    throw new Error("MetaOAuthConnectionNotPersisted");
  }

  const assets = (await fetcher("/integrations/meta/assets/refresh", {
    method: "POST",
    body: JSON.stringify({ businessId: null })
  })) as MetaAssetsDto;

  if (!metaAssetsRefreshSucceeded(assets)) {
    throw new Error(assets.syncError ?? "MetaAssetsRefreshFailed");
  }

  return assets;
}

export function originFromUrl(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function metaOAuthCallbackOrigin(authorizationUrl: string): string | null {
  try {
    const redirectUri = new URL(authorizationUrl).searchParams.get("redirect_uri");

    return redirectUri ? originFromUrl(redirectUri) : null;
  } catch {
    return null;
  }
}

export function metaOAuthAllowedOrigins(input: {
  apiUrl: string;
  currentOrigin: string;
  callbackOrigin?: string | null;
}): Set<string> {
  const origins = new Set([input.currentOrigin]);
  const apiOrigin = originFromUrl(input.apiUrl);

  if (apiOrigin) {
    origins.add(apiOrigin);
  }

  if (input.callbackOrigin) {
    origins.add(input.callbackOrigin);
  }

  return origins;
}

export function MetaOAuthButton({
  connected,
  disabled = false
}: MetaOAuthButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Abrindo Facebook...");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const popupCheckRef = useRef<number | null>(null);
  const allowedOriginsRef = useRef<Set<string> | null>(null);

  const clearPopupChecker = () => {
    if (popupCheckRef.current !== null) {
      window.clearInterval(popupCheckRef.current);
      popupCheckRef.current = null;
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent<MetaOAuthMessage>) => {
      const allowedOrigins =
        allowedOriginsRef.current ??
        metaOAuthAllowedOrigins({
          apiUrl: apiBaseUrl,
          currentOrigin: window.location.origin
        });

      if (!allowedOrigins.has(event.origin)) {
        return;
      }

      const payload = event.data;

      if (payload?.type !== "meta_oauth") {
        return;
      }

      clearPopupChecker();
      allowedOriginsRef.current = null;

      if (payload.status === "success") {
        setLoading(true);
        setLoadingLabel("Carregando ativos Meta...");
        setMessage(null);
        void refreshMetaAssetsAfterOAuth()
          .then(() => {
            window.location.assign(
              "/integrations?notice=meta-assets-refreshed"
            );
          })
          .catch(() => {
            setLoading(false);
            setLoadingLabel("Abrindo Facebook...");
            setMessageTone("error");
            setMessage(
              "A conta foi autorizada, mas nao foi possivel carregar os ativos Meta. Atualize a pagina e tente novamente."
            );
            router.refresh();
          });
        return;
      }

      setLoading(false);
      setLoadingLabel("Abrindo Facebook...");
      setMessageTone("error");
      setMessage(payload.message ?? "Falha ao conectar com Meta.");
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
    setLoadingLabel("Abrindo Facebook...");
    setMessage(null);

    try {
      const action = await apiFetch<IntegrationStartActionDto>(
        "/integrations/meta/start"
      );

      if (!action.href) {
        allowedOriginsRef.current = null;
        setLoading(false);
        setMessageTone("error");
        setMessage(
          action.missingEnv.length
            ? `Configuracao Meta incompleta: ${action.missingEnv.join(", ")}.`
            : "Nao foi possivel iniciar conexao com Meta."
        );
        return;
      }

      allowedOriginsRef.current = metaOAuthAllowedOrigins({
        apiUrl: apiBaseUrl,
        currentOrigin: window.location.origin,
        callbackOrigin: metaOAuthCallbackOrigin(action.href)
      });

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
          allowedOriginsRef.current = null;
          setLoading(false);
          setLoadingLabel("Abrindo Facebook...");
          setMessageTone("error");
          setMessage(
            "Janela da Meta fechada. Se a conexao nao aparecer, recarregue a pagina e confira se app e API estao no mesmo ambiente."
          );
          router.refresh();
        }
      }, 700);
    } catch {
      allowedOriginsRef.current = null;
      setLoading(false);
      setLoadingLabel("Abrindo Facebook...");
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
          ? loadingLabel
          : connected
            ? "Trocar conta Meta"
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
