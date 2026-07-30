"use server";

import {
  inboundWebhookParserRecoverySelectionSchema,
  type BackofficeInboundWebhookParserRecoveryResultDto,
} from "@wpptrack/shared";
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

function parserRecoveryPath(connectionId: string): string {
  return `/backoffice/inbound-webhooks/parser-recovery/${encodeURIComponent(connectionId)}`;
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

export async function recoverInboundWebhookParserBatchAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const connectionId = identifier(formData, "connectionId");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const selection = inboundWebhookParserRecoverySelectionSchema.safeParse(
    String(formData.get("selection") ?? ""),
  );

  if (
    !connectionId ||
    !confirmation ||
    confirmation.length > 120 ||
    !selection.success
  ) {
    return actionResult("error", "Confirmacao invalida.");
  }

  try {
    const result =
      await serverApiFetch<BackofficeInboundWebhookParserRecoveryResultDto>(
        `/backoffice/inbound-webhooks/connections/${encodeURIComponent(connectionId)}/parser-recovery`,
        {
          method: "POST",
          body: JSON.stringify({
            confirmation,
            selection: selection.data,
          }),
        },
      );
    revalidatePath(parserRecoveryPath(connectionId));
    revalidatePath("/backoffice/inbound-webhooks");

    const accepted = result.queued + result.existing;
    const failureDetail = result.queueFailures
      ? ` ${result.queueFailures} entrega(s) permanecem protegidas e a fila interna tentara novamente.`
      : "";

    return actionResult(
      "success",
      `${accepted} entrega(s) entrou(aram) na fila do parser. Restam ${result.remainingRecoverable} recuperavel(is).${failureDetail}`,
    );
  } catch (error) {
    return actionResult(
      "error",
      safeApiMessage(
        error,
        "Nao foi possivel iniciar a recuperacao do parser.",
      ),
    );
  }
}
