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
// F3.3 dangling-import resolution codemods — each documented as an "Applied
// as a codemod" rewrite_rules entry in sanitize-allowdeny.yml. Small,
// self-contained, exact-text replacements (no regex) so a source drift shows
// up as a loud FAILED line in EXPORT_REPORT.md instead of a silent no-op.
// ---------------------------------------------------------------------------

function applyStringCodemod(out, file, steps, log) {
  const target = join(out, file);
  if (!existsSync(target)) {
    log.f33CodemodFailed.push(`${file}: file absent`);
    return;
  }
  let content = readFileSync(target, "utf8");
  for (const step of steps) {
    if (content.includes(step.search)) {
      content = content.replace(step.search, step.replace ?? "");
      log.f33Codemod.push(`${file}: ${step.label}`);
    } else {
      log.f33CodemodFailed.push(`${file}: ${step.label} — marker not found (source may have drifted)`);
    }
  }
  writeFileSync(target, content);
}

// F3.4: removes a contiguous span of source between two unique anchor
// strings (each including its own leading "\n\n" so the join reconnects
// with exactly one blank line, matching the surrounding style). Used for
// deleting whole dead methods/types that are too large to spell out as a
// single exact-text replacement without risking a transcription typo —
// only the (short, unique) boundary markers need to match exactly.
function removeAnchoredSpan(content, startAnchor, endAnchor) {
  const startIdx = content.indexOf(startAnchor);
  if (startIdx === -1) return { content, removed: false, reason: "start marker not found" };
  const endIdx = content.indexOf(endAnchor, startIdx + startAnchor.length);
  if (endIdx === -1) return { content, removed: false, reason: "end marker not found" };
  return {
    content: content.slice(0, startIdx) + content.slice(endIdx),
    removed: true,
  };
}

function applyAnchoredRemovals(out, file, spans, log) {
  const target = join(out, file);
  if (!existsSync(target)) {
    log.f34CodemodFailed.push(`${file}: file absent`);
    return;
  }
  let content = readFileSync(target, "utf8");
  for (const span of spans) {
    const result = removeAnchoredSpan(content, span.startAnchor, span.endAnchor);
    if (result.removed) {
      content = result.content;
      log.f34Codemod.push(`${file}: ${span.label}`);
    } else {
      log.f34CodemodFailed.push(`${file}: ${span.label} — ${result.reason} (source may have drifted)`);
    }
  }
  writeFileSync(target, content);
}

// rewrite_rules.external-channel-seat-gate-noop
function applySeatGateNoop(out, log) {
  const files = [
    "apps/api/src/conversion-rules/provider-conversion-rules.service.ts",
    "apps/api/src/inbound-webhooks/inbound-webhook-channel-routes.service.ts",
    "apps/api/src/inbound-webhooks/inbound-webhook-connections.service.ts",
  ];

  const enforcementBefore =
    'private externalChannelEnforcementEnabled(): boolean {\n' +
    '    const enabled =\n' +
    '      this.billingConfiguration?.isPackageBillingEnabled() === true &&\n' +
    '      this.billingConfiguration.isExternalChannelEnforcementEnabled();\n' +
    '\n' +
    '    if (enabled && !this.whatsappSeats) {\n' +
    '      throw new ServiceUnavailableException(\n' +
    '        "Controle de vagas dos canais externos indisponivel",\n' +
    '      );\n' +
    '    }\n' +
    '\n' +
    '    return enabled;\n' +
    '  }';
  const enforcementAfter =
    'private externalChannelEnforcementEnabled(): boolean {\n' +
    '    // rastrackdash sanitize (rewrite_rules.external-channel-seat-gate-noop):\n' +
    '    // billing/ is stripped in this edition, so external-channel seat\n' +
    '    // enforcement can never be enabled — hardcode the noop outcome instead\n' +
    '    // of inferring it from now-absent optional billing deps.\n' +
    '    return false;\n' +
    '  }';

  const activateSeatBefore =
    '      activateSeat: (transaction, seatInput) =>\n' +
    '        this.whatsappSeats!.activateExternalChannelSeat(transaction, seatInput),';
  const activateSeatAfter =
    '      activateSeat: () => {\n' +
    '        throw new Error(\n' +
    '          "External channel seat activation is unavailable once billing/ is removed.",\n' +
    '        );\n' +
    '      },';

  const steps = [
    {
      search: 'import { PackageBillingConfiguration } from "../billing/package-billing.configuration";\n',
      replace: "",
      label: "PackageBillingConfiguration import removed",
    },
    {
      search: 'import { WhatsappSeatService } from "../billing/whatsapp-seat.service";\n',
      replace: "",
      label: "WhatsappSeatService import removed",
    },
    {
      search:
        "    @Optional()\n" +
        "    @Inject(PackageBillingConfiguration)\n" +
        "    private readonly billingConfiguration?: PackageBillingConfiguration,\n" +
        "    @Optional()\n" +
        "    @Inject(WhatsappSeatService)\n" +
        "    private readonly whatsappSeats?: WhatsappSeatService,\n",
      replace: "",
      label: "billingConfiguration/whatsappSeats constructor params removed",
    },
    {
      search: activateSeatBefore,
      replace: activateSeatAfter,
      label: "seatHook().activateSeat() stubbed to throw (unreachable)",
    },
    {
      search: enforcementBefore,
      replace: enforcementAfter,
      label: "externalChannelEnforcementEnabled() hardcoded to false",
    },
  ];

  for (const file of files) applyStringCodemod(out, file, steps, log);

  // F3.4: unlike the other two seat-gate files, InboundWebhookConnectionsService
  // also releases a seat directly inside removeConnection() — a second,
  // independent this.billingConfiguration/this.whatsappSeats usage the F3.3
  // seat-gate-noop steps above never targeted (they only cover the shared
  // externalChannelEnforcementEnabled()/seatHook() pair). With the
  // constructor params removed above, this block references two fields that
  // no longer exist. Since externalChannelEnforcementEnabled() is now
  // hardcoded false, a seat could never have been allocated for this
  // connection in the first place — removing the release block is a true
  // noop, not a behavior change.
  applyStringCodemod(
    out,
    "apps/api/src/inbound-webhooks/inbound-webhook-connections.service.ts",
    [
      {
        search:
          "      if (\n" +
          "        this.billingConfiguration?.isPackageBillingEnabled() &&\n" +
          "        this.whatsappSeats\n" +
          "      ) {\n" +
          "        const channels = await transaction.inboundWebhookChannel.findMany({\n" +
          "          where: {\n" +
          "            workspaceId,\n" +
          "            connectionId,\n" +
          "          },\n" +
          "          select: { id: true },\n" +
          "        });\n" +
          "\n" +
          "        for (const channel of channels) {\n" +
          "          await this.whatsappSeats.releaseExternalChannelSeat(transaction, {\n" +
          "            workspaceId,\n" +
          "            channelId: channel.id,\n" +
          "            actorUserId,\n" +
          "            reason: \"connection_removed\",\n" +
          "          });\n" +
          "        }\n" +
          "      }\n",
        replace:
          "      // rastrackdash sanitize (rewrite_rules.external-channel-seat-gate-noop):\n" +
          "      // billing/ is stripped in this edition, so external-channel seats are\n" +
          "      // never allocated and there is nothing to release here.\n",
        label: "removeConnection() seat-release-on-remove block noop'd",
      },
    ],
    log,
  );
}

// rewrite_rules.external-channel-billing-access-stub
function applyExternalChannelBillingAccessStub(out, log) {
  const targets = [
    {
      file: "apps/api/src/inbound-webhook-production/inbound-webhook-production.service.ts",
      className: "InboundWebhookProductionService",
    },
    {
      file: "apps/api/src/inbound-webhook-production/provider-conversion-production.service.ts",
      className: "ProviderConversionProductionService",
    },
  ];

  const importBefore =
    "import {\n" +
    "  ExternalChannelBillingAccessError,\n" +
    "  ExternalChannelBillingAccessService,\n" +
    '} from "../billing/external-channel-billing-access.service";';
  const importAfter =
    "// rastrackdash sanitize (rewrite_rules.external-channel-billing-access-stub):\n" +
    "// billing/ is stripped in this edition; ExternalChannelBillingAccessService\n" +
    "// was a REQUIRED (non-@Optional) constructor dependency here, so removing\n" +
    "// just the import isn't enough — this local always-allow stand-in matches\n" +
    "// ExternalChannelBillingAccessService.isEnforced() === false once\n" +
    "// PackageBillingConfiguration is gone, and keeps\n" +
    "// ExternalChannelBillingAccessError as a real class so the existing\n" +
    "// instanceof error-code narrowing below still compiles (it is now\n" +
    "// unreachable, since assertProductionAccess() never throws).\n" +
    "class ExternalChannelBillingAccessError extends Error {\n" +
    "  constructor(readonly code: string) {\n" +
    '    super("External WhatsApp channel billing access denied");\n' +
    '    this.name = "ExternalChannelBillingAccessError";\n' +
    "  }\n" +
    "}\n" +
    "class ExternalChannelBillingAccessStub {\n" +
    "  async assertProductionAccess(\n" +
    "    _workspaceId: string,\n" +
    "    _channelId: string,\n" +
    "  ): Promise<void> {\n" +
    "    // no-op: external-channel billing enforcement is always disabled once\n" +
    "    // billing/ is removed.\n" +
    "  }\n" +
    "}";

  const paramBefore =
    "    @Inject(ExternalChannelBillingAccessService)\n" +
    "    private readonly billingAccess: ExternalChannelBillingAccessService,\n";

  for (const { file, className } of targets) {
    const fieldBefore = `export class ${className} {\n`;
    const fieldAfter =
      `export class ${className} {\n` +
      "  private readonly billingAccess = new ExternalChannelBillingAccessStub();\n" +
      "\n";

    applyStringCodemod(out, file, [
      { search: importBefore, replace: importAfter, label: "billing-access import replaced with local stub" },
      { search: paramBefore, replace: "", label: "billingAccess @Inject constructor param removed" },
      { search: fieldBefore, replace: fieldAfter, label: "billingAccess field wired to stub instance" },
    ], log);
  }
}

// rewrite_rules.platform-admin-user-local-type
function applyPlatformAdminUserLocalType(out, log) {
  applyStringCodemod(
    out,
    "apps/api/src/inbound-webhook-replay/inbound-webhook-replay.service.ts",
    [
      {
        search: 'import type { PlatformAdminUser } from "../auth/platform-admin.service";',
        replace:
          "// rastrackdash sanitize (rewrite_rules.platform-admin-user-local-type):\n" +
          "// auth/platform-admin.service.ts is stripped (multi-client staff model);\n" +
          "// this file only ever imported the PlatformAdminUser TYPE to type an\n" +
          "// `actor` parameter, never PlatformAdminService itself. Local structural\n" +
          "// type keeps certifyParserRelease/authorizeReplay/retryTransientFailures\n" +
          "// intact for a future single-owner bootstrap caller (F3.3/F6 TODO)\n" +
          "// instead of deleting real per-workspace business logic.\n" +
          "type PlatformAdminUser = { id: string; role: string };",
        label: "PlatformAdminUser import replaced with local structural type",
      },
    ],
    log,
  );
}

// rewrite_rules.asaas-adapter-removal
function applyAsaasAdapterRemoval(out, log) {
  applyStringCodemod(
    out,
    "apps/api/src/integrations/integrations.service.ts",
    [
      {
        search: 'import { AsaasAdapter } from "./asaas/asaas.adapter";\n',
        replace: "",
        label: "AsaasAdapter import removed",
      },
      {
        search: "    private readonly asaasAdapter: AsaasAdapter,\n",
        replace: "",
        label: "asaasAdapter constructor param removed",
      },
      {
        search: "        this.asaasAdapter.getHealth(),\n",
        replace: "",
        label: "asaasAdapter.getHealth() call removed from getHealthSummary()",
      },
    ],
    log,
  );
}

// rewrite_rules.client-swap-web-panel-removal
function applyClientSwapWebRemoval(out, log) {
  applyStringCodemod(
    out,
    "apps/web/src/app/(app)/settings/page.tsx",
    [
      {
        search: 'import { ClientSwapPanel } from "../../../components/client-swap-panel";\n',
        replace: "",
        label: "ClientSwapPanel import removed",
      },
      {
        search: 'import { clientSwapAction } from "./client-swap-actions";\n',
        replace: "",
        label: "clientSwapAction import removed",
      },
      {
        search: "  ArrowLeftRight,\n",
        replace: "",
        label: "ArrowLeftRight icon import removed (only used by the removed section)",
      },
      {
        search:
          "  const canSwapClient = Boolean(\n" +
          "    workspace &&\n" +
          '    workspace.role === "owner" &&\n' +
          "    (!isPlatformSupport || isPlatformOwnerSupport),\n" +
          "  );\n",
        replace: "",
        label: "canSwapClient flag removed",
      },
      {
        search:
          "        {canSwapClient ? (\n" +
          '          <a href="#configuracao-trocar-cliente">\n' +
          '            <ArrowLeftRight size={16} aria-hidden="true" />\n' +
          "            Trocar cliente\n" +
          "          </a>\n" +
          "        ) : null}\n",
        replace: "",
        label: "sidebar nav anchor removed",
      },
      {
        search:
          "      {canSwapClient && workspace ? (\n" +
          "        <section\n" +
          '          className="settings-domain-section settings-client-swap-domain"\n' +
          '          id="configuracao-trocar-cliente"\n' +
          '          aria-labelledby="settings-client-swap-title"\n' +
          "        >\n" +
          '          <div className="settings-domain-heading">\n' +
          '            <span className="settings-domain-number" aria-hidden="true">\n' +
          "              05\n" +
          "            </span>\n" +
          "            <div>\n" +
          '              <span className="eyebrow">Operacao da agencia</span>\n' +
          '              <h2 id="settings-client-swap-title">Trocar de cliente</h2>\n' +
          "              <p>\n" +
          "                Use quando este workspace deixar de atender o cliente atual e\n" +
          "                for reaproveitado para outro. A assinatura e a equipe da\n" +
          "                agencia permanecem; os dados operacionais do cliente sao\n" +
          "                apagados.\n" +
          "              </p>\n" +
          "            </div>\n" +
          '            <span className="status-chip warn">Acao destrutiva</span>\n' +
          "          </div>\n" +
          "\n" +
          '          <div className="surface-panel client-swap-panel-shell">\n' +
          "            <ClientSwapPanel\n" +
          "              workspaceId={workspace.id}\n" +
          "              workspaceName={workspace.name}\n" +
          "              swapAction={clientSwapAction}\n" +
          "              successRedirect={\n" +
          "                isPlatformOwnerSupport\n" +
          '                  ? "/backoffice/clients?swapped=1"\n' +
          "                  : undefined\n" +
          "              }\n" +
          "            />\n" +
          "          </div>\n" +
          "        </section>\n" +
          "      ) : null}\n",
        replace: "",
        label: "canSwapClient-gated <section> removed",
      },
    ],
    log,
  );
}

// rewrite_rules.meta-oauth-advanced-removal
function applyMetaOAuthAdvancedRemoval(out, log) {
  const file = "apps/api/src/integrations/integrations.controller.ts";
  const target = join(out, file);
  if (!existsSync(target)) {
    log.f33CodemodFailed.push(`${file}: file absent`);
    return;
  }
  let content = readFileSync(target, "utf8");
  const before = content;

  content = content.replace(
    /\n {2}@Get\("meta\/oauth\/advanced"\)[\s\S]*?(?=\n {2}@Get\("meta\/manual"\))/,
    "\n",
  );
  content = content.replace(/^ {2}metaOAuthAdvancedRoutingInputSchema,\r?\n/m, "");

  if (content !== before) {
    writeFileSync(target, content);
    log.f33Codemod.push(`${file}: meta/oauth/advanced endpoints (11) + unused schema import removed`);
  } else {
    log.f33CodemodFailed.push(`${file}: meta/oauth/advanced removal — marker not found (source may have drifted)`);
  }
}

// rewrite_rules.subscription-dead-links-removal
function applySubscriptionDeadLinksRemoval(out, log) {
  applyStringCodemod(out, "packages/shared/src/navigation.ts", [
    {
      search: '  { id: "settings", label: "Configuracoes" },\n  { id: "subscription", label: "Assinatura" }\n',
      replace: '  { id: "settings", label: "Configuracoes" }\n',
      label: 'clientNavigation "subscription" entry removed',
    },
    {
      search: '  settings: "canManageWorkspaceSettings",\n  subscription: "canManageBilling"\n',
      replace: '  settings: "canManageWorkspaceSettings"\n',
      label: "subscription permission mapping removed",
    },
  ], log);

  applyStringCodemod(out, "apps/web/src/components/app-shell.tsx", [
    {
      search: "  Plug,\n  CreditCard,\n  Send,\n",
      replace: "  Plug,\n  Send,\n",
      label: "CreditCard icon import removed",
    },
    {
      search: "  settings: Settings2,\n  subscription: CreditCard,\n",
      replace: "  settings: Settings2,\n",
      label: "subscription icon mapping removed",
    },
    {
      search: '    ids: ["integrations", "settings", "subscription"],\n',
      replace: '    ids: ["integrations", "settings"],\n',
      label: '"subscription" removed from Gestao nav group ids',
    },
  ], log);

  applyStringCodemod(out, "apps/web/src/middleware.ts", [
    {
      search: '  "/settings",\n  "/subscription",\n  "/backoffice",\n',
      replace: '  "/settings",\n  "/backoffice",\n',
      label: "/subscription removed from protectedPrefixes",
    },
    {
      search: '    "/settings/:path*",\n    "/subscription/:path*",\n    "/backoffice/:path*",\n',
      replace: '    "/settings/:path*",\n    "/backoffice/:path*",\n',
      label: "/subscription/:path* removed from matcher",
    },
  ], log);

  applyStringCodemod(out, "apps/web/src/components/workspace-access-gate.tsx", [
    {
      search: 'import Link from "next/link";\n',
      replace: "",
      label: "Link import removed (only used by the removed billing_blocked branch)",
    },
    {
      search: "  getAvailableWorkspaces,\n  getCurrentWorkspace,\n  getWorkspacePackageAccess,\n} from \"../lib/current-workspace\";",
      replace: "  getAvailableWorkspaces,\n  getCurrentWorkspace,\n} from \"../lib/current-workspace\";",
      label: "getWorkspacePackageAccess import removed",
    },
    {
      search:
        "  if (\n" +
        '    workspaceAccess.state === "billing_blocked" &&\n' +
        '    !pathname.startsWith("/subscription")\n' +
        "  ) {\n" +
        "    const canOpenSubscription = clientNavVisibleForPermissions(\n" +
        '      "subscription",\n' +
        "      workspaceAccess.workspace.permissions,\n" +
        "    );\n" +
        "\n" +
        "    return (\n" +
        "      <AppShell workspace={workspaceAccess.workspace} workspaces={workspaces}>\n" +
        '        <section className="page-stack">\n' +
        '          <header className="page-header">\n' +
        "            <div>\n" +
        '              <span className="eyebrow">Assinatura</span>\n' +
        "              <h1>Acesso suspenso</h1>\n" +
        "              <p>\n" +
        "                {canOpenSubscription\n" +
        '                  ? "Regularize a assinatura para voltar a acessar os dados e as operacoes deste workspace."\n' +
        '                  : "A assinatura deste workspace precisa ser regularizada pelo responsavel da conta."}\n' +
        "              </p>\n" +
        "            </div>\n" +
        '            <div className="header-actions">\n' +
        '              <span className="status-chip warn">pagamento pendente</span>\n' +
        "              {canOpenSubscription ? (\n" +
        '                <Link className="button primary" href="/subscription">\n' +
        "                  Gerenciar assinatura\n" +
        "                </Link>\n" +
        "              ) : null}\n" +
        "            </div>\n" +
        "          </header>\n" +
        "        </section>\n" +
        "      </AppShell>\n" +
        "    );\n" +
        "  }\n" +
        "\n",
      replace: "",
      label: "billing_blocked branch removed",
    },
    {
      search:
        '  if (pathname === "/subscription" || pathname.startsWith("/subscription/")) {\n' +
        '    return "subscription";\n' +
        "  }\n",
      replace: "",
      label: "subscription case removed from managementNavIdForPath",
    },
    {
      search:
        "  // Fail-closed management routes: analyst (member) and others without the\n" +
        "  // matching permission cannot open integrations/settings/subscription by URL.\n",
      replace:
        "  // Fail-closed management routes: analyst (member) and others without the\n" +
        "  // matching permission cannot open integrations/settings by URL.\n",
      label: "stale /subscription mention removed from comment",
    },
    {
      search:
        "    const workspace = await getCurrentWorkspace();\n" +
        "\n" +
        '    if (workspace.accessMode !== "platform_support") {\n' +
        "      try {\n" +
        "        const packageAccess = await getWorkspacePackageAccess();\n" +
        "\n" +
        "        if (packageAccess.enforcementEnabled && !packageAccess.allowed) {\n" +
        "          return {\n" +
        '            state: "billing_blocked",\n' +
        "            workspace,\n" +
        "          };\n" +
        "        }\n" +
        "      } catch {\n" +
        "        // The API guard remains authoritative if the lightweight UI check fails.\n" +
        "      }\n" +
        "    }\n" +
        "\n" +
        "    return {\n",
      replace: "    const workspace = await getCurrentWorkspace();\n\n    return {\n",
      label: "getWorkspacePackageAccess() billing_blocked check removed",
    },
    {
      search:
        "  | {\n" +
        '      state: "operational_blocked";\n' +
        "      workspace: CurrentWorkspaceDto | null;\n" +
        "    }\n" +
        '  | { state: "billing_blocked"; workspace: CurrentWorkspaceDto }\n',
      replace:
        "  | {\n" +
        '      state: "operational_blocked";\n' +
        "      workspace: CurrentWorkspaceDto | null;\n" +
        "    }\n",
      label: "billing_blocked state removed from getWorkspaceAccessState() return type",
    },
  ], log);

  applyStringCodemod(out, "apps/web/src/lib/current-workspace.ts", [
    {
      search: "  WorkspaceListDto,\n  WorkspacePackageAccessDto,\n} from \"@wpptrack/shared\";",
      replace: "  WorkspaceListDto,\n} from \"@wpptrack/shared\";",
      label: "WorkspacePackageAccessDto import removed",
    },
    {
      search:
        "\n" +
        "export const getWorkspacePackageAccess = cache(() =>\n" +
        '  serverApiFetch<WorkspacePackageAccessDto>("/billing/package/access"),\n' +
        ");\n",
      replace: "\n",
      label: "getWorkspacePackageAccess() export removed",
    },
  ], log);

  applyStringCodemod(out, "apps/web/src/app/(app)/integrations/page.tsx", [
    {
      search:
        '                <Link className="button primary" href="/subscription">\n' +
        "                  Gerenciar assinatura e QR\n" +
        "                </Link>\n",
      replace:
        '                <Link className="button primary" href="/settings">\n' +
        "                  Gerenciar assinatura e QR\n" +
        "                </Link>\n",
      label: 'dead "Gerenciar assinatura e QR" CTA repointed to /settings',
    },
    {
      search:
        '                  <Link className="button primary" href="/subscription">\n' +
        "                    Abrir assinatura\n" +
        "                  </Link>\n",
      replace:
        '                  <Link className="button primary" href="/settings">\n' +
        "                    Abrir assinatura\n" +
        "                  </Link>\n",
      label: 'dead "Abrir assinatura" CTA repointed to /settings',
    },
  ], log);
}

// rewrite_rules.ops-alerts-whatsapp-connections-stub
function applyOpsAlertsWhatsappConnectionsStub(out, log) {
  applyStringCodemod(
    out,
    "apps/api/src/ops-alerts/ops-alerts.service.ts",
    [
      {
        search: 'import { WhatsappConnectionsService } from "../integrations/whatsapp-connections.service";\n',
        replace: "",
        label: "WhatsappConnectionsService import removed",
      },
      {
        search: "    @Inject(WhatsappConnectionsService) private readonly whatsappConnections: WhatsappConnectionsService,\n",
        replace: "",
        label: "whatsappConnections constructor param removed",
      },
      {
        search:
          "        try {\n" +
          "          const status = await this.whatsappConnections.getStatus(setting.workspaceId, instance.id);\n" +
          '          if (status.connectionStatus === "disconnected") {\n' +
          "            await this.notify(setting, `disconnect:${instance.id}`, `[WppTrack] WhatsApp desconectado no workspace \"${setting.workspace.name}\" (instancia \"${instance.name}\"). Reconecte no painel.`, result, now);\n" +
          "          }\n" +
          "        } catch (error) {\n" +
          "          this.logger.warn(`ops_alert_disconnect_status_failed workspace=${setting.workspaceId} instance=${instance.id}`);\n" +
          "        }\n",
        replace:
          "        // rastrackdash sanitize (rewrite_rules.ops-alerts-whatsapp-connections-stub):\n" +
          "        // WhatsappConnectionsService (billing-only instance marketplace) is\n" +
          "        // stripped in this edition. Re-wiring this check directly against\n" +
          "        // UazapiAdapter is a real feature change left for a follow-up slice\n" +
          "        // (F3.3/F4 TODO); skip rather than guess at the replacement call shape.\n" +
          "        result.skipped += 1;\n" +
          "        await this.record(setting.workspaceId, `disconnect:${instance.id}`, \"skipped\", \"disconnect_status_check_unavailable\");\n",
        label: "disconnect-status check stubbed to skip",
      },
    ],
    log,
  );
}

// ---------------------------------------------------------------------------
// F3.4 dangling-import resolution codemods (round 2 — real typecheck run).
//
// F3.1-F3.3 codemods were designed from static grep/inventory review. Running
// an actual `tsc --noEmit` against the export (F3.4) surfaced three more
// clusters of import/property breaks that inventory review missed, all
// documented in sanitize-allowdeny.yml rewrite_rules:
//   - staff-only-backoffice-methods-removal: auth.service.ts/workspaces.service.ts
//     still had the platform-owner "manage other clients' workspaces" methods
//     (list/provision/block client workspaces, client-owner activation
//     delivery, platform-user role management, per-workspace billing config)
//     wired up even though every controller that called them was already
//     removed (backoffice-workspaces.controller.ts, backoffice-platform-
//     users.controller.ts) — genuinely dead, staff-only multi-client code,
//     not a stub candidate.
//   - meta-oauth-state-residue-removal: the meta/start + meta/callback broker
//     endpoints were removed from integrations.controller.ts in F3.2, but the
//     service methods they called (which read/write the also-removed
//     MetaOAuthState Prisma model) were left behind as unreachable code.
// ---------------------------------------------------------------------------

// rewrite_rules.staff-only-backoffice-methods-removal
function applyStaffOnlyBackofficeMethodsRemoval(out, log) {
  // auth.service.ts: platform-user management (list/provision/update-role)
  // and the client-owner activation-delivery helpers are only ever called
  // from workspaces.service.ts's own staff-only methods (removed below) or
  // from backoffice-platform-users.controller.ts (removed in F3.1/F3.2).
  applyStringCodemod(out, "apps/api/src/auth/auth.service.ts", [
    {
      search: "  ClientOwnerAccessDeliveryDto,\n",
      replace: "",
      label: "ClientOwnerAccessDeliveryDto import removed",
    },
    {
      search:
        "  PlatformUserProvisionInputDto,\n" +
        "  PlatformUserRoleUpdateInputDto,\n" +
        "  PlatformUserDto,\n",
      replace: "",
      label: "PlatformUser*Dto imports removed",
    },
    {
      search:
        'import { platformUserListSchema, platformUserSchema } from "@wpptrack/shared";\n',
      replace: "",
      label: "platformUserListSchema/platformUserSchema import removed",
    },
    {
      search:
        "export type ClientOwnerActivationIssueResult = {\n" +
        '  mode: "activation";\n' +
        '  delivery: "email_queued" | "failed" | "not_configured" | "link_only";\n' +
        "  token: string;\n" +
        "  expiresAt: Date;\n" +
        "  emailAttempted: boolean;\n" +
        "  actionTokenId: string;\n" +
        "  tokenHashPrefix: string;\n" +
        "};\n\n",
      replace: "",
      label: "ClientOwnerActivationIssueResult local type removed",
    },
  ], log);
  applyAnchoredRemovals(
    out,
    "apps/api/src/auth/auth.service.ts",
    [
      {
        startAnchor: "\n\n  async listPlatformUsers(): Promise<PlatformUserDto[]> {",
        endAnchor: "\n\n  async logout(refreshToken: string): Promise<void> {",
        label:
          "listPlatformUsers/provisionPlatformUser/updatePlatformUserRole removed " +
          "(platform-owner-only, no remaining caller once backoffice-platform-users.controller.ts is stripped)",
      },
      {
        startAnchor: "\n\n  async issueClientOwnerActivation(input: {",
        endAnchor: "\n\n  async activateProvisionedAccount(",
        label:
          "issueClientOwnerActivation/issueClientOwnerActivationLink/createClientOwnerActivation removed " +
          "(only called from workspaces.service.ts's client-owner-provisioning methods, removed below)",
      },
    ],
    log,
  );

  // workspaces.service.ts: the "PalmUP staff manages other clients'
  // workspaces" surface (client workspace provisioning, client-owner access
  // delivery, per-workspace billing config, block/unblock) — every caller
  // was backoffice-workspaces.controller.ts, already removed.
  applyStringCodemod(out, "apps/api/src/workspaces/workspaces.service.ts", [
    {
      search:
        "import {\n" +
        "  backofficeClientWorkspaceListSchema,\n" +
        "  clientOwnerAccessResendResultSchema,\n" +
        "  clientOwnerActivationLinkResultSchema,\n" +
        "  clientOwnerSetPasswordResultSchema,\n" +
        "  clientWorkspaceProvisionResultSchema,\n" +
        "  type BackofficeClientWorkspaceDto,\n" +
        "  type ClientOwnerAccessDeliveryDto,\n" +
        "  type ClientOwnerAccessResendResultDto,\n" +
        "  type ClientOwnerActivationLinkResultDto,\n" +
        "  type ClientOwnerSetPasswordInputDto,\n" +
        "  type ClientOwnerSetPasswordResultDto,\n" +
        "  type ClientWorkspaceProvisionInputDto,\n" +
        "  type ClientWorkspaceProvisionResultDto,\n" +
        "  type CurrentWorkspaceDto,\n" +
        "  type BackofficeWhatsappInstanceDto,\n" +
        "  type WorkspaceBillingDto,\n" +
        "  type WorkspaceBillingUpdateInputDto,\n" +
        "  type WorkspaceOperationalStatusUpdateInputDto,\n" +
        "  type WorkspaceInviteDto,\n" +
        "  type WorkspaceInviteAcceptDto,\n" +
        "  type WorkspaceInviteAcceptInputDto,\n" +
        "  type WorkspaceInviteInspectionDto,\n" +
        "  type WorkspaceInviteInputDto,\n" +
        "  type WorkspaceInviteNewUserAcceptInputDto,\n" +
        "  type WorkspaceListDto,\n" +
        "  type WorkspaceMemberManagerUpdateInputDto,\n" +
        "  type WorkspaceMemberDto,\n" +
        "  type WorkspaceMemberRoleUpdateInputDto,\n" +
        "  type WorkspacePermissionsDto,\n" +
        "  type WorkspaceUpdateInputDto,\n" +
        "  type WorkspaceRole,\n" +
        '} from "@wpptrack/shared";\n',
      replace:
        "import type {\n" +
        "  CurrentWorkspaceDto,\n" +
        "  WorkspaceInviteDto,\n" +
        "  WorkspaceInviteAcceptDto,\n" +
        "  WorkspaceInviteAcceptInputDto,\n" +
        "  WorkspaceInviteInspectionDto,\n" +
        "  WorkspaceInviteInputDto,\n" +
        "  WorkspaceInviteNewUserAcceptInputDto,\n" +
        "  WorkspaceListDto,\n" +
        "  WorkspaceMemberManagerUpdateInputDto,\n" +
        "  WorkspaceMemberDto,\n" +
        "  WorkspaceMemberRoleUpdateInputDto,\n" +
        "  WorkspacePermissionsDto,\n" +
        "  WorkspaceUpdateInputDto,\n" +
        "  WorkspaceRole,\n" +
        '} from "@wpptrack/shared";\n',
      label:
        "backoffice/client-owner/billing schema+dto imports trimmed to the surviving product surface",
    },
  ], log);
  applyAnchoredRemovals(
    out,
    "apps/api/src/workspaces/workspaces.service.ts",
    [
      {
        startAnchor: "\n\ntype WorkspaceBillingRecord = {",
        endAnchor: "\n\nconst inviteTtlMs = 1000 * 60 * 60 * 24 * 7;",
        label: "WorkspaceBillingRecord/BackofficeWhatsappInstanceRecord local types removed",
      },
      {
        startAnchor:
          "\n\n  async listClientWorkspaces(): Promise<BackofficeClientWorkspaceDto[]> {",
        endAnchor:
          "\n\n  async listMembers(workspaceId: string): Promise<WorkspaceMemberDto[]> {",
        label:
          "listClientWorkspaces/provisionClientWorkspace/resendClientOwnerAccess/" +
          "issueClientOwnerActivationLink/setClientOwnerPassword/deliverClientOwnerAccess/" +
          "resolveWorkspaceSlug/slugify removed (staff-only, backoffice-workspaces.controller.ts already stripped)",
      },
      {
        startAnchor: "\n\n  async getBillingConfiguration(",
        endAnchor: "\n\n  async createInvite(",
        label:
          "getBillingConfiguration/listBillingConfigurations/listBackofficeWhatsappInstances/" +
          "updateBillingConfiguration/updateOperationalStatus removed (staff-only; also the source " +
          "of the now-invalid Prisma `subscriptions` select)",
      },
      {
        startAnchor: "\n\n  private alreadyActivatedConflict(): ConflictException {",
        endAnchor: "\n\n  private getWebOrigin(): string {",
        label: "alreadyActivatedConflict/findClientOwnerMembership removed (only used by the removed methods above)",
      },
      {
        startAnchor: "\n\n  private workspaceBillingAuditSummary(",
        endAnchor: "\n}\n",
        label:
          "workspaceBillingAuditSummary/toWorkspaceBillingDto/toWorkspaceBillingStatus/" +
          "toWhatsappProvider/toWhatsappBillingStatus removed (billing-dto helpers, only used by the removed methods above)",
      },
    ],
    log,
  );
}

// rewrite_rules.meta-oauth-state-residue-removal
function applyMetaOAuthStateResidueRemoval(out, log) {
  applyStringCodemod(out, "apps/api/src/integrations/integrations.service.ts", [
    {
      search: "  MetaOAuthCallbackQueryDto,\n  MetaOAuthCallbackResultDto,\n",
      replace: "",
      label: "MetaOAuthCallbackQueryDto/MetaOAuthCallbackResultDto imports removed",
    },
    {
      search: "const metaOAuthStateTtlMs = 1000 * 60 * 10;\n\n",
      replace: "",
      label: "metaOAuthStateTtlMs constant removed",
    },
  ], log);
  applyAnchoredRemovals(
    out,
    "apps/api/src/integrations/integrations.service.ts",
    [
      {
        startAnchor: "\n\n  async getMetaStartAction(\n",
        endAnchor:
          "\n\n  async getMetaConnection(workspaceId: string): Promise<MetaConnectionDto> {",
        label:
          "getMetaStartAction/handleMetaCallback removed (meta/start + meta/callback broker " +
          "endpoints already stripped from integrations.controller.ts in F3.2; these were the " +
          "now-unreachable service methods behind them)",
      },
      {
        startAnchor: "\n\n  private async createMetaOAuthState(\n",
        endAnchor: "\n\n  getMetaConnectionCapabilities(): MetaConnectionCapabilitiesDto {",
        label:
          "createMetaOAuthState/consumeMetaOAuthState/hashMetaOAuthState removed " +
          "(MetaOAuthState Prisma model stripped in F3.2; only callers were the broker methods above)",
      },
      {
        startAnchor: "\n\n  private isMetaOAuthEnabled(): boolean {",
        endAnchor: "\n\n  private requireMetaConnectionsService(): MetaConnectionsService {",
        label: "isMetaOAuthEnabled removed (only called by the removed broker methods above)",
      },
    ],
    log,
  );

  applyStringCodemod(
    out,
    "apps/api/src/integrations/meta/meta-connections.service.ts",
    [
      {
        search:
          "      await transaction.metaOAuthState.deleteMany({\n" +
          "        where: { workspaceId: input.workspaceId },\n" +
          "      });\n" +
          "      await transaction.auditLog.create({\n",
        replace: "      await transaction.auditLog.create({\n",
        label:
          "disconnectAndSwitchToManual(): metaOAuthState.deleteMany cleanup removed " +
          "(MetaOAuthState Prisma model stripped in F3.2 — nothing left to delete)",
      },
    ],
    log,
  );
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
  lines.push("## F3.3 dangling-import resolution codemods");
  lines.push(
    "Seat-gate noop, external-channel billing-access stub, platform-admin local " +
      "type, asaas adapter removal, client-swap web panel removal, meta/oauth/advanced " +
      "removal, subscription dead-link cleanup, ops-alerts whatsapp-connections stub " +
      "— see sanitize-allowdeny.yml rewrite_rules for the full rationale per entry.",
  );
  for (const a of log.f33Codemod) lines.push(`- OK: ${a}`);
  for (const a of log.f33CodemodFailed) lines.push(`- FAILED: ${a}`);
  lines.push("");
  lines.push("## F3.4 typecheck residue codemods");
  lines.push(
    "staff-only-backoffice-methods-removal, meta-oauth-state-residue-removal — " +
      "see sanitize-allowdeny.yml rewrite_rules for the full rationale per entry.",
  );
  for (const a of log.f34Codemod) lines.push(`- OK: ${a}`);
  for (const a of log.f34CodemodFailed) lines.push(`- FAILED: ${a}`);
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
  lines.push("## Known limitations / residual TODOs (F3.4+)");
  lines.push(
    "- billing/ was stripped wholesale (MVP default). F3.3 resolved every cross-file " +
      "reference into it left dangling by that strip (seat-gate noop, external-channel " +
      "billing-access stub, asaas adapter removal — see 'F3.3 dangling-import resolution " +
      "codemods' above) rather than reimplementing a BYO capacity concept. Re-architecting " +
      "seat/capacity tracking as a standalone concept remains a genuine follow-up (F4+), " +
      "just no longer a compile/import break.",
  );
  lines.push(
    "- Single-owner platform-admin bootstrap not designed/rewritten (create-platform-admin.ts, " +
      "promote-platform-owner.ts, platform-admin.service.ts stripped along with the multi-client " +
      "staff model). create-user.ts is kept as the generic helper. inbound-webhook-replay.service.ts " +
      "kept its business logic behind a local PlatformAdminUser-shaped type (F3.3) pending a real " +
      "caller. F3.3/F6 TODO.",
  );
  lines.push(
    "- ops-alerts.service.ts's Uazapi disconnect-status check is stubbed to always skip (F3.3) " +
      "since WhatsappConnectionsService, the billing-only instance marketplace it read status " +
      "through, is stripped. Re-wiring the check directly against UazapiAdapter is a real feature " +
      "change, left for a follow-up slice rather than guessed here.",
  );
  lines.push(
    "- Full `pnpm install && build` of the export was not run in this environment (no " +
      "node_modules / prisma CLI available in the sandbox) — see EXPORT_NOTES.md and the F3.4 " +
      "task note. Only textual/static checks (paths absent, secret scan, dangling-import scan) " +
      "were performed.",
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
    f33Codemod: [],
    f33CodemodFailed: [],
    f34Codemod: [],
    f34CodemodFailed: [],
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

  console.log("Applying F3.3 dangling-import resolution codemods ...");
  applySeatGateNoop(out, log);
  applyExternalChannelBillingAccessStub(out, log);
  applyPlatformAdminUserLocalType(out, log);
  applyAsaasAdapterRemoval(out, log);
  applyClientSwapWebRemoval(out, log);
  applyMetaOAuthAdvancedRemoval(out, log);
  applySubscriptionDeadLinksRemoval(out, log);
  applyOpsAlertsWhatsappConnectionsStub(out, log);

  console.log("Applying F3.4 typecheck residue codemods ...");
  applyStaffOnlyBackofficeMethodsRemoval(out, log);
  applyMetaOAuthStateResidueRemoval(out, log);

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
