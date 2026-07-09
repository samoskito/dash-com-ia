import { describe, expect, it } from "vitest";
import { WhatsappCampaignClassifierService } from "../src/reporting/whatsapp-campaign-classifier.service";

describe("whatsapp campaign classifier", () => {
  const service = new WhatsappCampaignClassifierService();

  it("classifies WhatsApp by adset destination type", () => {
    expect(
      service.classify({
        destinationType: "WHATSAPP",
        callToActionType: null,
        hasLeadEvidence: false,
        override: null
      })
    ).toEqual({
      classification: "auto_whatsapp",
      source: "destination_type:WHATSAPP"
    });
  });

  it("classifies WhatsApp by creative CTA", () => {
    expect(
      service.classify({
        destinationType: null,
        callToActionType: "WHATSAPP_MESSAGE",
        hasLeadEvidence: false,
        override: null
      })
    ).toEqual({
      classification: "creative_whatsapp",
      source: "call_to_action:WHATSAPP_MESSAGE"
    });
  });

  it("lets manual exclude override WhatsApp signals", () => {
    expect(
      service.classify({
        destinationType: "WHATSAPP",
        callToActionType: "WHATSAPP_MESSAGE",
        hasLeadEvidence: true,
        override: "manual_exclude"
      })
    ).toEqual({
      classification: "manual_exclude",
      source: "manual"
    });
  });

  it("detects WhatsApp from lead evidence", () => {
    expect(
      service.classify({
        destinationType: null,
        callToActionType: null,
        hasLeadEvidence: true,
        override: null
      })
    ).toEqual({
      classification: "detected_by_leads",
      source: "lead_evidence"
    });
  });

  it("classifies future destination values containing WHATSAPP", () => {
    expect(
      service.classify({
        destinationType: "FUTURE_WHATSAPP_DESTINATION",
        callToActionType: null,
        hasLeadEvidence: false,
        override: null
      })
    ).toEqual({
      classification: "auto_whatsapp",
      source: "destination_type:FUTURE_WHATSAPP_DESTINATION"
    });
  });

  it("returns not_whatsapp when there are no signals", () => {
    expect(
      service.classify({
        destinationType: null,
        callToActionType: null,
        hasLeadEvidence: false,
        override: null
      })
    ).toEqual({
      classification: "not_whatsapp",
      source: "no_signal"
    });
  });
});
