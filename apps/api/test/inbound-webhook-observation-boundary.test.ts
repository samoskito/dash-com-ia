import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { InboundWebhookDiagnosticsService } from "../src/inbound-webhooks/inbound-webhook-diagnostics.service";
import { InboundWebhookMetaRouteReaderService } from "../src/inbound-webhooks/inbound-webhook-meta-route-reader.service";
import { InboundWebhooksModule } from "../src/inbound-webhooks/inbound-webhooks.module";

const forbiddenModuleNames = [
  "ConversionEventsModule",
  "DiagnosticsModule",
  "ExternalDataModule",
  "IntegrationsModule",
  "LeadsModule",
  "QueueModule",
  "WebhooksModule",
];

const forbiddenSourcePatterns = [
  /(?:from|import\()\s*["'][^"']*\/conversion-events(?:\/|["'])/,
  /(?:from|import\()\s*["'][^"']*\/diagnostics\/diagnostics\.module["']/,
  /(?:from|import\()\s*["'][^"']*\/diagnostics\/diagnostics\.service["']/,
  /(?:from|import\()\s*["'][^"']*\/external-data(?:\/|["'])/,
  /(?:from|import\()\s*["'][^"']*\/leads(?:\/|["'])/,
  /(?:from|import\()\s*["'][^"']*\/integrations\/integrations\.module["']/,
  /(?:from|import\()\s*["'][^"']*\/integrations\/meta\/meta\.adapter["']/,
  /(?:from|import\()\s*["'][^"']*\/integrations\/meta\/meta-connection-resolver\.service["']/,
  /(?:from|import\()\s*["'][^"']*\/common\/queue\/(?:conversion-events-queue|diagnostics-queue|queue\.module)(?:\.service)?["']/,
  /(?:from|import\()\s*["'][^"']*\/webhooks(?:\/|["'])/,
  /\bConversionEventsQueueService\b/,
  /\bConversionEventsService\b/,
  /\bLeadsService\b/,
  /\bMetaAdapter\b/,
  /\bMetaCapiAdapter\b/,
  /\b(?:prisma|transaction|tx)\.(?:lead|conversionEventLog)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\b/,
];

type NestModuleReference = {
  module?: Function;
  forwardRef?: () => unknown;
};

function unwrapModule(reference: unknown): Function | null {
  if (typeof reference === "function") {
    return reference;
  }

  if (!reference || typeof reference !== "object") {
    return null;
  }

  const candidate = reference as NestModuleReference;

  if (typeof candidate.module === "function") {
    return candidate.module;
  }

  if (typeof candidate.forwardRef === "function") {
    return unwrapModule(candidate.forwardRef());
  }

  return null;
}

function collectModuleNames(
  root: Function,
  visited = new Set<Function>(),
): string[] {
  if (visited.has(root)) {
    return [];
  }

  visited.add(root);

  const imports = (Reflect.getMetadata("imports", root) ?? []) as unknown[];
  const importedModules = imports
    .map(unwrapModule)
    .filter((module): module is Function => module !== null);

  return importedModules.flatMap((module) => [
    module.name,
    ...collectModuleNames(module, visited),
  ]);
}

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("inbound webhook observation boundary", () => {
  it("uses the dedicated inbound queue through a BullMQ WorkerHost", () => {
    const source = readFileSync(
      join(
        __dirname,
        "..",
        "src",
        "inbound-webhooks",
        "inbound-webhook.processor.ts",
      ),
      "utf8",
    );

    expect(source).toMatch(/@Processor\(INBOUND_WEBHOOK_QUEUE\)/);
    expect(source).toMatch(
      /class\s+InboundWebhookProcessor\s+extends\s+WorkerHost/,
    );
  });

  it("does not depend transitively on lead or conversion execution modules", () => {
    const moduleNames = collectModuleNames(InboundWebhooksModule);

    expect(moduleNames).not.toEqual(
      expect.arrayContaining(forbiddenModuleNames),
    );
  });

  it("registers isolated read and diagnostic services", () => {
    const providers = (Reflect.getMetadata("providers", InboundWebhooksModule) ??
      []) as unknown[];
    const moduleNames = collectModuleNames(InboundWebhooksModule);

    expect(providers).toContain(InboundWebhookDiagnosticsService);
    expect(providers).toContain(InboundWebhookMetaRouteReaderService);
    expect(moduleNames).not.toContain("DiagnosticsModule");
    expect(moduleNames).not.toContain("IntegrationsModule");
  });

  it("does not reference production-side-effect services", () => {
    const sourceRoot = join(__dirname, "..", "src", "inbound-webhooks");
    const violations = collectTypeScriptFiles(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");

      return forbiddenSourcePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => ({
          file: relative(sourceRoot, path),
          pattern: pattern.source,
        }));
    });

    expect(violations).toEqual([]);
  });
});
