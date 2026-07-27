"use server";

import type {
  UazapiPackageProvisionDto,
  WorkspaceBillingProfileDto,
  WorkspacePackageCheckoutDto,
  WorkspaceSubscriptionCancellationDto,
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { isApiRequestError, serverApiFetch } from "../../../lib/server-api";
import type { PackageBillingActionState } from "./package-billing-action-form";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function nullableText(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

function errorState(
  error: unknown,
  fallback: string,
): PackageBillingActionState {
  return {
    status: "error",
    message: isApiRequestError(error) ? error.message : fallback,
  };
}

export async function saveBillingProfileAction(
  _previousState: PackageBillingActionState,
  formData: FormData,
): Promise<PackageBillingActionState> {
  try {
    await serverApiFetch<WorkspaceBillingProfileDto>(
      "/billing/package/profile",
      {
        method: "PUT",
        body: JSON.stringify({
          payerType: text(formData, "payerType"),
          payerName: text(formData, "payerName"),
          taxId: text(formData, "taxId"),
          billingEmail: text(formData, "billingEmail"),
          phone: text(formData, "phone"),
          postalCode: text(formData, "postalCode"),
          addressLine: text(formData, "addressLine"),
          addressNumber: text(formData, "addressNumber"),
          addressComplement: nullableText(formData, "addressComplement"),
          district: text(formData, "district"),
          city: text(formData, "city"),
          state: text(formData, "state").toUpperCase(),
        }),
      },
    );
    revalidatePath("/subscription");
    return {
      status: "success",
      message: "Dados de cobranca atualizados.",
    };
  } catch (error) {
    return errorState(error, "Nao foi possivel atualizar os dados de cobranca.");
  }
}

export async function startPackageCheckoutAction(
  _previousState: PackageBillingActionState,
  formData: FormData,
): Promise<PackageBillingActionState> {
  try {
    const checkout = await serverApiFetch<WorkspacePackageCheckoutDto>(
      "/billing/package/checkout",
      {
        method: "POST",
        body: JSON.stringify({
          planId: text(formData, "planId"),
        }),
      },
    );
    revalidatePath("/subscription");
    return {
      status: "success",
      message: "Checkout preparado. Abrindo o ambiente seguro do Asaas.",
      checkoutUrl: checkout.checkoutUrl,
    };
  } catch (error) {
    return errorState(error, "Nao foi possivel iniciar o pagamento.");
  }
}

export async function cancelPackageSubscriptionAction(
  _previousState: PackageBillingActionState,
  formData: FormData,
): Promise<PackageBillingActionState> {
  if (formData.get("confirmation") !== "true") {
    return {
      status: "error",
      message: "Confirme o cancelamento antes de continuar.",
    };
  }

  try {
    const cancellation =
      await serverApiFetch<WorkspaceSubscriptionCancellationDto>(
        "/billing/package/subscription",
        {
          method: "DELETE",
          body: JSON.stringify({
            confirmation: true,
            reason: nullableText(formData, "reason"),
          }),
        },
      );
    revalidatePath("/subscription");
    return {
      status: "success",
      message: cancellation.accessEndsAt
        ? `Renovacao cancelada. O acesso segue ate ${new Date(
            cancellation.accessEndsAt,
          ).toLocaleDateString("pt-BR")}.`
        : "Renovacao cancelada.",
    };
  } catch (error) {
    return errorState(error, "Nao foi possivel cancelar a renovacao.");
  }
}

export async function provisionPackageUazapiAction(
  _previousState: PackageBillingActionState,
  formData: FormData,
): Promise<PackageBillingActionState> {
  try {
    const provision = await serverApiFetch<UazapiPackageProvisionDto>(
      "/billing/package/uazapi/instances",
      {
        method: "POST",
        body: JSON.stringify({
          instanceName: text(formData, "instanceName"),
        }),
      },
    );
    revalidatePath("/subscription");
    revalidatePath("/integrations");
    return {
      status: "success",
      message:
        provision.connection.message ??
        "Instancia criada. Continue pela leitura do QR code.",
      provision,
    };
  } catch (error) {
    return errorState(error, "Nao foi possivel preparar a instancia Uazapi.");
  }
}
