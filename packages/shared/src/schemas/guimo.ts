import { z } from "zod";
import { conversionEventNameSchema } from "./conversion-events";

const idSchema = z.string().trim().min(1).max(255);
const dateTimeSchema = z.string().datetime();
const guimoStageNameSchema = z.string().trim().min(1).max(255);

export const guimoConversionRuleValueModeSchema = z.enum(["dynamic", "fixed"]);
export const guimoConversionRuleSchema = z.object({
  id: idSchema,
  stageName: guimoStageNameSchema,
  eventName: conversionEventNameSchema,
  valueMode: guimoConversionRuleValueModeSchema,
  fixedValueCents: z.number().int().positive().nullable(),
  active: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}).superRefine((value, context) => {
  if (value.valueMode === "fixed" && value.fixedValueCents === null) context.addIssue({ code: z.ZodIssueCode.custom, message: "fixedValueCents e obrigatorio para valor fixo", path: ["fixedValueCents"] });
  if (value.valueMode === "dynamic" && value.fixedValueCents !== null) context.addIssue({ code: z.ZodIssueCode.custom, message: "fixedValueCents deve ser nulo para valor dinamico", path: ["fixedValueCents"] });
});

export const guimoConversionRuleCreateInputSchema = z.object({
  stageName: guimoStageNameSchema,
  eventName: conversionEventNameSchema,
  valueMode: guimoConversionRuleValueModeSchema,
  fixedValueCents: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.valueMode === "fixed" && !value.fixedValueCents) context.addIssue({ code: z.ZodIssueCode.custom, message: "fixedValueCents e obrigatorio para valor fixo", path: ["fixedValueCents"] });
  if (value.valueMode === "dynamic" && value.fixedValueCents != null) context.addIssue({ code: z.ZodIssueCode.custom, message: "fixedValueCents deve ser nulo para valor dinamico", path: ["fixedValueCents"] });
});

export const guimoConversionRuleUpdateInputSchema = z.object({
  stageName: guimoStageNameSchema.optional(),
  eventName: conversionEventNameSchema.optional(),
  valueMode: guimoConversionRuleValueModeSchema.optional(),
  fixedValueCents: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), { message: "Informe ao menos um campo para atualizar" });

/** Safe, persisted Guimo integration data. Deliberately excludes all secrets. */
export const guimoIntegrationSchema = z.object({
  id: idSchema,
  status: z.enum(["active", "blocked", "paused"]),
  webhookVersion: z.string().trim().min(1).max(80),
  qualifiedStageId: z.string().nullable(),
  qualifiedStageName: z.string().nullable(),
  purchaseStageId: z.string().nullable(),
  purchaseStageName: z.string().nullable(),
  purchaseCurrency: z.string().nullable(),
  purchaseValueUnit: z.enum(["major", "cents"]).nullable(),
  hasCrmHeaders: z.boolean(),
  rules: z.array(guimoConversionRuleSchema),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const guimoIntegrationListSchema = z.array(guimoIntegrationSchema);

const guimoOneTimeWebhookSchema = z.object({
  // Guimo can only be configured with a target URL, not a custom header, so
  // the URL itself must be the credential: the capability token is embedded
  // in webhookUrl/webhookPath's `token` query param and never exposed as a
  // separate field (nothing to display, copy or accidentally log on its own).
  // API_PUBLIC_URL is optional in local/development deployments.
  webhookUrl: z.string().url().nullable(),
  // Relative fallback for when webhookUrl is null; still carries the token.
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

const optionalStageFieldSchema = z.string().trim().min(1).max(255).nullable().optional();
const optionalPurchaseCurrencySchema = z.string().trim().min(1).max(10).nullable().optional();
const optionalPurchaseValueUnitSchema = z.enum(["major", "cents"]).nullable().optional();

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

export const guimoIntegrationProvisionInputSchema = z.object({
  qualifiedStageId: optionalStageFieldSchema,
  qualifiedStageName: optionalStageFieldSchema,
  purchaseStageId: optionalStageFieldSchema,
  purchaseStageName: optionalStageFieldSchema,
  purchaseCurrency: optionalPurchaseCurrencySchema,
  purchaseValueUnit: optionalPurchaseValueUnitSchema,
  crmHeaders: guimoIntegrationCrmHeadersInputSchema.optional(),
});

export type GuimoIntegrationProvisionInputDto = z.infer<
  typeof guimoIntegrationProvisionInputSchema
>;

/** Partial edit of an existing integration: any single field is enough, since
 * (unlike provisioning) the integration already exists. */
export const guimoIntegrationUpdateInputSchema = z
  .object({
    qualifiedStageId: optionalStageFieldSchema,
    qualifiedStageName: optionalStageFieldSchema,
    purchaseStageId: optionalStageFieldSchema,
    purchaseStageName: optionalStageFieldSchema,
    purchaseCurrency: optionalPurchaseCurrencySchema,
    purchaseValueUnit: optionalPurchaseValueUnitSchema,
    crmHeaders: guimoIntegrationCrmHeadersInputSchema.optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    { message: "Informe ao menos um campo para atualizar" },
  );

export type GuimoIntegrationUpdateInputDto = z.infer<
  typeof guimoIntegrationUpdateInputSchema
>;

export const guimoIntegrationSetActiveInputSchema = z.object({
  active: z.boolean(),
});

export type GuimoIntegrationSetActiveInputDto = z.infer<
  typeof guimoIntegrationSetActiveInputSchema
>;

export type GuimoIntegrationDto = z.infer<typeof guimoIntegrationSchema>;
export type GuimoConversionRuleDto = z.infer<typeof guimoConversionRuleSchema>;
export type GuimoConversionRuleCreateInputDto = z.infer<typeof guimoConversionRuleCreateInputSchema>;
export type GuimoConversionRuleUpdateInputDto = z.infer<typeof guimoConversionRuleUpdateInputSchema>;
export type GuimoIntegrationListDto = z.infer<typeof guimoIntegrationListSchema>;
export type GuimoIntegrationProvisionResultDto = z.infer<
  typeof guimoIntegrationProvisionResultSchema
>;
export type GuimoIntegrationRotateWebhookTokenResultDto = z.infer<
  typeof guimoIntegrationRotateWebhookTokenResultSchema
>;
