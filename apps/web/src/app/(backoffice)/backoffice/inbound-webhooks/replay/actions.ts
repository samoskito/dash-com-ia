"use server";

import type {
  BackofficeInboundWebhookReplayBatchDto,
  InboundWebhookParserReleaseDto,
} from "@wpptrack/shared";
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

function replayPath(connectionId: string): string {
  return `/backoffice/inbound-webhooks/replay/${encodeURIComponent(connectionId)}`;
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

export async function certifyInboundWebhookParserAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const connectionId = identifier(formData, "connectionId");
  const releaseId = identifier(formData, "releaseId");

  if (!connectionId || !releaseId) {
    return actionResult("error", "Parser ou conexao invalidos.");
  }

  try {
    await serverApiFetch<InboundWebhookParserReleaseDto>(
      `/backoffice/inbound-webhooks/parser-releases/${encodeURIComponent(releaseId)}/certify`,
      {
        method: "POST",
        body: "{}",
      },
    );
    revalidatePath(replayPath(connectionId));

    return actionResult(
      "success",
      "Parser certificado com evidencia CTWA real.",
    );
  } catch (error) {
    return actionResult(
      "error",
      safeApiMessage(error, "Nao foi possivel certificar o parser."),
    );
  }
}

export async function authorizeInboundWebhookReplayAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const connectionId = identifier(formData, "connectionId");
  const channelValue = String(formData.get("channelId") ?? "").trim();
  const channelId = identifier(formData, "channelId");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const selection = inboundWebhookReplaySelectionSchema.safeParse(
    String(formData.get("selection") ?? ""),
  );

  if (
    !connectionId ||
    !channelValue ||
    !channelId ||
    !confirmation ||
    confirmation.length > 120 ||
    !selection.success
  ) {
    return actionResult("error", "Confirmacao invalida.");
  }

  try {
    const batch = await serverApiFetch<BackofficeInboundWebhookReplayBatchDto>(
      `/backoffice/inbound-webhooks/connections/${encodeURIComponent(connectionId)}/replay`,
      {
        method: "POST",
        body: JSON.stringify({
          confirmation,
          selection: selection.data,
          channelId,
        }),
      },
    );
    revalidatePath(replayPath(connectionId));
    revalidatePath("/backoffice/inbound-webhooks");

    return actionResult(
      "success",
      `${batch.totalItems} evento(s) autorizado(s) para replay controlado.`,
    );
  } catch (error) {
    return actionResult(
      "error",
      safeApiMessage(error, "Nao foi possivel autorizar o replay."),
    );
  }
}

export async function retryInboundWebhookReplayAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const connectionId = identifier(formData, "connectionId");
  const batchId = identifier(formData, "batchId");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (!connectionId || !batchId || !confirmation || confirmation.length > 120) {
    return actionResult("error", "Confirmacao invalida.");
  }

  try {
    const batch = await serverApiFetch<BackofficeInboundWebhookReplayBatchDto>(
      `/backoffice/inbound-webhooks/connections/${encodeURIComponent(connectionId)}/replay-batches/${encodeURIComponent(batchId)}/retry`,
      {
        method: "POST",
        body: JSON.stringify({ confirmation }),
      },
    );
    revalidatePath(replayPath(connectionId));
    revalidatePath("/backoffice/inbound-webhooks");

    return actionResult(
      "success",
      `Lote ${batch.id} retornou para recuperacao controlada.`,
    );
  } catch (error) {
    return actionResult(
      "error",
      safeApiMessage(
        error,
        "Nao foi possivel recuperar as falhas transitorias.",
      ),
    );
  }
}
