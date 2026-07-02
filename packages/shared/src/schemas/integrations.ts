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

export const metaOAuthCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1).optional()
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
  selectedPixelId: z.string().min(1).nullable()
});

export const metaBusinessAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  verificationStatus: z.string().min(1).nullable()
});

export const metaAdAccountAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  accountStatus: z.string().min(1).nullable(),
  currency: z.string().min(1).nullable(),
  timezoneName: z.string().min(1).nullable()
});

export const metaPixelAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1).nullable()
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
export type MetaBusinessAssetDto = z.infer<typeof metaBusinessAssetSchema>;
export type MetaAdAccountAssetDto = z.infer<typeof metaAdAccountAssetSchema>;
export type MetaPixelAssetDto = z.infer<typeof metaPixelAssetSchema>;
export type MetaAssetSelectionDto = z.infer<typeof metaAssetSelectionSchema>;
export type MetaAssetsDto = z.infer<typeof metaAssetsSchema>;
export type MetaAssetSelectionInputDto = z.infer<
  typeof metaAssetSelectionInputSchema
>;
