import { z } from "zod";

import { conversionEventLogStatusSchema } from "./conversion-events";

const moneyCentsSchema = z.number().int().nonnegative();
const nonnegativeIntSchema = z.number().int().nonnegative();
const nonnegativeRateSchema = z.number().nonnegative();
const reportDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
  estimatedRevenueCents: moneyCentsSchema.default(0),
  hasEstimatedRevenue: z.boolean().default(false),
  roasAcquisition: nonnegativeRateSchema.nullable(),
  roasWithRepurchase: nonnegativeRateSchema.nullable(),
  funnelSteps: z.array(reportFunnelStepSchema),
});

export const reportTotalsSchema = campaignReportRowSchema.omit({
  id: true,
  name: true,
  status: true,
  businessId: true,
  businessName: true,
  adAccountId: true,
  adAccountName: true,
  whatsappClassification: true,
});

export const reportOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  since: reportDateSchema.nullable().optional(),
  until: reportDateSchema.nullable().optional(),
  campaigns: z.array(campaignReportRowSchema),
  summary: campaignReportRowSchema.optional(),
  totals: reportTotalsSchema.optional(),
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
  since: reportDateSchema.nullable().optional(),
  until: reportDateSchema.nullable().optional(),
  adSets: z.array(adSetReportRowSchema),
  totals: reportTotalsSchema.optional(),
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
  since: reportDateSchema.nullable().optional(),
  until: reportDateSchema.nullable().optional(),
  ads: z.array(adReportRowSchema),
  totals: reportTotalsSchema.optional(),
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

export const conversionAuditDeliveryStateSchema = z.enum([
  "sent",
  "queued",
  "blocked",
  "failed",
  "historical",
  "discarded",
]);

export const conversionAuditSourceSchema = z.enum([
  "external_integration",
  "whatsapp_automation",
  "system",
  "manual_test",
  "other",
]);

export const conversionAuditEventSchema = z.object({
  id: z.string().min(1),
  eventName: z.string().min(1),
  eventLabel: z.string().min(1),
  deliveryState: conversionAuditDeliveryStateSchema,
  statusLabel: z.string().min(1),
  statusDetail: z.string().min(1),
  source: conversionAuditSourceSchema,
  sourceLabel: z.string().min(1),
  leadId: z.string().min(1).nullable(),
  leadName: z.string().min(1).nullable(),
  phoneDisplay: z.string().min(1).nullable(),
  campaignId: z.string().min(1).nullable(),
  campaignName: z.string().min(1).nullable(),
  adSetId: z.string().min(1).nullable(),
  adSetName: z.string().min(1).nullable(),
  adId: z.string().min(1).nullable(),
  adName: z.string().min(1).nullable(),
  pixelId: z.string().min(1).nullable(),
  pageId: z.string().min(1).nullable(),
  occurredAt: z.string().min(1),
  sentAt: z.string().min(1).nullable(),
  status: conversionEventLogStatusSchema,
  providerResponseSummary: z.string().min(1).nullable(),
  errorCode: z.string().min(1).nullable(),
  errorMessage: z.string().min(1).nullable(),
  valueSource: z
    .enum(["actual", "configured_average", "manual"])
    .nullable()
    .default(null),
});

export const conversionAuditSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  historical: z.number().int().nonnegative(),
  discarded: z.number().int().nonnegative(),
});

export const conversionAuditOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  summary: conversionAuditSummarySchema,
  pagination: reportPaginationSchema,
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
export type ReportTotalsDto = z.infer<typeof reportTotalsSchema>;
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
export type ConversionAuditDeliveryStateDto = z.infer<
  typeof conversionAuditDeliveryStateSchema
>;
export type ConversionAuditSourceDto = z.infer<
  typeof conversionAuditSourceSchema
>;
export type MetaWhatsappClassificationDto = z.infer<
  typeof metaWhatsappClassificationSchema
>;
export type MetaWhatsappOverrideInputDto = z.infer<
  typeof metaWhatsappOverrideInputSchema
>;
export type ReportFiltersDto = z.infer<typeof reportFiltersSchema>;
