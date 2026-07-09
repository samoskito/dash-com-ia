import { describe, expect, it } from "vitest";
import {
  getConversionEventDefinition,
  isConversionEventRequiringValue
} from "../src/conversion-events/conversion-event-registry";

describe("conversion event registry", () => {
  it("marks Purchase as a value event", () => {
    expect(isConversionEventRequiringValue("Purchase")).toBe(true);
    expect(getConversionEventDefinition("Purchase")).toMatchObject({
      eventName: "Purchase",
      requiresValue: true
    });
  });

  it("marks QualifiedLead as a no-value event", () => {
    expect(isConversionEventRequiringValue("QualifiedLead")).toBe(false);
    expect(getConversionEventDefinition("QualifiedLead")).toMatchObject({
      eventName: "QualifiedLead",
      requiresValue: false
    });
  });
});
