import { z } from "zod";
import { integrationStatuses } from "../statuses";

export const integrationProviderSchema = z.enum(["meta", "uazapi", "asaas"]);

export const integrationHealthSchema = z.object({
  provider: integrationProviderSchema,
  status: z.enum(integrationStatuses),
  checkedAt: z.string().datetime(),
  message: z.string().optional()
});

export const integrationHealthSummarySchema = z.object({
  checkedAt: z.string().datetime(),
  providers: z.array(integrationHealthSchema)
});

export const integrationStartActionSchema = z.object({
  provider: integrationProviderSchema,
  action: z.enum(["configure_env", "oauth_redirect", "open_checkout", "wait_webhook"]),
  label: z.string().min(1),
  href: z.string().min(1).optional(),
  missingEnv: z.array(z.string()).default([])
});

export const integrationPipelineStageSchema = z.object({
  key: z.enum(["ctwa", "webhook", "lead", "conversion_ready", "meta_sent"]),
  label: z.string().min(1),
  value: z.number().int().nonnegative(),
  detail: z.string().min(1)
});

export const whatsappDataSourceSchema = z.object({
  mode: z.enum(["native", "external"]),
  connectorName: z.string().min(1).nullable(),
  provider: z.string().min(1).nullable(),
  lastSyncCompletedAt: z.string().datetime().nullable(),
  lastSyncStatus: z.string().min(1).nullable(),
});

export const integrationPipelineOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  stages: z.array(integrationPipelineStageSchema),
  whatsappSource: whatsappDataSourceSchema.optional(),
});

export const metaOAuthCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

export const metaConnectionStatusSchema = z.enum([
  "not_connected",
  "connected",
  "needs_reconnect",
  "error"
]);

export const metaConnectionSchema = z.object({
  workspaceId: z.string().min(1),
  status: metaConnectionStatusSchema,
  tokenType: z.string().min(1).nullable(),
  scopes: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
  connectedAt: z.string().datetime().nullable(),
  selectedBusinessId: z.string().min(1).nullable(),
  selectedAdAccountId: z.string().min(1).nullable(),
  selectedPixelId: z.string().min(1).nullable(),
  capiTokenConfigured: z.boolean().default(false)
});

export const metaCapiTokenInputSchema = z
  .object({
    accessToken: z.string().trim().min(10).optional(),
    clear: z.boolean().optional().default(false)
  })
  .refine(
    (value) => value.clear || Boolean(value.accessToken),
    "Informe um token CAPI ou solicite limpar a configuracao"
  );

export const metaCapiTokenStatusSchema = z.object({
  workspaceId: z.string().min(1),
  configured: z.boolean(),
  updatedAt: z.string().datetime()
});

export const metaBusinessAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  verificationStatus: z.string().min(1).nullable()
});

export const metaAdAccountAssetSchema = z.object({
  id: z.string().min(1),
  businessId: z.string().min(1).nullable(),
  name: z.string().min(1),
  accountStatus: z.string().min(1).nullable(),
  currency: z.string().min(1).nullable(),
  timezoneName: z.string().min(1).nullable()
});

export const metaPixelAssetSchema = z.object({
  id: z.string().min(1),
  businessId: z.string().min(1).nullable(),
  name: z.string().min(1),
  code: z.string().min(1).nullable()
});

export const metaPageAssetSchema = z.object({
  id: z.string().min(1),
  businessId: z.string().min(1).nullable(),
  name: z.string().min(1)
});

export const metaConversionDestinationStatusSchema = z.enum([
  "needs_configuration",
  "configured",
  "error"
]);

export const metaConversionDestinationSchema = z.object({
  workspaceId: z.string().min(1),
  pixelId: z.string().min(1).nullable(),
  pixelName: z.string().min(1).nullable(),
  pageId: z.string().min(1).nullable(),
  pageName: z.string().min(1).nullable(),
  status: metaConversionDestinationStatusSchema,
  lastValidatedAt: z.string().datetime().nullable(),
  validationError: z.string().min(1).nullable()
});

export const metaConversionDestinationInputSchema = z.object({
  pixelId: z.string().trim().min(1),
  pixelName: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  pageName: z.string().trim().min(1)
});

export const metaAssetSyncStatusSchema = z.enum([
  "pending",
  "syncing",
  "synced",
  "error"
]);

export const metaReportingAccountSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  businessId: z.string().min(1),
  businessName: z.string().min(1),
  adAccountId: z.string().min(1),
  adAccountName: z.string().min(1),
  currency: z.string().min(1).nullable(),
  timezoneName: z.string().min(1).nullable(),
  active: z.boolean(),
  syncStatus: metaAssetSyncStatusSchema,
  lastSyncedAt: z.string().datetime().nullable(),
  lastSyncSince: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  lastSyncUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  syncError: z.string().min(1).nullable()
});

export const metaReportingAccountInputSchema = z.object({
  businessId: z.string().trim().min(1),
  businessName: z.string().trim().min(1),
  adAccountId: z.string().trim().min(1),
  adAccountName: z.string().trim().min(1),
  currency: z.string().trim().min(1).nullable().optional(),
  timezoneName: z.string().trim().min(1).nullable().optional()
});

export const metaReportingAccountStatusInputSchema = z.object({
  active: z.boolean()
});

export const metaAssetSelectionSchema = z.object({
  businessId: z.string().min(1).nullable(),
  adAccountId: z.string().min(1).nullable(),
  pixelId: z.string().min(1).nullable()
});

export const metaAssetsSchema = z.object({
  workspaceId: z.string().min(1),
  status: metaConnectionStatusSchema,
  businesses: z.array(metaBusinessAssetSchema),
  adAccounts: z.array(metaAdAccountAssetSchema),
  pixels: z.array(metaPixelAssetSchema),
  pages: z.array(metaPageAssetSchema).optional(),
  conversionDestination: metaConversionDestinationSchema.nullable().optional(),
  reportingAccounts: z.array(metaReportingAccountSchema).optional(),
  selection: metaAssetSelectionSchema,
  lastSyncedAt: z.string().datetime().nullable(),
  syncError: z.string().min(1).nullable()
});

export const metaAssetSelectionInputSchema = metaAssetSelectionSchema.refine(
  (value) => Boolean(value.businessId || value.adAccountId || value.pixelId),
  "Informe ao menos um ativo Meta"
);

export const metaOAuthCallbackResultSchema = z.object({
  provider: z.literal("meta"),
  status: z.enum(["configure_env", "connected", "exchange_failed"]),
  tokenType: z.string().min(1).nullable().default(null),
  expiresInSeconds: z.number().int().positive().nullable().default(null),
  scopes: z.array(z.string()).default([]),
  missingEnv: z.array(z.string()).default([]),
  connection: metaConnectionSchema.optional(),
  message: z.string().min(1).optional()
});

export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
export type IntegrationHealthDto = z.infer<typeof integrationHealthSchema>;
export type IntegrationHealthSummaryDto = z.infer<
  typeof integrationHealthSummarySchema
>;
export type IntegrationStartActionDto = z.infer<
  typeof integrationStartActionSchema
>;
export type IntegrationPipelineStageDto = z.infer<
  typeof integrationPipelineStageSchema
>;
export type IntegrationPipelineOverviewDto = z.infer<
  typeof integrationPipelineOverviewSchema
>;
export type WhatsappDataSourceDto = z.infer<typeof whatsappDataSourceSchema>;
export type MetaOAuthCallbackQueryDto = z.infer<
  typeof metaOAuthCallbackQuerySchema
>;
export type MetaOAuthCallbackResultDto = z.infer<
  typeof metaOAuthCallbackResultSchema
>;
export type MetaConnectionStatusDto = z.infer<
  typeof metaConnectionStatusSchema
>;
export type MetaConnectionDto = z.infer<typeof metaConnectionSchema>;
export type MetaCapiTokenInputDto = z.infer<typeof metaCapiTokenInputSchema>;
export type MetaCapiTokenStatusDto = z.infer<typeof metaCapiTokenStatusSchema>;
export type MetaBusinessAssetDto = z.infer<typeof metaBusinessAssetSchema>;
export type MetaAdAccountAssetDto = z.infer<typeof metaAdAccountAssetSchema>;
export type MetaPixelAssetDto = z.infer<typeof metaPixelAssetSchema>;
export type MetaPageAssetDto = z.infer<typeof metaPageAssetSchema>;
export type MetaConversionDestinationStatusDto = z.infer<
  typeof metaConversionDestinationStatusSchema
>;
export type MetaConversionDestinationDto = z.infer<
  typeof metaConversionDestinationSchema
>;
export type MetaConversionDestinationInputDto = z.infer<
  typeof metaConversionDestinationInputSchema
>;
export type MetaAssetSyncStatusDto = z.infer<
  typeof metaAssetSyncStatusSchema
>;
export type MetaReportingAccountDto = z.infer<
  typeof metaReportingAccountSchema
>;
export type MetaReportingAccountInputDto = z.infer<
  typeof metaReportingAccountInputSchema
>;
export type MetaReportingAccountStatusInputDto = z.infer<
  typeof metaReportingAccountStatusInputSchema
>;
export type MetaAssetSelectionDto = z.infer<typeof metaAssetSelectionSchema>;
export type MetaAssetsDto = z.infer<typeof metaAssetsSchema>;
export type MetaAssetSelectionInputDto = z.infer<
  typeof metaAssetSelectionInputSchema
>;
