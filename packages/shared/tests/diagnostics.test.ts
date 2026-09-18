import { describe, expect, it } from "vitest";
import { diagnosticSourceSchema } from "../src/schemas/diagnostics";

describe("diagnostic source schema", () => {
  it("accepts Guimo as a diagnostic source", () => {
    expect(diagnosticSourceSchema.parse("guimo")).toBe("guimo");
  });
  it("accepts redacted Umbler observation diagnostics", () => {
    expect(diagnosticSourceSchema.parse("umbler")).toBe("umbler");
    expect(diagnosticSourceSchema.parse("gupshup")).toBe("gupshup");
  });
});
