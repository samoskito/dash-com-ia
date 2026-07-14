"use server";

import { revalidatePath } from "next/cache";
import type { BackofficeActionState } from "../../../components/backoffice-action-form";
import { serverApiFetch } from "../../../lib/server-api";

export async function retryMetaEventAction(
  _previousState: BackofficeActionState,
  formData: FormData
): Promise<BackofficeActionState> {
  const eventId = String(formData.get("eventId") ?? "").trim();

  if (!eventId) {
    return {
      status: "error",
      message: "Evento Meta nao identificado.",
      nonce: Date.now()
    };
  }

  try {
    await serverApiFetch(
      `/reports/conversions/audit/${encodeURIComponent(eventId)}/retry`,
      { method: "POST" }
    );
    revalidatePath("/events");

    return {
      status: "success",
      message: "Evento enfileirado para uma nova tentativa.",
      nonce: Date.now()
    };
  } catch {
    return {
      status: "error",
      message:
        "O evento nao pode ser reenviado. Atualize a pagina e confira o motivo tecnico.",
      nonce: Date.now()
    };
  }
}
