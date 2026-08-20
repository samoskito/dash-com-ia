"use server";

import type { WorkspaceOpsAlertSettingsInput } from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import type { BackofficeActionState } from "../../../components/backoffice-action-form";
import { isApiRequestError, serverApiFetch } from "../../../lib/server-api";

function actionState(
  status: BackofficeActionState["status"],
  message: string,
): BackofficeActionState {
  return { status, message, nonce: Date.now() };
}

export async function saveOpsAlertSettingsAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const enabled = formData.get("enabled") === "on";
  const alertPhone = String(formData.get("alertPhone") ?? "").replace(
    /\D/g,
    "",
  );
  const disconnectAlerts = formData.get("disconnectAlerts") === "on";
  const webhookSilenceAlerts = formData.get("webhookSilenceAlerts") === "on";
  const silenceThresholdHours =
    Number(formData.get("silenceThresholdHours") ?? 24) || 24;
  const debounceHours = Number(formData.get("debounceHours") ?? 6) || 6;

  if (!workspaceId) {
    return actionState("error", "Workspace nao identificado.");
  }

  if (enabled && !alertPhone) {
    return actionState("error", "Informe o telefone para ativar os alertas.");
  }

  const payload: WorkspaceOpsAlertSettingsInput = {
    enabled,
    alertPhone,
    disconnectAlerts,
    webhookSilenceAlerts,
    silenceThresholdHours,
    debounceHours,
  };

  try {
    await serverApiFetch(
      `/workspaces/${encodeURIComponent(workspaceId)}/ops-alerts/settings`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    );
    revalidatePath("/settings");

    return actionState("success", "Alertas de operacao atualizados.");
  } catch (error) {
    return actionState("error", opsAlertSettingsErrorMessage(error));
  }
}

function opsAlertSettingsErrorMessage(error: unknown): string {
  if (isApiRequestError(error) && error.status === 403) {
    return "Sem permissao para gerenciar alertas operacionais.";
  }

  return "Nao foi possivel salvar os alertas.";
}
