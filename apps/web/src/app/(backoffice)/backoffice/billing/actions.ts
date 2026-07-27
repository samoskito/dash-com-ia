"use server";

import type { BackofficeActionState } from "../../../../components/backoffice-action-form";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../../lib/server-api";
import { parseMoneyInputToCents } from "../../../../lib/money-input";

function result(
  status: "success" | "error",
  message: string,
): BackofficeActionState {
  return {
    status,
    message,
    nonce: Date.now(),
  };
}

function moneyToCents(value: FormDataEntryValue | null): number {
  return parseMoneyInputToCents(String(value ?? ""));
}

function positiveInteger(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? "").trim());

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Quantidade de numeros invalida");
  }

  return parsed;
}

export async function createPackagePlanAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  try {
    const kind = String(formData.get("kind") ?? "standard");

    await serverApiFetch("/backoffice/billing/package-plans", {
      method: "POST",
      body: JSON.stringify({
        name: String(formData.get("name") ?? "").trim(),
        slug: String(formData.get("slug") ?? "").trim(),
        kind,
        visibility: kind === "standard" ? "public" : "private",
        monthlyPriceCents:
          kind === "exempt" ? 0 : moneyToCents(formData.get("monthlyPrice")),
        includedWhatsappNumbers: positiveInteger(
          formData.get("includedWhatsappNumbers"),
        ),
        active: formData.get("active") === "true",
        reason: String(formData.get("reason") ?? "").trim(),
      }),
    });
    revalidatePath("/backoffice/billing");
    return result("success", "Pacote criado e registrado na auditoria.");
  } catch (error) {
    return result(
      "error",
      error instanceof Error
        ? error.message
        : "Nao foi possivel criar o pacote.",
    );
  }
}

export async function updatePackagePlanAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const planId = String(formData.get("planId") ?? "").trim();

  try {
    await serverApiFetch(
      `/backoffice/billing/package-plans/${encodeURIComponent(planId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: String(formData.get("name") ?? "").trim(),
          visibility: String(formData.get("visibility") ?? "private"),
          monthlyPriceCents: moneyToCents(formData.get("monthlyPrice")),
          includedWhatsappNumbers: positiveInteger(
            formData.get("includedWhatsappNumbers"),
          ),
          active: formData.get("active") === "true",
          reason: String(formData.get("reason") ?? "").trim(),
        }),
      },
    );
    revalidatePath("/backoffice/billing");
    return result("success", "Pacote atualizado com nova versao comercial.");
  } catch (error) {
    return result(
      "error",
      error instanceof Error
        ? error.message
        : "Nao foi possivel atualizar o pacote.",
    );
  }
}

export async function assignPackagePlanAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();

  try {
    await serverApiFetch(
      `/backoffice/billing/package-contracts/${encodeURIComponent(
        workspaceId,
      )}/assign`,
      {
        method: "POST",
        body: JSON.stringify({
          planId: String(formData.get("planId") ?? "").trim(),
          reason: String(formData.get("reason") ?? "").trim(),
        }),
      },
    );
    revalidatePath("/backoffice/billing");
    return result(
      "success",
      "Pacote atribuido. Planos pagos aguardam checkout do cliente.",
    );
  } catch (error) {
    return result(
      "error",
      error instanceof Error
        ? error.message
        : "Nao foi possivel atribuir o pacote.",
    );
  }
}

export async function reconcileWorkspaceBillingAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();

  try {
    const response = await serverApiFetch<{
      paymentsChecked: number;
      invoicesChecked: number;
      eventsProcessed: number;
      eventsDuplicated: number;
      failures: number;
    }>(
      `/backoffice/billing/package-contracts/${encodeURIComponent(
        workspaceId,
      )}/reconcile`,
      { method: "POST" },
    );
    revalidatePath("/backoffice/billing");
    return result(
      response.failures > 0 ? "error" : "success",
      `${response.paymentsChecked} pagamento(s) e ${response.invoicesChecked} nota(s) conferidos; ${response.eventsProcessed} recuperado(s) e ${response.eventsDuplicated} ja processado(s).`,
    );
  } catch (error) {
    return result(
      "error",
      error instanceof Error
        ? error.message
        : "Nao foi possivel conciliar este cliente.",
    );
  }
}

export async function retryFiscalInvoiceAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();

  try {
    const response = await serverApiFetch<{ retried: boolean }>(
      `/backoffice/billing/invoices/${encodeURIComponent(invoiceId)}/retry`,
      { method: "POST" },
    );
    revalidatePath("/backoffice/billing");
    return result(
      response.retried ? "success" : "error",
      response.retried
        ? "A emissao foi reconciliada com o Asaas."
        : "A nota nao possui dados suficientes para nova tentativa.",
    );
  } catch (error) {
    return result(
      "error",
      error instanceof Error
        ? error.message
        : "Nao foi possivel tentar a emissao novamente.",
    );
  }
}

export async function saveFiscalSettingsAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  try {
    await serverApiFetch("/backoffice/billing/fiscal-settings", {
      method: "PATCH",
      body: JSON.stringify({
        enabled: formData.get("enabled") === "true",
        municipalServiceId:
          String(formData.get("municipalServiceId") ?? "").trim() || null,
        municipalServiceCode:
          String(formData.get("municipalServiceCode") ?? "").trim() || null,
        serviceDescription: String(
          formData.get("serviceDescription") ?? "",
        ).trim(),
        observations: String(formData.get("observations") ?? "").trim() || null,
        taxes: null,
        validationReason: String(formData.get("validationReason") ?? "").trim(),
      }),
    });
    revalidatePath("/backoffice/billing");
    return result(
      "success",
      "Configuracao fiscal validada para novos pagamentos.",
    );
  } catch (error) {
    return result(
      "error",
      error instanceof Error
        ? error.message
        : "Nao foi possivel salvar a configuracao fiscal.",
    );
  }
}

export async function applyLegacyBillingBackfillAction(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  try {
    const workspaceIds = formData
      .getAll("workspaceId")
      .map((value) => String(value).trim())
      .filter(Boolean);

    const response = await serverApiFetch<{
      appliedWorkspaces: number;
      skippedWorkspaces: number;
      createdContracts: number;
      createdSeats: number;
    }>("/backoffice/billing/legacy-backfill/apply", {
      method: "POST",
      body: JSON.stringify({
        confirmation: String(formData.get("confirmation") ?? "").trim(),
        reason: String(formData.get("reason") ?? "").trim(),
        workspaceIds: workspaceIds.length ? workspaceIds : undefined,
      }),
    });

    revalidatePath("/backoffice/billing");
    return result(
      "success",
      `${response.appliedWorkspaces} workspace(s) protegido(s), ${response.createdContracts} contrato(s) e ${response.createdSeats} vaga(s) criados. ${response.skippedWorkspaces} ignorado(s).`,
    );
  } catch (error) {
    return result(
      "error",
      error instanceof Error
        ? error.message
        : "Nao foi possivel aplicar o legado protegido.",
    );
  }
}
