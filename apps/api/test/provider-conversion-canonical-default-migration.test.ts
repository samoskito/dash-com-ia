import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260724150000_provider_conversion_canonical_default/migration.sql",
  ),
  "utf8",
);
const schema = readFileSync(
  resolve(__dirname, "../prisma/schema.prisma"),
  "utf8",
);

describe("provider conversion canonical default migration", () => {
  it("makes canonical the default for newly created channels", () => {
    expect(schema).toContain(
      "conversionEngineMode  ProviderConversionEngineMode @default(canonical)",
    );
    expect(migration).toContain(
      "SET DEFAULT 'canonical'::\"ProviderConversionEngineMode\"",
    );
  });

  it("does not rewrite existing channel modes", () => {
    expect(migration).not.toMatch(/UPDATE\s+"InboundWebhookChannel"/u);
    expect(migration).not.toContain('SET "conversionEngineMode"');
  });
});
