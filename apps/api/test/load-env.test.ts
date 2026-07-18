import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../src/config/load-env";

const keys = [
  "INBOUND_WEBHOOKS_ENABLED",
  "INBOUND_WEBHOOK_ENCRYPTION_KEY",
  "WPPTRACK_TEST_ENV_LOADER_VALUE",
  "WPPTRACK_TEST_ENV_LOADER_SECRET",
  "WPPTRACK_TEST_ENV_LOADER_PRESET",
];

afterEach(() => {
  for (const key of keys) {
    delete process.env[key];
  }
});

describe("loadLocalEnv", () => {
  it("loads root env values from parent directories without overriding existing process env", () => {
    const root = mkdtempSync(join(tmpdir(), "wpptrack-env-"));
    const nested = join(root, "apps", "api");

    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(root, ".env"),
      [
        "WPPTRACK_TEST_ENV_LOADER_VALUE=local-value",
        "WPPTRACK_TEST_ENV_LOADER_SECRET=$secret-with-dollar",
        "WPPTRACK_TEST_ENV_LOADER_PRESET=from-file",
        "INBOUND_WEBHOOKS_ENABLED=true",
        "INBOUND_WEBHOOK_ENCRYPTION_KEY=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
      ].join("\n"),
    );
    process.env.WPPTRACK_TEST_ENV_LOADER_PRESET = "from-process";

    try {
      loadLocalEnv(nested);

      expect(process.env.WPPTRACK_TEST_ENV_LOADER_VALUE).toBe("local-value");
      expect(process.env.WPPTRACK_TEST_ENV_LOADER_SECRET).toBe(
        "$secret-with-dollar",
      );
      expect(process.env.WPPTRACK_TEST_ENV_LOADER_PRESET).toBe("from-process");
      expect(process.env.INBOUND_WEBHOOKS_ENABLED).toBe("true");
      expect(process.env.INBOUND_WEBHOOK_ENCRYPTION_KEY).toBe(
        "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
