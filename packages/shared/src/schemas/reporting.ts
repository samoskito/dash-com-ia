import { z } from "zod";

const moneyCentsSchema = z.number().int().nonnegative();

export const metaWhatsappClassificationSchema = z.enum([
  "auto_whatsapp",
  "creative_whatsapp",
  "detected_by_leads",
  "manual_include",
  "manual_exclude",
  "needs_review",
  "not_whatsapp",
]);

export const metaWhatsappOverrideInputSchema = z.object({
  level: z.enum(["campaign", "adset", "ad"]),
  id: z.string().trim().min(1),
  override: z.enum(["manual_include", "manual_exclude"]).nullable(),
});

export const campaignReportRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "paused", "deleted", "unknown"]),
  businessId: z.string().min(1).nullable().optional(),
  businessName: z.string().min(1).nullable().optional(),
  adAccountId: z.string().min(1).nullable().optional(),
  adAccountName: z.string().min(1).nullable().optional(),
  whatsappClassification: metaWhatsappClassificationSchema.optional(),
  spendCents: moneyCentsSchema,
  metaConversationsStarted: z.number().int().nonnegative(),
  costPerMetaConversationCents: moneyCentsSchema.nullable(),
  realConversations: z.number().int().nonnegative(),
  costPerRealConversationCents: moneyCentsSchema.nullable(),
  leadSubmitted: z.number().int().nonnegative(),
  costPerLeadSubmittedCents: moneyCentsSchema.nullable(),
  qualifiedLead: z.number().int().nonnegative(),
  costPerQualifiedLeadCents: moneyCentsSchema.nullable(),
  purchase: z.number().int().nonnegative(),
  costPerPurchaseCents: moneyCentsSchema.nullable(),
  roas: z.number().nonnegative().nullable(),
});

export const reportOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  campaigns: z.array(campaignReportRowSchema),
});

const reportMetricShape = campaignReportRowSchema.omit({
  id: true,
  name: true,
}).shape;

export const adSetReportRowSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  campaignName: z.string().min(1),
  name: z.string().min(1),
  ...reportMetricShape,
});

export const adSetReportOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  adSets: z.array(adSetReportRowSchema),
});

export const adReportRowSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  campaignName: z.string().min(1),
  adSetId: z.string().min(1),
  adSetName: z.string().min(1),
  name: z.string().min(1),
  ...reportMetricShape,
});

export const adReportOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  ads: z.array(adReportRowSchema),
});

export const metaAdReportSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.string().min(1).nullable(),
  effectiveStatus: z.string().min(1).nullable(),
});

export const metaAdSetReportSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.string().min(1).nullable(),
  effectiveStatus: z.string().min(1).nullable(),
  ads: z.array(metaAdReportSchema),
});

export const metaCampaignStructureSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.string().min(1).nullable(),
  effectiveStatus: z.string().min(1).nullable(),
  objective: z.string().min(1).nullable(),
  adSets: z.array(metaAdSetReportSchema),
});

export const metaStructureReportSchema = z.object({
  workspaceId: z.string().min(1),
  campaigns: z.array(metaCampaignStructureSchema),
});

export const reportFiltersSchema = z.object({
  businessId: z.string().min(1).optional(),
  adAccountId: z.string().min(1).optional(),
  nameScope: z.enum(["campaign", "adset", "ad"]).default("campaign"),
  nameContains: z.string().trim().min(1).optional(),
  status: z.enum(["all", "active", "paused"]).default("all"),
  whatsappClassification: z
    .enum(["whatsapp", "needs_review", "excluded", "all"])
    .default("whatsapp"),
});

export type CampaignReportRowDto = z.infer<typeof campaignReportRowSchema>;
export type ReportOverviewDto = z.infer<typeof reportOverviewSchema>;
export type AdSetReportRowDto = z.infer<typeof adSetReportRowSchema>;
export type AdSetReportOverviewDto = z.infer<typeof adSetReportOverviewSchema>;
export type AdReportRowDto = z.infer<typeof adReportRowSchema>;
export type AdReportOverviewDto = z.infer<typeof adReportOverviewSchema>;
export type MetaAdReportDto = z.infer<typeof metaAdReportSchema>;
export type MetaAdSetReportDto = z.infer<typeof metaAdSetReportSchema>;
export type MetaCampaignStructureDto = z.infer<
  typeof metaCampaignStructureSchema
>;
export type MetaStructureReportDto = z.infer<typeof metaStructureReportSchema>;
export type MetaWhatsappClassificationDto = z.infer<
  typeof metaWhatsappClassificationSchema
>;
export type MetaWhatsappOverrideInputDto = z.infer<
  typeof metaWhatsappOverrideInputSchema
>;
export type ReportFiltersDto = z.infer<typeof reportFiltersSchema>;
