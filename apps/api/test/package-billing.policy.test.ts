import { describe, expect, it } from "vitest";
import { contractAllowsWhatsappAccess } from "../src/billing/package-billing.policy";

describe("contractAllowsWhatsappAccess", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  it("allows grace only before its end", () => {
    expect(
      contractAllowsWhatsappAccess(
        "grace_period",
        now,
        new Date("2026-08-01T12:00:00.000Z"),
        new Date("2026-07-28T12:00:00.001Z"),
      ),
    ).toBe(true);
  });

  it("blocks grace at or after its end and suspended contracts", () => {
    for (const graceEndsAt of [
      new Date("2026-07-28T12:00:00.000Z"),
      new Date("2026-07-28T11:59:59.999Z"),
    ]) {
      expect(
        contractAllowsWhatsappAccess(
          "grace_period",
          now,
          new Date("2026-08-01T12:00:00.000Z"),
          graceEndsAt,
        ),
      ).toBe(false);
    }

    expect(contractAllowsWhatsappAccess("suspended", now, null, null)).toBe(
      false,
    );
  });
});
