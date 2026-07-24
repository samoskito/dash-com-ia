"use server";

import { revalidatePath } from "next/cache";
import type { BackofficeActionState } from "../../../../components/backoffice-action-form";
import { isApiRequestError, serverApiFetch } from "../../../../lib/server-api";

type ConversionRecoveryResult = {
  deliveryId: string;
  status: "queued" | "existing";
};

type ConversionReevaluationResult = {
  previousDecisionId: string;
  decisionId: string;
  decisionVersion: number;
  status: "reevaluated" | "existing";
  executionIds: string[];
  eligibleExecutionIds: string[];
};

type ProviderConversionEngineMode = "legacy" | "shadow" | "canonical";

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

function conversionEventLogId(formData: FormData): string | null {
  const value = String(formData.get("conversionEventLogId") ?? "").trim();

  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return null;
  }

  return value;
}

function decisionId(formData: FormData): string | null {
  const value = String(formData.get("decisionId") ?? "").trim();

  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return null;
  }

  return value;
}

function reevaluationRequestKey(formData: FormData): string | null {
  const value = String(formData.get("requestKey") ?? "").trim();

  if (
    value.length < 16 ||
    value.length > 255 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return null;
  }

  return value;
}

function providerConversionEngineMode(
  formData: FormData,
): ProviderConversionEngineMode | null {
  const value = String(formData.get("mode") ?? "").trim();

  return value === "legacy" || value === "shadow" || value === "canonical"
    ? value
    : null;
}

function nonnegativeInteger(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  const value = Number(raw);

  return raw && Number.isInteger(value) && value >= 0 ? value : null;
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
      result.status === "existing"
        ? "A entrega ja esta aguardando reprocessamento forcado."
        : "Entrega encaminhada para reler e recuperar as conversoes.",
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

export async function retryProviderConversionDeliveryAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const id = conversionEventLogId(formData);

  if (!id) {
    return actionResult("error", "Evento Meta invalido.");
  }

  try {
    await serverApiFetch(
      `/backoffice/diagnostics/conversions/${encodeURIComponent(id)}/retry`,
      {
        method: "POST",
        body: JSON.stringify({
          reason:
            "Retry de falha transitoria solicitado pela auditoria unificada",
        }),
      },
    );

    revalidatePath("/backoffice/inbound-webhooks/conversions");
    revalidatePath("/backoffice/inbound-webhooks");
    revalidatePath("/backoffice");

    return actionResult(
      "success",
      "Evento encaminhado para uma nova tentativa com a Meta.",
    );
  } catch (error) {
    const message =
      isApiRequestError(error) &&
      [400, 404, 409, 503].includes(error.status) &&
      error.message.length <= 180
        ? error.message
        : "Nao foi possivel reenviar este evento para a Meta.";

    return actionResult("error", message);
  }
}

export async function reevaluateProviderConversionDecisionAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const id = decisionId(formData);
  const requestKey = reevaluationRequestKey(formData);

  if (!id || !requestKey) {
    return actionResult("error", "Solicitacao de reavaliacao invalida.");
  }

  try {
    const result = await serverApiFetch<ConversionReevaluationResult>(
      `/backoffice/inbound-webhooks/conversion-traces/${encodeURIComponent(id)}/reevaluate`,
      {
        method: "POST",
        body: JSON.stringify({ requestKey }),
      },
    );

    revalidatePath("/backoffice/inbound-webhooks/conversions");
    revalidatePath("/backoffice/inbound-webhooks");
    revalidatePath("/backoffice");

    if (result.status === "existing") {
      return actionResult(
        "success",
        `Esta reavaliacao ja foi concluida na decisao v${result.decisionVersion}.`,
      );
    }

    return actionResult(
      "success",
      result.eligibleExecutionIds.length > 0
        ? `Decisao v${result.decisionVersion} criada e encaminhada para envio.`
        : `Decisao v${result.decisionVersion} criada com o diagnostico atualizado.`,
    );
  } catch (error) {
    const message =
      isApiRequestError(error) &&
      [400, 404, 409, 503].includes(error.status) &&
      error.message.length <= 180
        ? error.message
        : "Nao foi possivel reavaliar esta decisao.";

    return actionResult("error", message);
  }
}

export async function updateProviderConversionEngineModeAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const channelId = String(formData.get("channelId") ?? "").trim();
  const mode = providerConversionEngineMode(formData);
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const acknowledgedComparisonCount = nonnegativeInteger(
    formData,
    "acknowledgedComparisonCount",
  );
  const acknowledgedMismatchCount = nonnegativeInteger(
    formData,
    "acknowledgedMismatchCount",
  );
  if (
    !channelId ||
    channelId.length > 255 ||
    !mode ||
    !confirmation ||
    confirmation.length > 160
  ) {
    return actionResult("error", "Alteracao de rollout invalida.");
  }

  try {
    await serverApiFetch(
      `/backoffice/inbound-webhooks/conversion-rollout/channels/${encodeURIComponent(channelId)}/mode`,
      {
        method: "POST",
        body: JSON.stringify({
          mode,
          confirmation,
          ...(acknowledgedComparisonCount === null
            ? {}
            : { acknowledgedComparisonCount }),
          ...(acknowledgedMismatchCount === null
            ? {}
            : { acknowledgedMismatchCount }),
        }),
      },
    );

    revalidatePath("/backoffice/inbound-webhooks");

    return actionResult(
      "success",
      mode === "legacy"
        ? "Canal devolvido ao motor legado."
        : mode === "shadow"
          ? "Comparacao shadow ativada; o motor legado continua com autoridade."
          : "Motor canonico ativado para as proximas ocorrencias do canal.",
    );
  } catch (error) {
    const message =
      isApiRequestError(error) &&
      [400, 404, 409, 503].includes(error.status) &&
      error.message.length <= 180
        ? error.message
        : "Nao foi possivel alterar o motor deste canal.";

    return actionResult("error", message);
  }
}
