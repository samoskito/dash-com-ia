"use server";

import { revalidatePath } from "next/cache";
import type { BackofficeActionState } from "../../../../components/backoffice-action-form";
import {
  isApiRequestError,
  serverApiFetch,
} from "../../../../lib/server-api";

type ConversionRecoveryResult = {
  deliveryId: string;
  status: "queued" | "existing" | "already_observed";
};

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

function deliveryId(formData: FormData): string | null {
  const value = String(formData.get("deliveryId") ?? "").trim();

  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return null;
  }

  return value;
}

export async function reprocessInboundProviderConversionsAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const id = deliveryId(formData);

  if (!id) {
    return actionResult("error", "Entrega invalida.");
  }

  try {
    const result = await serverApiFetch<ConversionRecoveryResult>(
      `/backoffice/inbound-webhooks/deliveries/${encodeURIComponent(id)}/reprocess-provider-conversions`,
      { method: "POST" },
    );

    revalidatePath("/backoffice/inbound-webhooks");

    return actionResult(
      "success",
      result.status === "already_observed"
        ? "As conversoes desta entrega ja foram lidas."
        : result.status === "existing"
          ? "A entrega ja esta aguardando reprocessamento."
          : "Entrega encaminhada para reprocessar as conversoes.",
    );
  } catch (error) {
    const message =
      isApiRequestError(error) &&
      [400, 404, 409, 503].includes(error.status) &&
      error.message.length <= 180
        ? error.message
        : "Nao foi possivel reprocessar as conversoes desta entrega.";

    return actionResult("error", message);
  }
}
