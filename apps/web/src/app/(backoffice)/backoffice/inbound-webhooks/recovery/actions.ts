"use server";

import type { BackofficeInboundWebhookProductionRecoveryResultDto } from "@wpptrack/shared";
import { inboundWebhookReplaySelectionSchema } from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import type { BackofficeActionState } from "../../../../../components/backoffice-action-form";
import {
  isApiRequestError,
  serverApiFetch,
} from "../../../../../lib/server-api";

function actionResult(
  status: "success" | "error",
  message: string,
): BackofficeActionState {
  return {
    status,
    message,
    nonce: Date.now(),
  };
}

function identifier(formData: FormData, field: string): string | null {
  const value = String(formData.get(field) ?? "").trim();

  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return null;
  }

  return value;
}

function recoveryPath(connectionId: string): string {
  return `/backoffice/inbound-webhooks/recovery/${encodeURIComponent(connectionId)}`;
}

function safeApiMessage(error: unknown, fallback: string): string {
  if (
    isApiRequestError(error) &&
    [400, 404, 409, 503].includes(error.status) &&
    error.message.length <= 180
  ) {
    return error.message;
  }

  return fallback;
}

export async function authorizeInboundWebhookProductionRecoveryAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const connectionId = identifier(formData, "connectionId");
  const channelId = identifier(formData, "channelId");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const selection = inboundWebhookReplaySelectionSchema.safeParse(
    String(formData.get("selection") ?? ""),
  );

  if (
    !connectionId ||
    !channelId ||
    !confirmation ||
    confirmation.length > 120 ||
    !selection.success
  ) {
    return actionResult("error", "Confirmacao invalida.");
  }

  try {
    const result =
      await serverApiFetch<BackofficeInboundWebhookProductionRecoveryResultDto>(
        `/backoffice/inbound-webhooks/connections/${encodeURIComponent(connectionId)}/production-recovery`,
        {
          method: "POST",
          body: JSON.stringify({
            channelId,
            confirmation,
            selection: selection.data,
          }),
        },
      );
    revalidatePath(recoveryPath(connectionId));
    revalidatePath("/backoffice/inbound-webhooks");

    const delivered = result.queued + result.existing;
    const failureDetail = result.queueFailures
      ? ` ${result.queueFailures} item(ns) exigem nova tentativa da fila.`
      : "";

    return actionResult(
      "success",
      `${delivered} evento(s) entrou(aram) na fila normal de producao.${failureDetail}`,
    );
  } catch (error) {
    return actionResult(
      "error",
      safeApiMessage(
        error,
        "Nao foi possivel autorizar a recuperacao de producao.",
      ),
    );
  }
}
