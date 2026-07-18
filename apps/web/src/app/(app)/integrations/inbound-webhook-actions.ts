"use server";

import {
  inboundWebhookChannelRoutesUpdateInputSchema,
  inboundWebhookChannelStatusUpdateInputSchema,
  inboundWebhookConnectionCreateInputSchema,
  inboundWebhookConnectionCreateResultSchema,
  inboundWebhookConnectionRotateSecretResultSchema,
  inboundWebhookConnectionStatusUpdateInputSchema,
  type InboundWebhookChannelRoutesUpdateInputDto,
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";

export type InboundWebhookOneTimeSecret = {
  connectionId: string;
  webhookUrl: string;
};

export type InboundWebhookActionResult = {
  ok: boolean;
  message: string;
  oneTimeSecret?: InboundWebhookOneTimeSecret;
};

const integrationsPath = "/integrations";
const invalidFormMessage = "Revise os dados informados e tente novamente.";

export async function createInboundWebhookConnectionAction(
  formData: FormData,
): Promise<InboundWebhookActionResult> {
  const input = inboundWebhookConnectionCreateInputSchema.safeParse({
    provider: formText(formData, "provider"),
    displayName: formText(formData, "displayName"),
  });

  if (!input.success) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      "/integrations/inbound-webhooks",
      {
        method: "POST",
        body: JSON.stringify(input.data),
      },
    );
    const result =
      inboundWebhookConnectionCreateResultSchema.safeParse(response);

    if (!result.success) {
      return failure("Nao foi possivel criar a conexao Umbler.");
    }

    revalidatePath(integrationsPath);
    return {
      ok: true,
      message:
        "Conexao Umbler criada. Copie a URL agora; ela nao sera exibida novamente.",
      oneTimeSecret: {
        connectionId: result.data.connection.id,
        webhookUrl: result.data.webhookUrl,
      },
    };
  } catch {
    return failure("Nao foi possivel criar a conexao Umbler.");
  }
}

export async function rotateInboundWebhookSecretAction(
  formData: FormData,
): Promise<InboundWebhookActionResult> {
  const connectionId = formId(formData, "connectionId");

  if (!connectionId) {
    return failure(invalidFormMessage);
  }

  try {
    const response = await serverApiFetch<unknown>(
      `/integrations/inbound-webhooks/${encodeURIComponent(connectionId)}/rotate-secret`,
      {
        method: "POST",
        body: "{}",
      },
    );
    const result =
      inboundWebhookConnectionRotateSecretResultSchema.safeParse(response);

    if (!result.success || result.data.connectionId !== connectionId) {
      return failure("Nao foi possivel rotacionar o segredo desta conexao.");
    }

    revalidatePath(integrationsPath);
    return {
      ok: true,
      message:
        "Segredo rotacionado. Copie a nova URL agora; ela nao sera exibida novamente.",
      oneTimeSecret: {
        connectionId: result.data.connectionId,
        webhookUrl: result.data.webhookUrl,
      },
    };
  } catch {
    return failure("Nao foi possivel rotacionar o segredo desta conexao.");
  }
}

export async function setInboundWebhookConnectionStatusAction(
  formData: FormData,
): Promise<InboundWebhookActionResult> {
  const connectionId = formId(formData, "connectionId");
  const input = inboundWebhookConnectionStatusUpdateInputSchema.safeParse({
    status: formText(formData, "status"),
  });

  if (!connectionId || !input.success) {
    return failure(invalidFormMessage);
  }

  try {
    await serverApiFetch<unknown>(
      `/integrations/inbound-webhooks/${encodeURIComponent(connectionId)}/status`,
      {
        method: "PUT",
        body: JSON.stringify(input.data),
      },
    );

    revalidatePath(integrationsPath);
    return {
      ok: true,
      message:
        input.data.status === "paused"
          ? "Conexao pausada. A observacao foi interrompida."
          : "Conexao retomada em modo de observacao.",
    };
  } catch {
    return failure("Nao foi possivel alterar o status desta conexao.");
  }
}

export async function removeInboundWebhookConnectionAction(
  formData: FormData,
): Promise<InboundWebhookActionResult> {
  const connectionId = formId(formData, "connectionId");

  if (!connectionId) {
    return failure(invalidFormMessage);
  }

  try {
    await deleteApiResource(
      `/integrations/inbound-webhooks/${encodeURIComponent(connectionId)}`,
    );

    revalidatePath(integrationsPath);
    return {
      ok: true,
      message: "Conexao removida. O historico de observacao foi preservado.",
    };
  } catch {
    return failure("Nao foi possivel remover esta conexao.");
  }
}

export async function setInboundWebhookChannelStatusAction(
  formData: FormData,
): Promise<InboundWebhookActionResult> {
  const channelId = formId(formData, "channelId");
  const input = inboundWebhookChannelStatusUpdateInputSchema.safeParse({
    status: formText(formData, "status"),
  });

  if (!channelId || !input.success) {
    return failure(invalidFormMessage);
  }

  try {
    await serverApiFetch<unknown>(
      `/integrations/inbound-webhooks/channels/${encodeURIComponent(channelId)}/status`,
      {
        method: "PUT",
        body: JSON.stringify(input.data),
      },
    );

    revalidatePath(integrationsPath);
    return {
      ok: true,
      message:
        input.data.status === "paused"
          ? "Canal pausado. Os demais canais continuam inalterados."
          : "Canal ativado para observacao.",
    };
  } catch {
    return failure("Nao foi possivel alterar o status deste canal.");
  }
}

export async function saveInboundWebhookChannelRoutesAction(
  formData: FormData,
): Promise<InboundWebhookActionResult> {
  const channelId = formId(formData, "channelId");
  const input = channelRoutesInput(formData);

  if (!channelId || !input) {
    return failure(invalidFormMessage);
  }

  try {
    await serverApiFetch<unknown>(
      `/integrations/inbound-webhooks/channels/${encodeURIComponent(channelId)}/routes`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );

    revalidatePath(integrationsPath);
    return {
      ok: true,
      message: "Rotas do canal salvas para observacao.",
    };
  } catch {
    return failure("Nao foi possivel salvar as rotas deste canal.");
  }
}

export async function removeInboundWebhookChannelRouteAction(
  formData: FormData,
): Promise<InboundWebhookActionResult> {
  const channelId = formId(formData, "channelId");
  const routeId = formId(formData, "routeId");

  if (!channelId || !routeId) {
    return failure(invalidFormMessage);
  }

  try {
    await deleteApiResource(
      `/integrations/inbound-webhooks/channels/${encodeURIComponent(channelId)}/routes/${encodeURIComponent(routeId)}`,
    );

    revalidatePath(integrationsPath);
    return {
      ok: true,
      message: "Rota removida do canal.",
    };
  } catch {
    return failure("Nao foi possivel remover esta rota.");
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

function channelRoutesInput(
  formData: FormData,
): InboundWebhookChannelRoutesUpdateInputDto | null {
  const value = formText(formData, "routes");

  if (!value || value.length > 100_000) {
    return null;
  }

  try {
    const input = inboundWebhookChannelRoutesUpdateInputSchema.safeParse({
      routes: JSON.parse(value),
    });

    return input.success ? input.data : null;
  } catch {
    return null;
  }
}

async function deleteApiResource(path: string): Promise<void> {
  await serverApiFetch<void>(path, { method: "DELETE" });
}

function failure(message: string): InboundWebhookActionResult {
  return { ok: false, message };
}
