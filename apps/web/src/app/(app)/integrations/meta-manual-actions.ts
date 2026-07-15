"use server";

import type {
  MetaManualAssetDiscoveryDto,
  MetaManualConfigurationDto,
  MetaManualConnectionTestResultDto,
  MetaOAuthDisconnectResultDto,
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { isApiRequestError, serverApiFetch } from "../../../lib/server-api";

export type MetaManualActionResult = {
  ok: boolean;
  message: string;
  discovery?: MetaManualAssetDiscoveryDto;
  configuration?: MetaManualConfigurationDto;
  testResult?: MetaManualConnectionTestResultDto;
};

export async function disconnectMetaOAuthAction(
  workspaceId: string,
  confirmation: string,
): Promise<MetaManualActionResult> {
  try {
    await serverApiFetch<MetaOAuthDisconnectResultDto>(
      "/integrations/meta/oauth/disconnect",
      {
        method: "POST",
        body: JSON.stringify({
          expectedWorkspaceId: workspaceId,
          confirmation,
        }),
      },
    );

    revalidatePath("/integrations");
    return {
      ok: true,
      message:
        "OAuth desconectado deste workspace. Agora configure o token permanente.",
    };
  } catch (error) {
    return failure(error, "Nao foi possivel desconectar a conta Meta.");
  }
}

export async function createMetaManualCredentialAction(
  formData: FormData,
): Promise<MetaManualActionResult> {
  try {
    const discovery = await serverApiFetch<MetaManualAssetDiscoveryDto>(
      "/integrations/meta/manual/credentials",
      {
        method: "POST",
        body: JSON.stringify({
          label: requiredFormText(formData, "label"),
          accessToken: requiredFormText(formData, "accessToken"),
        }),
      },
    );

    revalidatePath("/integrations");
    return {
      ok: true,
      message:
        discovery.businesses.length > 0
          ? "Token validado e protegido. Agora escolha a estrutura Meta."
          : "Token validado e protegido. A Meta nao listou as BMs; informe o ID da estrutura.",
      discovery,
    };
  } catch (error) {
    return failure(error, "Nao foi possivel validar este token na Meta.");
  }
}

export async function discoverMetaManualAssetsAction(
  credentialId: string,
  businessId?: string | null,
): Promise<MetaManualActionResult> {
  try {
    const query = businessId
      ? `?businessId=${encodeURIComponent(businessId)}`
      : "";
    const discovery = await serverApiFetch<MetaManualAssetDiscoveryDto>(
      `/integrations/meta/manual/credentials/${encodeURIComponent(credentialId)}/assets${query}`,
    );

    return {
      ok: true,
      message: "Ativos acessiveis carregados.",
      discovery,
    };
  } catch (error) {
    return failure(error, "Nao foi possivel consultar os ativos deste token.");
  }
}

export async function createMetaManualConnectionAction(
  formData: FormData,
): Promise<MetaManualActionResult> {
  try {
    const destinationMode = requiredFormText(formData, "destinationMode");
    const destination =
      destinationMode === "existing"
        ? {
            existingDestinationId: requiredFormText(
              formData,
              "existingDestinationId",
            ),
          }
        : {
            label: optionalFormText(formData, "destinationLabel") ?? undefined,
            ownerBusinessManagerId:
              optionalFormText(formData, "ownerBusinessManagerId") ?? null,
            pixelId: requiredFormText(formData, "pixelId"),
            pageId: requiredFormText(formData, "pageId"),
          };
    const configuration = await serverApiFetch<MetaManualConfigurationDto>(
      "/integrations/meta/manual/connections",
      {
        method: "POST",
        body: JSON.stringify({
          credentialId: requiredFormText(formData, "credentialId"),
          businessManagerId: requiredFormText(formData, "businessManagerId"),
          businessManagerName: requiredFormText(
            formData,
            "businessManagerName",
          ),
          adAccountIds: formData
            .getAll("adAccountIds")
            .map(String)
            .filter(Boolean),
          destination,
        }),
      },
    );

    revalidatePath("/integrations");
    return {
      ok: true,
      message: "Estrutura Meta validada e ativada.",
      configuration,
    };
  } catch (error) {
    return failure(error, "Nao foi possivel ativar esta estrutura Meta.");
  }
}

export async function rotateMetaManualCredentialAction(
  credentialId: string,
  formData: FormData,
): Promise<MetaManualActionResult> {
  try {
    const configuration = await serverApiFetch<MetaManualConfigurationDto>(
      `/integrations/meta/manual/credentials/${encodeURIComponent(credentialId)}/rotate`,
      {
        method: "PUT",
        body: JSON.stringify({
          accessToken: requiredFormText(formData, "accessToken"),
        }),
      },
    );

    revalidatePath("/integrations");
    return {
      ok: true,
      message: "Token substituido depois da validacao completa.",
      configuration,
    };
  } catch (error) {
    return failure(
      error,
      "O novo token nao acessa toda a estrutura desta conexao.",
    );
  }
}

export async function setMetaManualConnectionStatusAction(
  connectionId: string,
  status: "active" | "paused",
): Promise<MetaManualActionResult> {
  try {
    const configuration = await serverApiFetch<MetaManualConfigurationDto>(
      `/integrations/meta/manual/connections/${encodeURIComponent(connectionId)}/status`,
      {
        method: "PUT",
        body: JSON.stringify({ status }),
      },
    );

    revalidatePath("/integrations");
    return {
      ok: true,
      message:
        status === "paused"
          ? "Conexao pausada. As outras BMs continuam ativas."
          : "Conexao reativada.",
      configuration,
    };
  } catch (error) {
    return failure(error, "Nao foi possivel alterar esta conexao.");
  }
}

export async function testMetaManualConnectionAction(
  connectionId: string,
): Promise<MetaManualActionResult> {
  try {
    const testResult = await serverApiFetch<MetaManualConnectionTestResultDto>(
      `/integrations/meta/manual/connections/${encodeURIComponent(connectionId)}/test`,
      { method: "POST", body: "{}" },
    );

    revalidatePath("/integrations");
    return {
      ok: true,
      message: testResult.message,
      testResult,
    };
  } catch (error) {
    return failure(error, "A conexao nao passou na validacao da Meta.");
  }
}

export async function setMetaManualAccountDestinationAction(
  reportingAccountId: string,
  conversionDestinationId: string | null,
): Promise<MetaManualActionResult> {
  try {
    const configuration = await serverApiFetch<MetaManualConfigurationDto>(
      `/integrations/meta/manual/reporting-accounts/${encodeURIComponent(reportingAccountId)}/destination`,
      {
        method: "PUT",
        body: JSON.stringify({ conversionDestinationId }),
      },
    );

    revalidatePath("/integrations");
    return {
      ok: true,
      message: conversionDestinationId
        ? "Destino especifico aplicado a esta conta."
        : "A conta voltou a usar o destino padrao da BM.",
      configuration,
    };
  } catch (error) {
    return failure(error, "Nao foi possivel alterar o destino desta conta.");
  }
}

function requiredFormText(formData: FormData, key: string): string {
  const value = optionalFormText(formData, key);

  if (!value) {
    throw new Error(`Campo obrigatorio ausente: ${key}`);
  }

  return value;
}

function optionalFormText(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function failure(error: unknown, fallback: string): MetaManualActionResult {
  return {
    ok: false,
    message:
      isApiRequestError(error) && error.message.trim()
        ? error.message
        : fallback,
  };
}
