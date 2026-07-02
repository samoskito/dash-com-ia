import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("shared package resolution", () => {
  it("aliases @wpptrack/shared to source for Next compilation", () => {
    const source = readFileSync("next.config.mjs", "utf8");

    expect(source).toContain('config.resolve.alias["@wpptrack/shared"]');
    expect(source).toContain("../../packages/shared/src");
  });
});
