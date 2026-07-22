"use server";

import {
  providerConversionEndpointSecretResultSchema,
  providerConversionRuleAdaptInputSchema,
  providerConversionRuleCreateInputSchema,
  providerConversionRuleCreateResultSchema,
  providerConversionRuleSchema,
  providerConversionRuleUpdateInputSchema,
  structuredCatalogTestMessageInputSchema,
  structuredCatalogTestMessageResultSchema,
  type StructuredCatalogTestMessageResultDto,
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";

export type ProviderConversionRuleOneTimeSecret = {
  ruleId: string;
  webhookUrl: string;
};

export type ProviderConversionRuleActionResult = {
  ok: boolean;
  message: string;
  oneTimeSecret?: ProviderConversionRuleOneTimeSecret;
  testResult?: StructuredCatalogTestMessageResultDto;
};

const integrationsPath = "/integrations";
const settingsPath = "/settings";
const invalidFormMessage = "Revise os dados informados e tente novamente.";

function revalidateConversionRulePaths() {
  revalidatePath(integrationsPath);
  revalidatePath(settingsPath);
}

export async function createProviderConversionRuleAction(
  formData: FormData,
): Promise<ProviderConversionRuleActionResult> {
  const input = parsePayload(
    formData,
    providerConversionRuleCreateInputSchema.safeParse,
  );

  if (!input) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      "/conversion-rules/providers",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    const result = providerConversionRuleCreateResultSchema.safeParse(response);

    if (!result.success) {
      return failure("Nao foi possivel criar a regra de conversao.");
    }

    revalidateConversionRulePaths();
    return {
      ok: true,
      message: result.data.webhookUrl
        ? "Regra criada. Copie a URL da automacao agora; ela nao sera exibida novamente."
        : "Catalogo criado em modo de observacao.",
      ...(result.data.webhookUrl
        ? {
            oneTimeSecret: {
              ruleId: result.data.rule.id,
              webhookUrl: result.data.webhookUrl,
            },
          }
        : {}),
    };
  } catch {
    return failure("Nao foi possivel criar a regra de conversao.");
  }
}

export async function updateProviderConversionRuleAction(
  formData: FormData,
): Promise<ProviderConversionRuleActionResult> {
  const ruleId = formId(formData, "ruleId");
  const input = parsePayload(
    formData,
    providerConversionRuleUpdateInputSchema.safeParse,
  );

  if (!ruleId || !input) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/conversion-rules/providers/${encodeURIComponent(ruleId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
    const result = providerConversionRuleSchema.safeParse(response);

    if (!result.success || result.data.id !== ruleId) {
      return failure("Nao foi possivel atualizar a regra de conversao.");
    }

    revalidateConversionRulePaths();
    return {
      ok: true,
      message: result.data.conversionRule.active
        ? "Regra de conversao atualizada."
        : "Regra de conversao pausada.",
    };
  } catch {
    return failure("Nao foi possivel atualizar a regra de conversao.");
  }
}

export async function rotateProviderConversionRuleEndpointAction(
  formData: FormData,
): Promise<ProviderConversionRuleActionResult> {
  const ruleId = formId(formData, "ruleId");

  if (!ruleId) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/conversion-rules/providers/${encodeURIComponent(ruleId)}/rotate-endpoint`,
      {
        method: "POST",
        body: "{}",
      },
    );
    const result =
      providerConversionEndpointSecretResultSchema.safeParse(response);

    if (!result.success || result.data.endpoint.providerRuleId !== ruleId) {
      return failure("Nao foi possivel gerar uma nova URL de automacao.");
    }

    revalidateConversionRulePaths();
    return {
      ok: true,
      message:
        "URL rotacionada. Copie a nova URL agora; a anterior foi invalidada.",
      oneTimeSecret: {
        ruleId,
        webhookUrl: result.data.webhookUrl,
      },
    };
  } catch {
    return failure("Nao foi possivel gerar uma nova URL de automacao.");
  }
}

export async function removeProviderConversionRuleAction(
  formData: FormData,
): Promise<ProviderConversionRuleActionResult> {
  const ruleId = formId(formData, "ruleId");

  if (!ruleId) {
    return failure(invalidFormMessage);
  }

  try {
    await serverApiFetch<void>(
      `/conversion-rules/providers/${encodeURIComponent(ruleId)}`,
      { method: "DELETE" },
    );

    revalidateConversionRulePaths();
    return {
      ok: true,
      message: "Regra removida. O historico observado foi preservado.",
    };
  } catch {
    return failure("Nao foi possivel remover a regra de conversao.");
  }
}

export async function adaptProviderConversionRuleAction(
  formData: FormData,
): Promise<ProviderConversionRuleActionResult> {
  const legacyRuleId = formId(formData, "legacyRuleId");
  const input = parsePayload(
    formData,
    providerConversionRuleAdaptInputSchema.safeParse,
  );

  if (!legacyRuleId || !input) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/conversion-rules/providers/adapt/${encodeURIComponent(legacyRuleId)}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    const result = providerConversionRuleSchema.safeParse(response);

    if (!result.success || result.data.conversionRule.id !== legacyRuleId) {
      return failure("Nao foi possivel adaptar esta regra para a Umbler.");
    }

    revalidateConversionRulePaths();
    return {
      ok: true,
      message: "Regra vinculada aos canais Umbler e mantida em observacao.",
    };
  } catch {
    return failure("Nao foi possivel adaptar esta regra para a Umbler.");
  }
}

export async function testProviderCatalogMessageAction(
  formData: FormData,
): Promise<ProviderConversionRuleActionResult> {
  const ruleId = formId(formData, "ruleId");
  const input = structuredCatalogTestMessageInputSchema.safeParse({
    messageText: formText(formData, "messageText"),
  });

  if (!ruleId || !input.success) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/conversion-rules/providers/${encodeURIComponent(ruleId)}/test-message`,
      {
        method: "POST",
        body: JSON.stringify(input.data),
      },
    );
    const result = structuredCatalogTestMessageResultSchema.safeParse(response);

    if (!result.success) {
      return failure("Nao foi possivel testar esta mensagem.");
    }

    return {
      ok: true,
      message: result.data.matched
        ? "Mensagem reconhecida pelo catalogo."
        : "A mensagem foi bloqueada pelo catalogo.",
      testResult: result.data,
    };
  } catch {
    return failure("Nao foi possivel testar esta mensagem.");
  }
}

function parsePayload<T>(
  formData: FormData,
  parse: (value: unknown) => { success: true; data: T } | { success: false },
): T | null {
  const value = formText(formData, "payload");

  if (!value || value.length > 500_000) {
    return null;
  }

  try {
    const parsed = parse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function formText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formId(formData: FormData, key: string): string | null {
  const value = formText(formData, key);

  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return null;
  }

  return value;
}

function failure(message: string): ProviderConversionRuleActionResult {
  return { ok: false, message };
}
