import { z } from "zod";

const idSchema = z.string().trim().min(1).max(255);
const dateTimeSchema = z.string().datetime();
const oneTimeWebhookTokenSchema = z.string().min(43).max(512);

/** Safe, persisted Guimo integration data. Deliberately excludes all secrets. */
export const guimoIntegrationSchema = z.object({
  id: idSchema,
  status: z.enum(["active", "blocked"]),
  webhookVersion: z.string().trim().min(1).max(80),
  qualifiedStageId: z.string().nullable(),
  qualifiedStageName: z.string().nullable(),
  purchaseStageId: z.string().nullable(),
  purchaseStageName: z.string().nullable(),
  purchaseCurrency: z.string().nullable(),
  purchaseValueUnit: z.enum(["major", "cents"]).nullable(),
  hasCrmHeaders: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const guimoIntegrationListSchema = z.array(guimoIntegrationSchema);

const guimoOneTimeWebhookSchema = z.object({
  webhookToken: oneTimeWebhookTokenSchema,
  // API_PUBLIC_URL is optional in local/development deployments.
  webhookUrl: z.string().url().nullable(),
  // This path never embeds the token; callers send it in the documented header.
  webhookPath: z.string().startsWith("/webhooks/guimo/v1/"),
});

export const guimoIntegrationProvisionResultSchema =
  guimoIntegrationSchema.pick({ id: true, status: true, webhookVersion: true }).extend(
    guimoOneTimeWebhookSchema.shape,
  );

export const guimoIntegrationRotateWebhookTokenResultSchema =
  guimoIntegrationSchema.pick({ id: true, status: true, webhookVersion: true }).extend(
    guimoOneTimeWebhookSchema.shape,
  );

/** Client-side pre-validation for the provision/create form. Mirrors, but does not
 * replace, the backend's own `parseGuimoConfiguration` validation. */
export const guimoCrmHeaderNames = ["authorization", "x-api-key"] as const;

const stageFieldSchema = z.string().trim().min(1).max(255).optional();

export const guimoIntegrationCrmHeadersInputSchema = z
  .record(z.string(), z.string().trim().min(1))
  .refine(
    (headers) =>
      Object.keys(headers).every((name) =>
        (guimoCrmHeaderNames as readonly string[]).includes(
          name.trim().toLowerCase(),
        ),
      ),
    { message: "Apenas os cabecalhos Authorization e X-API-Key sao aceitos" },
  );

export const guimoIntegrationProvisionInputSchema = z
  .object({
    qualifiedStageId: stageFieldSchema,
    qualifiedStageName: stageFieldSchema,
    purchaseStageId: stageFieldSchema,
    purchaseStageName: stageFieldSchema,
    purchaseCurrency: z.string().trim().min(1).max(10).optional(),
    purchaseValueUnit: z.enum(["major", "cents"]).optional(),
    crmHeaders: guimoIntegrationCrmHeadersInputSchema.optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.qualifiedStageId ||
          value.qualifiedStageName ||
          value.purchaseStageId ||
          value.purchaseStageName,
      ),
    { message: "Informe ao menos um estagio (qualificado ou compra)" },
  );

export type GuimoIntegrationProvisionInputDto = z.infer<
  typeof guimoIntegrationProvisionInputSchema
>;

export type GuimoIntegrationDto = z.infer<typeof guimoIntegrationSchema>;
export type GuimoIntegrationListDto = z.infer<typeof guimoIntegrationListSchema>;
export type GuimoIntegrationProvisionResultDto = z.infer<
  typeof guimoIntegrationProvisionResultSchema
>;
export type GuimoIntegrationRotateWebhookTokenResultDto = z.infer<
  typeof guimoIntegrationRotateWebhookTokenResultSchema
>;
