import { Injectable } from "@nestjs/common";

export type WhatsappClassification =
  | "auto_whatsapp"
  | "creative_whatsapp"
  | "detected_by_leads"
  | "manual_include"
  | "manual_exclude"
  | "needs_review"
  | "not_whatsapp";

export type WhatsappCampaignClassificationInput = {
  destinationType: string | null;
  callToActionType: string | null;
  hasLeadEvidence: boolean;
  override: WhatsappClassification | null;
};

export type WhatsappCampaignClassificationResult = {
  classification: WhatsappClassification;
  source: string;
};

const WHATSAPP_DESTINATION_TYPES = new Set([
  "WHATSAPP",
  "MESSAGING_MESSENGER_WHATSAPP",
  "MESSAGING_INSTAGRAM_DIRECT_WHATSAPP",
  "MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP"
]);

@Injectable()
export class WhatsappCampaignClassifierService {
  classify(
    input: WhatsappCampaignClassificationInput
  ): WhatsappCampaignClassificationResult {
    if (
      input.override === "manual_include" ||
      input.override === "manual_exclude"
    ) {
      return { classification: input.override, source: "manual" };
    }

    if (
      input.destinationType &&
      (WHATSAPP_DESTINATION_TYPES.has(input.destinationType) ||
        input.destinationType.includes("WHATSAPP"))
    ) {
      return {
        classification: "auto_whatsapp",
        source: `destination_type:${input.destinationType}`
      };
    }

    if (input.callToActionType === "WHATSAPP_MESSAGE") {
      return {
        classification: "creative_whatsapp",
        source: "call_to_action:WHATSAPP_MESSAGE"
      };
    }

    if (input.hasLeadEvidence) {
      return { classification: "detected_by_leads", source: "lead_evidence" };
    }

    return { classification: "not_whatsapp", source: "no_signal" };
  }
}
