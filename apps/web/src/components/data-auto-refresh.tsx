"use client";

import type { WhatsappDataSourceDto } from "@wpptrack/shared";
import { useCallback, useEffect, useState } from "react";
import { displayTimeZone } from "../lib/date-time";

const refreshIntervalMs = 60_000;

function sourceName(source: WhatsappDataSourceDto | null) {
  if (source?.mode === "external") {
    return source.connectorName ?? "Integracao externa";
  }

  return source?.mode === "native"
    ? "WhatsApp em tempo real"
    : "Dados do workspace";
}

function sourceFreshness(source: WhatsappDataSourceDto | null) {
  if (source?.lastSyncStatus === "failed") {
    return "Falha na ultima sincronizacao";
  }

  if (!source?.lastSyncCompletedAt) {
    return "Atualizacao automatica ativa";
  }

  return `Sincronizado em ${new Date(source.lastSyncCompletedAt).toLocaleString(
    "pt-BR",
    {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
      timeZone: displayTimeZone,
    },
  )}`;
}

export function DataAutoRefresh({
  source,
}: {
  source: WhatsappDataSourceDto | null;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = useCallback(() => {
    setIsRefreshing(true);
    window.location.reload();
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const interval = window.setInterval(refreshWhenVisible, refreshIntervalMs);

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  return (
    <div className="data-refresh-bar" aria-live="polite">
      <div>
        <span>Dados</span>
        <strong>{sourceName(source)}</strong>
        <small>
          {isRefreshing ? "Atualizando..." : sourceFreshness(source)}
        </small>
      </div>
      <button
        className="button ghost"
        disabled={isRefreshing}
        onClick={refresh}
        type="button"
      >
        {isRefreshing ? "Atualizando" : "Atualizar"}
      </button>
    </div>
  );
}
