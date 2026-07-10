import { z } from "zod";

import { conversionEventLogStatusSchema } from "./conversion-events";

const moneyCentsSchema = z.number().int().nonnegative();
const nonnegativeIntSchema = z.number().int().nonnegative();
const nonnegativeRateSchema = z.number().nonnegative();

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

export const reportFunnelStepKeySchema = z.enum([
  "real_conversations",
  "qualified_lead",
  "purchase",
  "first_purchase",
  "repurchase",
]);

export const reportFunnelStepSchema = z.object({
  key: reportFunnelStepKeySchema,
  label: z.enum([
    "Conversas reais iniciadas",
    "Lead qualificado",
    "Compras",
    "Primeira compra",
    "Recompra",
  ]),
  value: nonnegativeIntSchema,
  costCents: moneyCentsSchema.nullable().optional(),
  unavailableReason: z.string().trim().min(1).optional(),
});

export const reportPaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
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
  metaConversationsStarted: nonnegativeIntSchema,
  costPerMetaConversationCents: moneyCentsSchema.nullable(),
  realConversations: nonnegativeIntSchema,
  costPerRealConversationCents: moneyCentsSchema.nullable(),
  organicLeads: nonnegativeIntSchema,
  totalReceived: nonnegativeIntSchema,
  trackingRate: nonnegativeRateSchema.nullable(),
  qualifiedLead: nonnegativeIntSchema,
  costPerQualifiedLeadCents: moneyCentsSchema.nullable(),
  purchases: nonnegativeIntSchema,
  firstPurchases: nonnegativeIntSchema,
  repurchases: nonnegativeIntSchema,
  costPerPurchaseCents: moneyCentsSchema.nullable(),
  trafficRevenueCents: moneyCentsSchema,
  organicRevenueCents: moneyCentsSchema,
  totalRevenueCents: moneyCentsSchema,
  firstPurchaseRevenueCents: moneyCentsSchema,
  repurchaseRevenueCents: moneyCentsSchema,
  roasAcquisition: nonnegativeRateSchema.nullable(),
  roasWithRepurchase: nonnegativeRateSchema.nullable(),
  funnelSteps: z.array(reportFunnelStepSchema),
});

export const reportOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  campaigns: z.array(campaignReportRowSchema),
  pagination: reportPaginationSchema.optional(),
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
  pagination: reportPaginationSchema.optional(),
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
  pagination: reportPaginationSchema.optional(),
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

export const conversionAuditEventSchema = z.object({
  id: z.string().min(1),
  eventName: z.string().min(1),
  eventLabel: z.string().min(1),
  leadId: z.string().min(1).nullable(),
  phoneHash: z.string().min(1).nullable(),
  campaignId: z.string().min(1).nullable(),
  adSetId: z.string().min(1).nullable(),
  adId: z.string().min(1).nullable(),
  pixelId: z.string().min(1).nullable(),
  pageId: z.string().min(1).nullable(),
  occurredAt: z.string().min(1),
  sentAt: z.string().min(1).nullable(),
  status: conversionEventLogStatusSchema,
  providerResponseSummary: z.string().min(1).nullable(),
  errorCode: z.string().min(1).nullable(),
  errorMessage: z.string().min(1).nullable(),
});

export const conversionAuditOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  events: z.array(conversionAuditEventSchema),
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
export type ReportFunnelStepKeyDto = z.infer<typeof reportFunnelStepKeySchema>;
export type ReportFunnelStepDto = z.infer<typeof reportFunnelStepSchema>;
export type ReportPaginationDto = z.infer<typeof reportPaginationSchema>;
export type ConversionAuditEventDto = z.infer<
  typeof conversionAuditEventSchema
>;
export type ConversionAuditOverviewDto = z.infer<
  typeof conversionAuditOverviewSchema
>;
export type MetaWhatsappClassificationDto = z.infer<
  typeof metaWhatsappClassificationSchema
>;
export type MetaWhatsappOverrideInputDto = z.infer<
  typeof metaWhatsappOverrideInputSchema
>;
export type ReportFiltersDto = z.infer<typeof reportFiltersSchema>;
