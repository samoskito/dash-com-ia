import { z } from "zod";

const moneyCentsSchema = z.number().int().nonnegative();

export const campaignReportRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "paused", "deleted", "unknown"]),
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
  roas: z.number().nonnegative().nullable()
});

export const reportOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  rangeLabel: z.string().min(1),
  campaigns: z.array(campaignReportRowSchema)
});

export type CampaignReportRowDto = z.infer<typeof campaignReportRowSchema>;
export type ReportOverviewDto = z.infer<typeof reportOverviewSchema>;
