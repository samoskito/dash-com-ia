#!/usr/bin/env node
/**
 * sanitize-export.mjs — F3.2 real dry-run exporter.
 *
 * Turns the private monorepo into a sanitized, license-free student-edition
 * tree under a --out directory (must be under /tmp). This is a DRY RUN: it
 * never writes to the public repo (nod-rastrackdash-wpp), never pushes
 * anywhere, and never touches production. See README.md for the gates.
 *
 * Approach (documented per F3.2 task item 3): full-tree copy minus a fixed
 * always-exclude list, then subtract remove_paths / remove_path_patterns.
 * keep_paths in the yml is descriptive/audit data (INVENTORY cross-check),
 * not an allowlist copy filter — it is not exhaustive of every legitimate
 * file in apps/web, packages/shared, etc., so copying "everything except
 * what's explicitly banned" is safer than copying "only what's explicitly
 * named" for this slice.
 *
 * Usage:
 *   node scripts/rastrackdash/sanitize-export.mjs --out /tmp/rastrackdash-export [--force]
 *   node scripts/rastrackdash/sanitize-export.mjs --self-test
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const YML_PATH = join(__dirname, "sanitize-allowdeny.yml");
const REPO_ROOT = resolve(__dirname, "..", "..");

// Always excluded when copying, regardless of yml content (task requirement).
const ALWAYS_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".turbo",
]);
const ALWAYS_EXCLUDE_FILE_RE = /^\.env(\..+)?$|\.pem$|\.key$/;
// .env.example is a template, not a real secret file — never exclude it.
const ENV_EXAMPLE_NAME = ".env.example";

const TEXT_FILE_RE = /\.(ts|tsx|js|mjs|cjs|jsx|json|md|yml|yaml|env|example|txt|prisma|css|scss|html|sh)$/i;

// ---------------------------------------------------------------------------
// yml loading (same fallback strategy as the F3.1 stub)
// ---------------------------------------------------------------------------

async function loadYaml(path) {
  let yaml;
  try {
    ({ default: yaml } = await import("js-yaml"));
  } catch {
    yaml = null;
  }
  const raw = readFileSync(path, "utf8");
  if (yaml) return yaml.load(raw);

  const json = execFileSync(
    "python3",
    [
      "-c",
      "import sys, yaml, json; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)",
      path,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(json);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { out: null, source: REPO_ROOT, force: false, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i];
    else if (arg === "--source") args.source = resolve(argv[++i]);
    else if (arg === "--force") args.force = true;
    else if (arg === "--self-test") args.selfTest = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exitCode = 1;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Secret scanner — pure function so it can be unit-tested via --self-test.
// ---------------------------------------------------------------------------

function scanTextForSecrets(text, patterns) {
  const hits = [];
  for (const pattern of patterns) {
    let re;
    try {
      re = new RegExp(pattern, "m");
    } catch {
      // Not every entry is a valid JS regex (some are plain identifiers);
      // treat those as literal substring matches instead.
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "m");
    }
    const match = text.match(re);
    if (match) {
      hits.push({ pattern, index: match.index ?? -1 });
    }
  }
  return hits;
}

function lineNumberAt(text, index) {
  if (index < 0) return 0;
  return text.slice(0, index).split("\n").length;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function shouldSkipTopLevel(name) {
  return ALWAYS_EXCLUDE_DIRS.has(name);
}

function copyTree(source, out, extraExcludeDirNames) {
  mkdirSync(out, { recursive: true });
  cpSync(source, out, {
    recursive: true,
    filter: (src) => {
      const rel = relative(source, src);
      if (rel === "") return true;
      const parts = rel.split(sep);
      const base = parts[parts.length - 1];
      if (parts.some((p) => shouldSkipTopLevel(p))) return false;
      if (parts.some((p) => extraExcludeDirNames.has(p))) return false;
      if (base !== ENV_EXAMPLE_NAME && ALWAYS_EXCLUDE_FILE_RE.test(base)) {
        return false;
      }
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// remove_paths / remove_path_patterns deletion
// ---------------------------------------------------------------------------

function isPrismaRef(p) {
  return p.includes("#");
}

function deleteRemovePaths(out, removePaths, log) {
  for (const entry of removePaths) {
    if (isPrismaRef(entry)) continue; // handled by stripPrismaModels
    const target = join(out, entry);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      log.removedPaths.push(entry);
    } else {
      log.removePathsNotFound.push(entry);
    }
  }
}

function globToRegExp(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i += 1;
      if (glob[i + 1] === "/") i += 1;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re);
}

function walk(dir, cb) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, cb);
      cb(full, true);
    } else {
      cb(full, false);
    }
  }
}

function pruneEmptyDirs(root) {
  function isEmptyDir(dir) {
    return readdirSync(dir).length === 0;
  }
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(dir, entry.name));
    }
    if (dir !== root && isEmptyDir(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  visit(root);
}

function deleteRemovePatterns(out, patterns, log) {
  const regexes = patterns.map((p) => globToRegExp(p));
  walk(out, (full, isDir) => {
    if (!existsSync(full)) return; // may have been removed by a parent match already
    const rel = relative(out, full).split(sep).join("/");
    if (regexes.some((re) => re.test(rel))) {
      rmSync(full, { recursive: true, force: true });
      log.removedByPattern.push(rel);
    }
  });
}

// ---------------------------------------------------------------------------
// Nest module / barrel codemods (data-driven, see yml module_registrations_strip
// and barrel_exports_remove)
// ---------------------------------------------------------------------------

function stripIdentifierFromFile(content, id) {
  const b = `(?<![A-Za-z0-9_$])${id}(?![A-Za-z0-9_$])`;
  let out = content;
  let changed = false;

  const importRe = new RegExp(`^import \\{ ${id} \\} from "[^"]*";\\r?\\n`, "m");
  if (importRe.test(out)) {
    out = out.replace(importRe, "");
    changed = true;
  }

  // Multi-line array entry with its own trailing comma on its own line.
  const lineRe = new RegExp(`^[ \\t]*${b},[ \\t]*\\r?\\n`, "gm");
  if (lineRe.test(out)) {
    out = out.replace(lineRe, "");
    changed = true;
  }

  // Sole element inside brackets, e.g. `[InboundWebhookReplayController]`.
  const soleRe = new RegExp(`\\[\\s*${b}\\s*\\]`, "g");
  if (soleRe.test(out)) {
    out = out.replace(soleRe, "[]");
    changed = true;
  }

  // Inline, comma-before (identifier is not first in a single-line list).
  const beforeRe = new RegExp(`,\\s*${b}`, "g");
  if (beforeRe.test(out)) {
    out = out.replace(beforeRe, "");
    changed = true;
  }

  // Inline, comma-after (identifier is first in a single-line list).
  const afterRe = new RegExp(`${b}\\s*,\\s*`, "g");
  if (afterRe.test(out)) {
    out = out.replace(afterRe, "");
    changed = true;
  }

  return { content: out, changed };
}

function applyModuleRegistrationStrip(out, file, identifiers, log) {
  const target = join(out, file);
  if (!existsSync(target)) {
    log.moduleStripSkipped.push(`${file} (file absent)`);
    return;
  }
  let content = readFileSync(target, "utf8");
  for (const id of identifiers) {
    const result = stripIdentifierFromFile(content, id);
    content = result.content;
    if (result.changed) {
      log.moduleStripApplied.push(`${file}: ${id}`);
    } else {
      log.moduleStripNotFound.push(`${file}: ${id}`);
    }
  }
  writeFileSync(target, content);
}

function applyBarrelExportsRemove(out, file, exportPaths, log) {
  const target = join(out, file);
  if (!existsSync(target)) {
    log.moduleStripSkipped.push(`${file} (file absent)`);
    return;
  }
  let content = readFileSync(target, "utf8");
  for (const path of exportPaths) {
    const esc = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^export \\* from "${esc}";\\r?\\n`, "m");
    if (re.test(content)) {
      content = content.replace(re, "");
      log.moduleStripApplied.push(`${file}: export * from "${path}"`);
    } else {
      log.moduleStripNotFound.push(`${file}: export * from "${path}"`);
    }
  }
  writeFileSync(target, content);
}

// ---------------------------------------------------------------------------
// Meta OAuth broker removal — targeted codemod per
// rewrite_rules.meta-oauth-broker-removal. Self-contained: only removes
// the start/callback endpoints, their now-dead private HTML-popup helpers,
// and the web button/JSX usage. Leaves meta/oauth/advanced (separate,
// still-deferred ambiguity) untouched.
// ---------------------------------------------------------------------------

function applyMetaOAuthBrokerRemoval(out, log) {
  const controllerPath = join(
    out,
    "apps/api/src/integrations/integrations.controller.ts",
  );
  if (existsSync(controllerPath)) {
    let content = readFileSync(controllerPath, "utf8");
    const before = content;

    content = content.replace(
      /\n {2}@Get\("meta\/start"\)[\s\S]*?(?=\n {2}@Get\("meta\/connection"\))/,
      "\n",
    );
    content = content.replace(
      /\n {2}private wantsHtml\(accept\?: string\): boolean \{[\s\S]*\n\}\n$/,
      "\n}\n",
    );
    content = content.replace(/^ {2}Headers,\r?\n/m, "");
    content = content.replace(/^ {2}Res,\r?\n/m, "");
    content = content.replace(/\ntype HtmlResponse = \{[\s\S]*?\n\};\n/, "\n");
    content = content.replace(/^ {2}metaOAuthCallbackQuerySchema,\r?\n/m, "");

    if (content !== before) {
      writeFileSync(controllerPath, content);
      log.metaOAuthCodemod.push("integrations.controller.ts: broker endpoints + dead helpers removed");
    } else {
      log.metaOAuthCodemodFailed.push(
        "integrations.controller.ts: no change applied (markers not found — source may have drifted)",
      );
    }
  } else {
    log.metaOAuthCodemodFailed.push("integrations.controller.ts: file absent");
  }

  const pagePath = join(
    out,
    "apps/web/src/app/(app)/integrations/page.tsx",
  );
  if (existsSync(pagePath)) {
    let content = readFileSync(pagePath, "utf8");
    const before = content;

    content = content.replace(
      /^import \{ MetaOAuthButton \} from "\.\/meta-oauth-button";\r?\n/m,
      "",
    );
    content = content.replace(
      /^import \{\r?\n {2}completeMetaOAuthForCurrentWorkspace,\r?\n {2}startMetaOAuthForCurrentWorkspace,\r?\n\} from "\.\/meta-oauth-actions";\r?\n/m,
      "",
    );
    content = content.replace(
      /[ \t]*<MetaOAuthButton\b[\s\S]*?\/>\r?\n/,
      "",
    );

    if (content !== before) {
      writeFileSync(pagePath, content);
      log.metaOAuthCodemod.push("integrations/page.tsx: MetaOAuthButton import + JSX removed");
    } else {
      log.metaOAuthCodemodFailed.push(
        "integrations/page.tsx: no change applied (markers not found — source may have drifted)",
      );
    }
  } else {
    log.metaOAuthCodemodFailed.push("integrations/page.tsx: file absent");
  }
}

// ---------------------------------------------------------------------------
// Leftover license/asaas/uazapi-admin residue codemods.
//
// These are the natural consequence of stripping billing/ + integrations/
// asaas/ + licensing/ wholesale: a handful of otherwise-generic KEPT files
// still branch on the now-gone identifiers (UAZAPI_ADMIN_TOKEN fleet
// provisioning, an Asaas webhook endpoint wired to the deleted
// BillingService, a license-notify env fallback in ops-alerts). Each is
// small, self-contained, and traceable to an existing rewrite_rule
// (uazapi-byo-only) or the billing/licensing strip itself — applied here so
// the secret_fail_patterns gate actually passes on a real run instead of
// papering over it.
// ---------------------------------------------------------------------------

function applyResidueCodemods(out, log) {
  // integrations.service.ts: drop UAZAPI_ADMIN_TOKEN fallback + the whole
  // Asaas status action (integration no longer exists).
  const integrationsServicePath = join(
    out,
    "apps/api/src/integrations/integrations.service.ts",
  );
  if (existsSync(integrationsServicePath)) {
    let content = readFileSync(integrationsServicePath, "utf8");
    const before = content;
    content = content.replace(
      /\.\.\.\(!this\.env\.UAZAPI_ADMIN_TOKEN && !this\.env\.UAZAPI_TOKEN\s*\n\s*\? \["UAZAPI_ADMIN_TOKEN"\]\s*\n\s*: \[\]\),/,
      '...(!this.env.UAZAPI_TOKEN ? ["UAZAPI_TOKEN"] : []),',
    );
    content = content.replace(
      /\n {2}getAsaasStatusAction\(\): IntegrationStartActionDto \{[\s\S]*?\n {2}\}\n(?=\n {2}async getWhatsappDataSource)/,
      "\n",
    );
    if (content !== before) {
      writeFileSync(integrationsServicePath, content);
      log.residueCodemod.push("integrations.service.ts: UAZAPI_ADMIN_TOKEN fallback + getAsaasStatusAction removed");
    } else {
      log.residueCodemodFailed.push("integrations.service.ts: no change applied (markers not found)");
    }
  } else {
    log.residueCodemodFailed.push("integrations.service.ts: file absent");
  }

  // integrations.controller.ts: drop the now-gone asaas/status endpoint.
  const integrationsControllerPath = join(
    out,
    "apps/api/src/integrations/integrations.controller.ts",
  );
  if (existsSync(integrationsControllerPath)) {
    let content = readFileSync(integrationsControllerPath, "utf8");
    const before = content;
    content = content.replace(
      /\n {2}@Get\("asaas\/status"\)\n {2}getAsaasStatus\(\) \{\n {4}return this\.integrationsService\.getAsaasStatusAction\(\);\n {2}\}\n/,
      "\n",
    );
    if (content !== before) {
      writeFileSync(integrationsControllerPath, content);
      log.residueCodemod.push("integrations.controller.ts: asaas/status endpoint removed");
    } else {
      log.residueCodemodFailed.push("integrations.controller.ts: no change applied (markers not found)");
    }
  } else {
    log.residueCodemodFailed.push("integrations.controller.ts: file absent");
  }

  // uazapi.adapter.ts: BYO-only per rewrite_rules.uazapi-byo-only — drop the
  // admin-token health check branch and stub out fleet createInstance().
  const uazapiAdapterPath = join(
    out,
    "apps/api/src/integrations/uazapi/uazapi.adapter.ts",
  );
  if (existsSync(uazapiAdapterPath)) {
    let content = readFileSync(uazapiAdapterPath, "utf8");
    const before = content;
    content = content.replace(
      /this\.env\.UAZAPI_BASE_URL &&\n\s*\(this\.env\.UAZAPI_ADMIN_TOKEN \|\| this\.env\.UAZAPI_TOKEN\),/,
      "this.env.UAZAPI_BASE_URL && this.env.UAZAPI_TOKEN,",
    );
    content = content.replace(
      /: "Missing UAZAPI_BASE_URL or UAZAPI_ADMIN_TOKEN",\n {4}\};\n {2}\}\n\n {2}async createInstance\(/,
      ': "Missing UAZAPI_BASE_URL or UAZAPI_TOKEN",\n    };\n  }\n\n  async createInstance(',
    );
    content = content.replace(
      /(async createInstance\(\s*\n\s*input: UazapiCreateInstanceInput,\s*\n\s*\): Promise<UazapiCreateInstanceResult> \{\n)[\s\S]*?\n {2}\}\n(?=\n {2}async getInstanceStatus)/,
      "$1" +
        "    // F3.2 rastrackdash sanitize (rewrite_rules.uazapi-byo-only): fleet\n" +
        "    // admin instance provisioning removed for the BYO single-instance\n" +
        "    // student edition. No callers remain once billing/package-uazapi-\n" +
        "    // provisioning.service.ts is stripped; kept as a stub so this class\n" +
        "    // still satisfies IntegrationAdapter.\n" +
        "    void input;\n" +
        "    return {\n" +
        '      status: "not_configured",\n' +
        "      providerInstanceId: null,\n" +
        "      instanceToken: null,\n" +
        "      message:\n" +
        '        "Instance provisioning is not available in the BYO edition; connect your own Uazapi instance via UAZAPI_BASE_URL/UAZAPI_TOKEN.",\n' +
        "    };\n" +
        "  }\n",
    );
    if (content !== before) {
      writeFileSync(uazapiAdapterPath, content);
      log.residueCodemod.push("uazapi.adapter.ts: UAZAPI_ADMIN_TOKEN branches removed (getHealth + createInstance stubbed)");
    } else {
      log.residueCodemodFailed.push("uazapi.adapter.ts: no change applied (markers not found)");
    }
  } else {
    log.residueCodemodFailed.push("uazapi.adapter.ts: file absent");
  }

  // webhooks.controller.ts: the Asaas webhook endpoint is wired entirely to
  // BillingService/PackageBillingWebhookService (both deleted with billing/).
  const webhooksControllerPath = join(
    out,
    "apps/api/src/webhooks/webhooks.controller.ts",
  );
  if (existsSync(webhooksControllerPath)) {
    let content = readFileSync(webhooksControllerPath, "utf8");
    const before = content;
    content = content.replace(
      /\n {2}@Post\("asaas"\)[\s\S]*?(?=\n {2}@Post\("meta"\))/,
      "\n",
    );
    content = content.replace(
      /\n {2}private async recordAsaasWebhook\([\s\S]*?\n {2}\}\n(?=\n {2}private recordMetaWebhook)/,
      "\n",
    );
    content = content.replace(
      /\n {2}private assertAsaasWebhookToken\([\s\S]*?\n {2}\}\n(?=\n {2}private assertUazapiWebhookToken)/,
      "\n",
    );
    content = content.replace(
      /\n {4}@Inject\(BillingService\)\n {4}private readonly billingService: BillingService,/,
      "",
    );
    content = content.replace(
      /\n {4}@Inject\(PackageBillingWebhookService\)\n {4}private readonly packageBillingWebhook: PackageBillingWebhookService,/,
      "",
    );
    content = content.replace(
      /^import \{ BillingService \} from "\.\.\/billing\/billing\.service";\r?\n/m,
      "",
    );
    content = content.replace(
      /^import \{ PackageBillingWebhookService \} from "\.\.\/billing\/package-billing-webhook\.service";\r?\n/m,
      "",
    );
    if (content !== before) {
      writeFileSync(webhooksControllerPath, content);
      log.residueCodemod.push("webhooks.controller.ts: Asaas webhook endpoint + billing deps removed");
    } else {
      log.residueCodemodFailed.push("webhooks.controller.ts: no change applied (markers not found)");
    }
  } else {
    log.residueCodemodFailed.push("webhooks.controller.ts: file absent");
  }

  // ops-alert.notifier.ts: drop the LICENSE_NOTIFY_UAZAPI_* fallback (those
  // vars are license-server-only and stripped from env_allow/env_strip).
  const opsAlertPath = join(
    out,
    "apps/api/src/ops-alerts/ops-alert.notifier.ts",
  );
  if (existsSync(opsAlertPath)) {
    let content = readFileSync(opsAlertPath, "utf8");
    const before = content;
    content = content.replace(
      /\(this\.env\.OPS_ALERT_UAZAPI_BASE_URL \?\? this\.env\.LICENSE_NOTIFY_UAZAPI_BASE_URL\)\?\.trim\(\)/,
      "this.env.OPS_ALERT_UAZAPI_BASE_URL?.trim()",
    );
    content = content.replace(
      /\(this\.env\.OPS_ALERT_UAZAPI_TOKEN \?\? this\.env\.LICENSE_NOTIFY_UAZAPI_TOKEN\)\?\.trim\(\)/,
      "this.env.OPS_ALERT_UAZAPI_TOKEN?.trim()",
    );
    if (content !== before) {
      writeFileSync(opsAlertPath, content);
      log.residueCodemod.push("ops-alert.notifier.ts: LICENSE_NOTIFY_UAZAPI_* fallback removed");
    } else {
      log.residueCodemodFailed.push("ops-alert.notifier.ts: no change applied (markers not found)");
    }
  } else {
    log.residueCodemodFailed.push("ops-alert.notifier.ts: file absent");
  }
}

// ---------------------------------------------------------------------------
// Prisma model stripping
// ---------------------------------------------------------------------------

function stripPrismaModels(out, modelNames, log) {
  const schemaPath = join(out, "apps/api/prisma/schema.prisma");
  if (!existsSync(schemaPath)) {
    log.prismaSkipped = true;
    return;
  }
  let content = readFileSync(schemaPath, "utf8");

  for (const name of modelNames) {
    const blockRe = new RegExp(`\\nmodel ${name} \\{[\\s\\S]*?\\n\\}\\n`, "m");
    if (blockRe.test(content)) {
      content = content.replace(blockRe, "\n");
      log.prismaModelsRemoved.push(name);
    } else {
      log.prismaModelsNotFound.push(name);
    }
  }

  // Second pass: drop dangling relation/back-relation field lines in
  // surviving models that still typed against a now-deleted model.
  for (const name of modelNames) {
    const fieldLineRe = new RegExp(
      `^[ \\t]*\\S+[ \\t]+${name}(\\[\\])?\\??([ \\t]+@[^\\n]*)?[ \\t]*\\r?\\n`,
      "gm",
    );
    const matches = content.match(fieldLineRe);
    if (matches) {
      content = content.replace(fieldLineRe, "");
      log.prismaDanglingFieldsRemoved.push(
        ...matches.map((m) => `${name}: ${m.trim()}`),
      );
    }
  }

  writeFileSync(schemaPath, content);

  // Residual check: any surviving whole-word reference to a removed model.
  for (const name of modelNames) {
    const residualRe = new RegExp(`\\b${name}\\b`, "g");
    const remaining = content.match(residualRe);
    if (remaining) {
      log.prismaResidualReferences.push(`${name} (${remaining.length}x)`);
    }
  }
}

// ---------------------------------------------------------------------------
// .env.example regeneration
// ---------------------------------------------------------------------------

function regenerateEnvExample(out, envAllow, log) {
  const path = join(out, ".env.example");
  if (!existsSync(path)) {
    log.envExampleSkipped = true;
    return;
  }
  const raw = readFileSync(path, "utf8");
  const allowSet = new Set(envAllow);
  const lines = raw.split("\n");
  const kept = [];
  let blankRun = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (!blankRun) kept.push("");
      blankRun = true;
      continue;
    }
    if (trimmed.startsWith("#")) {
      // Keep comments only if the very next non-comment line survives;
      // simplest safe rule: keep comments, prune later if orphaned.
      kept.push(line);
      blankRun = false;
      continue;
    }
    const eq = trimmed.indexOf("=");
    const key = eq === -1 ? trimmed : trimmed.slice(0, eq);
    if (allowSet.has(key)) {
      kept.push(line);
      log.envVarsKept.push(key);
    } else {
      log.envVarsStripped.push(key);
      // Drop a preceding orphaned comment line if we just kept it speculatively.
      if (kept.length && kept[kept.length - 1].trim().startsWith("#")) {
        kept.pop();
      }
    }
    blankRun = false;
  }
  // Collapse any run of 2+ blank lines left behind by stripped blocks.
  const collapsed = kept.join("\n").replace(/\n{3,}/g, "\n\n");
  writeFileSync(path, collapsed.replace(/\n*$/, "\n"));
}

// ---------------------------------------------------------------------------
// Secret scan (fail-closed) over the whole export tree
// ---------------------------------------------------------------------------

function collectTextFiles(root) {
  const files = [];
  walk(root, (full, isDir) => {
    if (isDir) return;
    if (TEXT_FILE_RE.test(full)) files.push(full);
  });
  return files;
}

function runSecretScan(out, patterns) {
  const findings = [];
  for (const file of collectTextFiles(out)) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // binary or unreadable, skip
    }
    const hits = scanTextForSecrets(text, patterns);
    for (const hit of hits) {
      findings.push({
        pattern: hit.pattern,
        file: relative(out, file),
        line: lineNumberAt(text, hit.index),
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Dangling relative-import scan (informational, does not fail the export)
// ---------------------------------------------------------------------------

const IMPORT_RE = /(?:from\s+|require\()\s*["'](\.[^"']+)["']/g;

function resolveImportTarget(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
  ];
  return candidates.some((c) => existsSync(c));
}

function scanDanglingImports(out) {
  const findings = [];
  walk(out, (full, isDir) => {
    if (isDir) return;
    if (!/\.(ts|tsx)$/.test(full)) return;
    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      return;
    }
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (!resolveImportTarget(full, spec)) {
        findings.push({
          file: relative(out, full),
          line: lineNumberAt(text, match.index ?? 0),
          spec,
        });
      }
    }
  });
  return findings;
}

// ---------------------------------------------------------------------------
// Report writing
// ---------------------------------------------------------------------------

function writeExportReport(out, ctx) {
  const {
    doc,
    log,
    secretFindings,
    danglingFindings,
    startedAt,
    sourceRoot,
  } = ctx;

  const lines = [];
  lines.push("# RastrackDash sanitized export report (F3.2 dry-run)");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: ${sourceRoot}`);
  lines.push(`Duration: ${Date.now() - startedAt}ms`);
  lines.push("");
  lines.push("## Removed");
  lines.push(`- remove_paths deleted: ${log.removedPaths.length}`);
  lines.push(`- remove_paths not found (already absent / typo?): ${log.removePathsNotFound.length}`);
  lines.push(`- remove_path_patterns matches deleted: ${log.removedByPattern.length}`);
  lines.push(`- Prisma models removed: ${log.prismaModelsRemoved.length} (${log.prismaModelsRemoved.join(", ")})`);
  lines.push(`- Prisma models not found in schema: ${log.prismaModelsNotFound.length}`);
  lines.push(`- Prisma dangling relation field lines cleaned: ${log.prismaDanglingFieldsRemoved.length}`);
  lines.push(`- Prisma residual whole-word references after cleanup: ${log.prismaResidualReferences.length}`);
  if (log.prismaResidualReferences.length) {
    for (const r of log.prismaResidualReferences) lines.push(`  - ${r}`);
  }
  lines.push("");
  lines.push("## Nest module / barrel codemods");
  lines.push(`- Applied: ${log.moduleStripApplied.length}`);
  for (const a of log.moduleStripApplied) lines.push(`  - ${a}`);
  lines.push(`- Not found (identifier already absent): ${log.moduleStripNotFound.length}`);
  for (const a of log.moduleStripNotFound) lines.push(`  - ${a}`);
  if (log.moduleStripSkipped.length) {
    lines.push(`- Skipped (target file missing): ${log.moduleStripSkipped.length}`);
    for (const a of log.moduleStripSkipped) lines.push(`  - ${a}`);
  }
  lines.push("");
  lines.push("## Meta OAuth broker removal codemod");
  for (const a of log.metaOAuthCodemod) lines.push(`- OK: ${a}`);
  for (const a of log.metaOAuthCodemodFailed) lines.push(`- FAILED: ${a}`);
  lines.push("");
  lines.push("## Leftover license/asaas/uazapi-admin residue codemods");
  for (const a of log.residueCodemod) lines.push(`- OK: ${a}`);
  for (const a of log.residueCodemodFailed) lines.push(`- FAILED: ${a}`);
  lines.push("");
  lines.push("## .env.example");
  lines.push(`- Vars kept: ${log.envVarsKept.length}`);
  lines.push(`- Vars stripped: ${log.envVarsStripped.length}`);
  lines.push("");
  lines.push("## Secret scan (fail-closed gate)");
  lines.push(
    secretFindings.length === 0
      ? "PASS — no secret_fail_patterns matched."
      : `FAIL — ${secretFindings.length} match(es). Export aborted (see below).`,
  );
  for (const f of secretFindings) {
    lines.push(`  - pattern "${f.pattern}" in ${f.file}:${f.line}`);
  }
  lines.push("");
  lines.push("## Known limitations / residual TODOs (F3.3+)");
  lines.push(
    "- billing/ was stripped wholesale (MVP default). Files outside billing/ that " +
      "still import from it (WhatsappSeatService, PackageBillingConfiguration, " +
      "BillingService, PackageBillingWebhookService, ExternalChannelBillingAccessService, " +
      "PlatformAdminService cross-references) are NOT rewritten — see dangling-import " +
      "scan below for the exact file:line list. Deciding how to re-architect those call " +
      "sites (drop the gate vs. reimplement a BYO capacity concept) is deliberately left " +
      "for a follow-up slice rather than guessed here.",
  );
  lines.push(
    "- Single-owner platform-admin bootstrap not designed/rewritten (create-platform-admin.ts, " +
      "promote-platform-owner.ts, platform-admin.service.ts stripped along with the multi-client " +
      "staff model). create-user.ts is kept as the generic helper. F3.3/F6 TODO.",
  );
  lines.push(
    "- meta/oauth/advanced endpoints in integrations.controller.ts remain deferred " +
      "(ambiguous legacy_oauth vs. manual usage) — not touched by this export.",
  );
  lines.push(
    "- workspace-access-gate.tsx / app-shell.tsx still reference the removed /subscription " +
      "route (nav icon + redirect string) — dead link, not a build break, needs UI cleanup.",
  );
  lines.push(
    "- Full `pnpm install && build` of the export was not run in this environment (no " +
      "node_modules / prisma CLI available in the sandbox) — see EXPORT_NOTES.md and the F3.4 " +
      "task note. Only textual/static checks (paths absent, secret scan, dangling-import scan) " +
      "were performed.",
  );
  lines.push(
    "- apps/web/tests/ was left in place (unlike apps/api/test/, which was stripped wholesale " +
      "because it hard-failed the secret scan). ~11 web test files still import now-removed " +
      "pages (backoffice/*, subscription/, meta-oauth-*) — see the dangling-import scan below " +
      "for the exact list; they only trip the informational scanner, not the fail-closed gate, " +
      "so they're left for F3.3 test-suite curation rather than deleted here.",
  );
  lines.push("");
  lines.push(`## Dangling relative-import scan (informational, ${danglingFindings.length} finding(s))`);
  lines.push(
    "Static best-effort scan: relative `from \"./...\"`/`require(\"./...\")` specifiers whose " +
      "target file no longer exists in the export. Does not fail the export.",
  );
  for (const f of danglingFindings) {
    lines.push(`  - ${f.file}:${f.line} -> "${f.spec}"`);
  }
  lines.push("");
  lines.push("## Counts from sanitize-allowdeny.yml");
  for (const key of [
    "remove_paths",
    "remove_path_patterns",
    "keep_paths",
    "defer_review",
    "rewrite_rules",
    "secret_fail_patterns",
    "env_strip",
    "env_allow",
  ]) {
    const v = doc[key];
    lines.push(`- ${key}: ${Array.isArray(v) ? v.length : "n/a"}`);
  }
  lines.push("");

  writeFileSync(join(out, "EXPORT_REPORT.md"), lines.join("\n"));
}

function writeExportNotes(privateNotesPath, ctx) {
  const { log, secretFindings, danglingFindings, out, ok } = ctx;
  let gitSha = "unknown";
  try {
    gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    // best-effort only
  }
  const lines = [
    "# RastrackDash export — last dry-run notes (F3.2)",
    "",
    "Auto-written by `scripts/rastrackdash/sanitize-export.mjs` after each run.",
    "Never contains secret values, only counts/paths/pattern names.",
    "",
    `- When: ${new Date().toISOString()}`,
    `- Source commit: ${gitSha}`,
    `- Destination: ${out}`,
    `- Result: ${ok ? "OK (secret scan passed)" : "FAILED (secret scan or gate failure — see above)"}`,
    `- remove_paths deleted: ${log.removedPaths.length}`,
    `- Prisma models removed: ${log.prismaModelsRemoved.length}`,
    `- Nest/barrel codemods applied: ${log.moduleStripApplied.length}`,
    `- Meta OAuth broker codemod: ${log.metaOAuthCodemod.length} applied, ${log.metaOAuthCodemodFailed.length} failed`,
    `- Secret scan findings: ${secretFindings.length}`,
    `- Dangling relative-import findings: ${danglingFindings.length}`,
    "",
    "Full detail in `<out>/EXPORT_REPORT.md` (not committed — output lives under /tmp).",
  ];
  writeFileSync(privateNotesPath, lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// self-test
// ---------------------------------------------------------------------------

async function selfTest() {
  let failures = 0;

  const doc = await loadYaml(YML_PATH);

  // 1. Unit-test the secret scanner against a planted fake secret.
  const fakeSecretText = `UAZAPI_TOKEN=fine\nSTRIPE_LIKE=sk_live_abcdEFGH12345678\n`;
  const hits = scanTextForSecrets(fakeSecretText, doc.secret_fail_patterns);
  if (hits.length === 0) {
    console.error("SELF-TEST FAIL: planted fake secret (sk_live_...) was not detected");
    failures += 1;
  } else {
    console.log(`SELF-TEST OK: scanner detected planted secret (${hits.map((h) => h.pattern).join(", ")})`);
  }

  const cleanText = "NODE_ENV=production\nWEB_ORIGIN=https://example.com\n";
  const cleanHits = scanTextForSecrets(cleanText, doc.secret_fail_patterns);
  if (cleanHits.length !== 0) {
    console.error(`SELF-TEST FAIL: clean text falsely flagged as secret (${cleanHits.map((h) => h.pattern).join(", ")})`);
    failures += 1;
  } else {
    console.log("SELF-TEST OK: clean text produced no false positive");
  }

  // 2. defer_review paths must not also appear in keep_paths (gate #3).
  const keepSet = new Set(doc.keep_paths);
  const overlap = doc.defer_review
    .map((d) => d.path)
    .filter((p) => keepSet.has(p));
  if (overlap.length) {
    console.error(`SELF-TEST FAIL: defer_review path(s) also in keep_paths: ${overlap.join(", ")}`);
    failures += 1;
  } else {
    console.log("SELF-TEST OK: no defer_review/keep_paths overlap");
  }

  // 3. Licensing/xmax must be in the hard-remove lists (never accidentally re-allowed).
  const requiredRemoves = [
    "apps/api/src/licensing/",
    "apps/api/src/xmax/",
    "apps/api/src/billing/",
  ];
  const missing = requiredRemoves.filter((p) => !doc.remove_paths.includes(p));
  if (missing.length) {
    console.error(`SELF-TEST FAIL: expected remove_paths entries missing: ${missing.join(", ")}`);
    failures += 1;
  } else {
    console.log("SELF-TEST OK: licensing/xmax/billing present in remove_paths");
  }

  if (failures > 0) {
    console.error(`\nSELF-TEST: ${failures} failure(s)`);
    process.exitCode = 1;
  } else {
    console.log("\nSELF-TEST: all checks passed");
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    await selfTest();
    return;
  }

  if (!args.out) {
    console.error("Usage: sanitize-export.mjs --out <dir under /tmp> [--source <repoRoot>] [--force]");
    console.error("       sanitize-export.mjs --self-test");
    process.exitCode = 1;
    return;
  }

  const out = resolve(args.out);
  const tmpRoot = resolve("/tmp");
  if (out !== tmpRoot && !out.startsWith(tmpRoot + sep)) {
    console.error(`FAIL: --out must be under /tmp (got: ${out})`);
    process.exitCode = 1;
    return;
  }

  let doc;
  try {
    doc = await loadYaml(YML_PATH);
  } catch (err) {
    console.error(`FAIL: could not parse ${YML_PATH}`);
    console.error(err.message ?? err);
    process.exitCode = 1;
    return;
  }

  // Gate: defer_review paths must never be reachable from keep_paths.
  const keepSet = new Set(doc.keep_paths ?? []);
  const badOverlap = (doc.defer_review ?? [])
    .map((d) => d.path)
    .filter((p) => keepSet.has(p));
  if (badOverlap.length) {
    console.error(
      `FAIL: defer_review path(s) also listed in keep_paths — refusing to guess: ${badOverlap.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  if (existsSync(out)) {
    const contents = readdirSync(out);
    if (contents.length > 0 && !args.force) {
      console.error(`FAIL: --out ${out} already exists and is non-empty. Use --force to overwrite.`);
      process.exitCode = 1;
      return;
    }
    rmSync(out, { recursive: true, force: true });
  }

  const startedAt = Date.now();
  const log = {
    removedPaths: [],
    removePathsNotFound: [],
    removedByPattern: [],
    prismaModelsRemoved: [],
    prismaModelsNotFound: [],
    prismaDanglingFieldsRemoved: [],
    prismaResidualReferences: [],
    moduleStripApplied: [],
    moduleStripNotFound: [],
    moduleStripSkipped: [],
    metaOAuthCodemod: [],
    metaOAuthCodemodFailed: [],
    residueCodemod: [],
    residueCodemodFailed: [],
    envVarsKept: [],
    envVarsStripped: [],
  };

  console.log(`Copying ${args.source} -> ${out} ...`);
  // design-system dirs are excluded up front per MVP default (out of v1,
  // never copied) — also covered defensively by remove_paths afterwards.
  copyTree(args.source, out, new Set(["design-system", "wpptrack-design-system"]));

  console.log("Deleting remove_paths ...");
  deleteRemovePaths(out, doc.remove_paths ?? [], log);

  console.log("Deleting remove_path_patterns matches ...");
  deleteRemovePatterns(out, doc.remove_path_patterns ?? [], log);

  console.log("Pruning empty directories left behind by strips ...");
  pruneEmptyDirs(out);

  console.log("Applying Nest module / barrel registration strips ...");
  for (const entry of doc.module_registrations_strip ?? []) {
    applyModuleRegistrationStrip(out, entry.file, entry.identifiers, log);
  }
  for (const entry of doc.barrel_exports_remove ?? []) {
    applyBarrelExportsRemove(out, entry.file, entry.export_paths, log);
  }
  // app.module.ts is the primary registration point, driven by
  // app_module_imports_remove.remove (kept as its own section for clarity).
  applyModuleRegistrationStrip(
    out,
    "apps/api/src/app.module.ts",
    doc.app_module_imports_remove?.remove ?? [],
    log,
  );

  console.log("Applying Meta OAuth broker removal codemod ...");
  applyMetaOAuthBrokerRemoval(out, log);

  console.log("Applying leftover license/asaas/uazapi-admin residue codemods ...");
  applyResidueCodemods(out, log);

  console.log("Stripping Prisma models ...");
  const prismaRemove = doc.prisma_models_remove?.remove ?? [];
  stripPrismaModels(out, prismaRemove, log);

  console.log("Regenerating .env.example ...");
  regenerateEnvExample(out, doc.env_allow ?? [], log);

  console.log("Running secret scan (fail-closed) ...");
  const secretFindings = runSecretScan(out, doc.secret_fail_patterns ?? []);

  console.log("Running dangling relative-import scan (informational) ...");
  const danglingFindings = scanDanglingImports(out);

  const ok = secretFindings.length === 0;

  writeExportReport(out, {
    doc,
    log,
    secretFindings,
    danglingFindings,
    startedAt,
    sourceRoot: args.source,
  });

  const notesPath = join(__dirname, "EXPORT_NOTES.md");
  writeExportNotes(notesPath, { log, secretFindings, danglingFindings, out, ok });

  if (!ok) {
    console.error(`\nSECRET SCAN FAILED — ${secretFindings.length} match(es):`);
    for (const f of secretFindings) {
      console.error(`  pattern "${f.pattern}" in ${f.file}:${f.line}`);
    }
    console.error(`\nDeleting failed export output at ${out} (fail-closed).`);
    rmSync(out, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  console.log(`\nOK: sanitized export written to ${out}`);
  console.log(`Removed paths: ${log.removedPaths.length}, Prisma models removed: ${log.prismaModelsRemoved.length}`);
  console.log(`Secret scan: PASS. Dangling relative-import findings (informational): ${danglingFindings.length}.`);
  console.log(`See ${join(out, "EXPORT_REPORT.md")} for full detail.`);
  console.log(`Notes written to ${notesPath} (private repo, not the export).`);
}

await main();
