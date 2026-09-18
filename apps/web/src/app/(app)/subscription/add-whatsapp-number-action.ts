"use server";

import type { WorkspaceAddWhatsappNumberDto } from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { isApiRequestError, serverApiFetch } from "../../../lib/server-api";
import { GENERIC_ERROR_MESSAGE } from "./add-whatsapp-number-messages";

export type AddWhatsappNumberActionResult =
  | { ok: true; data: WorkspaceAddWhatsappNumberDto }
  | { ok: false; message: string };

/**
 * Creates one additive R$30 WhatsApp number charge. The idempotency key
 * belongs to a single user intent: the caller generates it once and must
 * reuse the same value for a retry of that same intent so the backend never
 * double-charges. The key travels only in the Idempotency-Key header, never
 * in the body, matching the backend contract (empty JSON body).
 */
export async function addWhatsappNumberAction(
  idempotencyKey: string,
): Promise<AddWhatsappNumberActionResult> {
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  try {
    const data = await serverApiFetch<WorkspaceAddWhatsappNumberDto>(
      "/billing/package/add-number",
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({}),
      },
    );
    revalidatePath("/subscription");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: addWhatsappNumberErrorMessage(error) };
  }
}

function addWhatsappNumberErrorMessage(error: unknown): string {
  if (!isApiRequestError(error)) {
    return "Falha de conexao. Verifique sua internet e tente novamente.";
  }

  switch (error.status) {
    case 401:
      return "Sua sessao expirou. Faca login novamente para continuar.";
    case 403:
      return "Sem permissao para gerenciar a cobranca deste workspace.";
    case 409:
      return "Nao foi possivel adicionar o numero agora. Verifique o contrato e os dados de cobranca.";
    case 400:
    case 422:
      return "Solicitacao invalida. Atualize a pagina e tente novamente.";
    default:
      return GENERIC_ERROR_MESSAGE;
  }
}
