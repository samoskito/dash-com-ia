"use server";

import {
  guimoConversionRuleCreateInputSchema,
  guimoConversionRuleSchema,
  guimoConversionRuleUpdateInputSchema,
  guimoIntegrationProvisionInputSchema,
  guimoIntegrationProvisionResultSchema,
  guimoIntegrationRotateWebhookTokenResultSchema,
  guimoIntegrationSchema,
  guimoIntegrationUpdateInputSchema,
  type GuimoConversionRuleDto,
  type GuimoIntegrationDto,
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";

export type GuimoOneTimeWebhook = {
  webhookToken: string;
  webhookUrl: string | null;
  webhookPath: string;
};

export type GuimoActionResult = {
  ok: boolean;
  message: string;
  oneTimeWebhook?: GuimoOneTimeWebhook;
};

// Guimo agora vive em Configuracoes > Gatilhos, nao mais em /integrations.
const settingsPath = "/settings";
const invalidFormMessage = "Revise os dados informados e tente novamente.";

export type GuimoRuleActionResult = {
  ok: boolean;
  message: string;
  integration?: GuimoIntegrationDto;
};

export type GuimoConversionRuleActionResult = {
  ok: boolean;
  message: string;
  rule?: GuimoConversionRuleDto;
};

export async function provisionGuimoIntegrationAction(
  formData: FormData,
): Promise<GuimoActionResult> {
  const workspaceId = formId(formData, "workspaceId");

  if (!workspaceId) {
    return failure(invalidFormMessage);
  }

  const input = guimoIntegrationProvisionInputSchema.safeParse({
    purchaseCurrency: formText(formData, "purchaseCurrency") ?? undefined,
    purchaseValueUnit: formText(formData, "purchaseValueUnit") ?? undefined,
    crmHeaders: crmHeadersInput(formData),
  });

  if (!input.success) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guimo/integrations`,
      {
        method: "POST",
        body: JSON.stringify(input.data),
      },
    );
    const result = guimoIntegrationProvisionResultSchema.safeParse(response);

    if (!result.success) {
      return failure("Nao foi possivel provisionar a integracao Guimo.");
    }

    revalidatePath(settingsPath);
    return {
      ok: true,
      message:
        "Integracao Guimo criada. Copie o token e a URL agora; eles nao serao exibidos novamente.",
      oneTimeWebhook: {
        webhookToken: result.data.webhookToken,
        webhookUrl: result.data.webhookUrl,
        webhookPath: result.data.webhookPath,
      },
    };
  } catch {
    return failure("Nao foi possivel provisionar a integracao Guimo.");
  }
}

export async function rotateGuimoWebhookTokenAction(
  formData: FormData,
): Promise<GuimoActionResult> {
  const workspaceId = formId(formData, "workspaceId");
  const integrationId = formId(formData, "integrationId");

  if (!workspaceId || !integrationId) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guimo/integrations/${encodeURIComponent(integrationId)}/rotate-webhook-token`,
      {
        method: "POST",
        body: "{}",
      },
    );
    const result =
      guimoIntegrationRotateWebhookTokenResultSchema.safeParse(response);

    if (!result.success) {
      return failure("Nao foi possivel rotacionar o token deste webhook.");
    }

    revalidatePath(settingsPath);
    return {
      ok: true,
      message:
        "Token rotacionado. Copie o novo token agora; ele nao sera exibido novamente.",
      oneTimeWebhook: {
        webhookToken: result.data.webhookToken,
        webhookUrl: result.data.webhookUrl,
        webhookPath: result.data.webhookPath,
      },
    };
  } catch {
    return failure("Nao foi possivel rotacionar o token deste webhook.");
  }
}

export async function updateGuimoIntegrationAction(
  formData: FormData,
): Promise<GuimoRuleActionResult> {
  const workspaceId = formId(formData, "workspaceId");
  const integrationId = formId(formData, "integrationId");

  if (!workspaceId || !integrationId) {
    return ruleFailure(invalidFormMessage);
  }

  const input = guimoIntegrationUpdateInputSchema.safeParse({
    purchaseCurrency: formText(formData, "purchaseCurrency") ?? undefined,
    purchaseValueUnit: formText(formData, "purchaseValueUnit") ?? undefined,
    crmHeaders: crmHeadersInput(formData),
  });

  if (!input.success) {
    return ruleFailure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guimo/integrations/${encodeURIComponent(integrationId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input.data),
      },
    );
    const result = guimoIntegrationSchema.safeParse(response);

    if (!result.success) {
      return ruleFailure("Nao foi possivel atualizar a regra Guimo.");
    }

    revalidatePath(settingsPath);
    return {
      ok: true,
      message: "Regra Guimo atualizada.",
      integration: result.data,
    };
  } catch {
    return ruleFailure("Nao foi possivel atualizar a regra Guimo.");
  }
}

export async function setGuimoIntegrationActiveAction(
  formData: FormData,
): Promise<GuimoRuleActionResult> {
  const workspaceId = formId(formData, "workspaceId");
  const integrationId = formId(formData, "integrationId");
  const active = formData.get("active") === "true";

  if (!workspaceId || !integrationId) {
    return ruleFailure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guimo/integrations/${encodeURIComponent(integrationId)}/active`,
      {
        method: "POST",
        body: JSON.stringify({ active }),
      },
    );
    const result = guimoIntegrationSchema.safeParse(response);

    if (!result.success) {
      return ruleFailure("Nao foi possivel alterar o status da regra Guimo.");
    }

    revalidatePath(settingsPath);
    return {
      ok: true,
      message: active ? "Regra Guimo retomada." : "Regra Guimo pausada.",
      integration: result.data,
    };
  } catch {
    return ruleFailure("Nao foi possivel alterar o status da regra Guimo.");
  }
}

export async function createGuimoConversionRuleAction(
  formData: FormData,
): Promise<GuimoConversionRuleActionResult> {
  const workspaceId = formId(formData, "workspaceId");
  const integrationId = formId(formData, "integrationId");

  if (!workspaceId || !integrationId) {
    return conversionRuleFailure(invalidFormMessage);
  }

  const valueMode = formText(formData, "valueMode") === "fixed" ? "fixed" : "dynamic";
  const fixedValueCents =
    valueMode === "fixed"
      ? parseMoneyToCents(formData.get("fixedValueAmount"))
      : null;

  if (valueMode === "fixed" && !fixedValueCents) {
    return conversionRuleFailure("Informe um valor fixo maior que zero.");
  }

  const input = guimoConversionRuleCreateInputSchema.safeParse({
    stageName: formText(formData, "stageName") ?? undefined,
    eventName: formText(formData, "eventName") ?? undefined,
    valueMode,
    fixedValueCents,
  });

  if (!input.success) {
    return conversionRuleFailure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guimo/integrations/${encodeURIComponent(integrationId)}/rules`,
      {
        method: "POST",
        body: JSON.stringify(input.data),
      },
    );
    const result = guimoConversionRuleSchema.safeParse(response);

    if (!result.success) {
      return conversionRuleFailure("Nao foi possivel criar a regra Guimo.");
    }

    revalidatePath(settingsPath);
    return { ok: true, message: "Regra Guimo criada.", rule: result.data };
  } catch {
    return conversionRuleFailure("Nao foi possivel criar a regra Guimo.");
  }
}

export async function updateGuimoConversionRuleAction(
  formData: FormData,
): Promise<GuimoConversionRuleActionResult> {
  const workspaceId = formId(formData, "workspaceId");
  const integrationId = formId(formData, "integrationId");
  const ruleId = formId(formData, "ruleId");

  if (!workspaceId || !integrationId || !ruleId) {
    return conversionRuleFailure(invalidFormMessage);
  }

  const rawValueMode = formText(formData, "valueMode");
  const valueMode =
    rawValueMode === "fixed" || rawValueMode === "dynamic"
      ? rawValueMode
      : undefined;
  const fixedValueAmountProvided = formData.has("fixedValueAmount");
  const fixedValueCents = fixedValueAmountProvided
    ? parseMoneyToCents(formData.get("fixedValueAmount"))
    : undefined;

  if (valueMode === "fixed" && fixedValueAmountProvided && !fixedValueCents) {
    return conversionRuleFailure("Informe um valor fixo maior que zero.");
  }

  const activeRaw = formText(formData, "active");

  const input = guimoConversionRuleUpdateInputSchema.safeParse({
    stageName: formText(formData, "stageName") ?? undefined,
    eventName: formText(formData, "eventName") ?? undefined,
    valueMode,
    fixedValueCents:
      valueMode === "dynamic"
        ? null
        : fixedValueAmountProvided
          ? fixedValueCents
          : undefined,
    active: activeRaw === null ? undefined : activeRaw === "true",
  });

  if (!input.success) {
    return conversionRuleFailure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guimo/integrations/${encodeURIComponent(integrationId)}/rules/${encodeURIComponent(ruleId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input.data),
      },
    );
    const result = guimoConversionRuleSchema.safeParse(response);

    if (!result.success) {
      return conversionRuleFailure("Nao foi possivel atualizar a regra Guimo.");
    }

    revalidatePath(settingsPath);
    return { ok: true, message: "Regra Guimo atualizada.", rule: result.data };
  } catch {
    return conversionRuleFailure("Nao foi possivel atualizar a regra Guimo.");
  }
}

export async function deleteGuimoConversionRuleAction(
  formData: FormData,
): Promise<GuimoConversionRuleActionResult> {
  const workspaceId = formId(formData, "workspaceId");
  const integrationId = formId(formData, "integrationId");
  const ruleId = formId(formData, "ruleId");

  if (!workspaceId || !integrationId || !ruleId) {
    return conversionRuleFailure(invalidFormMessage);
  }

  try {
    await serverApiFetch<unknown>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guimo/integrations/${encodeURIComponent(integrationId)}/rules/${encodeURIComponent(ruleId)}`,
      { method: "DELETE" },
    );

    revalidatePath(settingsPath);
    return { ok: true, message: "Regra Guimo removida." };
  } catch {
    return conversionRuleFailure("Nao foi possivel remover a regra Guimo.");
  }
}

function parseMoneyToCents(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : null;
}

function formText(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formId(formData: FormData, key: string): string | null {
  const value = formText(formData, key);

  if (!value || value.length > 255 || /[ -]/u.test(value)) {
    return null;
  }

  return value;
}

function crmHeadersInput(
  formData: FormData,
): Record<string, string> | undefined {
  const authorization = formText(formData, "crmAuthorization");
  const apiKey = formText(formData, "crmApiKey");

  if (!authorization && !apiKey) {
    return undefined;
  }

  const headers: Record<string, string> = {};

  if (authorization) {
    headers.authorization = authorization;
  }

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  return headers;
}

function failure(message: string): GuimoActionResult {
  return { ok: false, message };
}

function ruleFailure(message: string): GuimoRuleActionResult {
  return { ok: false, message };
}

function conversionRuleFailure(message: string): GuimoConversionRuleActionResult {
  return { ok: false, message };
}
