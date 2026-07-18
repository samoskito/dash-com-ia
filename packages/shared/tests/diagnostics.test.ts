import { describe, expect, it } from "vitest";
import { diagnosticSourceSchema } from "../src/schemas/diagnostics";

describe("diagnostic source schema", () => {
  it("accepts redacted Umbler observation diagnostics", () => {
    expect(diagnosticSourceSchema.parse("umbler")).toBe("umbler");
  });
});
