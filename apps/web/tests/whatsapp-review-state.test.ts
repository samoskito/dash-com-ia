import { describe, expect, it } from "vitest";
import { resolveWhatsappReviewActionState } from "../src/app/(app)/reports/whatsapp-review-state";

describe("WhatsApp report review action state", () => {
  it("uses the requested manual exclusion when an older API omits the classification", () => {
    expect(
      resolveWhatsappReviewActionState("manual_exclude", undefined),
    ).toEqual({
      whatsappClassification: "manual_exclude",
    });
  });

  it("uses the effective classification returned by the current API", () => {
    expect(resolveWhatsappReviewActionState(null, "creative_whatsapp")).toEqual(
      {
        whatsappClassification: "creative_whatsapp",
      },
    );
  });

  it("marks a reset when an older API omits the recalculated classification", () => {
    expect(resolveWhatsappReviewActionState(null, undefined)).toEqual({
      whatsappClassificationReset: true,
    });
  });
});
