import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("api package scripts", () => {
  it("starts the API from the real monorepo entrypoints", () => {
    const packageJson = JSON.parse(
      readFileSync("package.json", "utf8")
    ) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.dev).toContain("ts-node/register");
    expect(packageJson.scripts.dev).toContain("src/main.ts");
    expect(packageJson.scripts.start).toBe("node dist/apps/api/src/main.js");
  });
});
