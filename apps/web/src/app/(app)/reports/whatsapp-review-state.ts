import type { CampaignReportRowDto } from "@wpptrack/shared";

export type WhatsappClassification = NonNullable<
  CampaignReportRowDto["whatsappClassification"]
>;

export type WhatsappManualOverride = Extract<
  WhatsappClassification,
  "manual_include" | "manual_exclude"
>;

export function resolveWhatsappReviewActionState(
  override: WhatsappManualOverride | null,
  apiClassification?: WhatsappClassification,
): {
  whatsappClassification?: WhatsappClassification;
  whatsappClassificationReset?: boolean;
} {
  const whatsappClassification = apiClassification ?? override ?? undefined;

  if (whatsappClassification) {
    return { whatsappClassification };
  }

  return { whatsappClassificationReset: true };
}
