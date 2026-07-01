export const funnelMetricKeys = [
  "metaConversationsStarted",
  "realConversations",
  "leadSubmitted",
  "qualifiedLead",
  "purchase"
] as const;

export type FunnelMetricKey = (typeof funnelMetricKeys)[number];

export type MoneyCents = number;

export interface ReportMetric {
  key: string;
  label: string;
  value: number;
  costCents?: MoneyCents;
  unavailableReason?: string;
}

export interface CampaignReportRow {
  id: string;
  name: string;
  status: "active" | "paused" | "deleted" | "unknown";
  spendCents: MoneyCents;
  metaConversationsStarted: number;
  costPerMetaConversationCents: MoneyCents | null;
  realConversations: number;
  costPerRealConversationCents: MoneyCents | null;
  leadSubmitted: number;
  costPerLeadSubmittedCents: MoneyCents | null;
  qualifiedLead: number;
  costPerQualifiedLeadCents: MoneyCents | null;
  purchase: number;
  costPerPurchaseCents: MoneyCents | null;
  roas: number | null;
}
