#!/usr/bin/env node
/**
 * sanitize-export.mjs — F3.1 STUB ONLY.
 *
 * This does NOT export anything. It only loads sanitize-allowdeny.yml,
 * validates it parses, and prints counts of each section so the inventory
 * can be sanity-checked in CI or by hand.
 *
 * The real export (copy keep_paths, delete remove_paths, apply
 * rewrite_rules, strip Prisma models / app.module.ts imports, generate
 * .env.example, run secret_fail_patterns as a hard gate, refuse to touch
 * defer_review paths) is F3.2 work — not implemented here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const YML_PATH = join(__dirname, "sanitize-allowdeny.yml");

async function loadYaml(path) {
  let yaml;
  try {
    ({ default: yaml } = await import("js-yaml"));
  } catch {
    yaml = null;
  }
  const raw = readFileSync(path, "utf8");
  if (yaml) return yaml.load(raw);

  // Fallback: no js-yaml dependency available in this workspace yet.
  // Shell out to python3's PyYAML (already used in the validation command
  // documented in README.md) rather than hand-rolling a YAML parser.
  const { execFileSync } = await import("node:child_process");
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

function count(section) {
  if (Array.isArray(section)) return section.length;
  if (section && typeof section === "object") {
    // Nested sections (e.g. prisma_models_remove.remove, defer_review list).
    return Object.values(section).reduce((sum, v) => sum + count(v), 0);
  }
  return section == null ? 0 : 1;
}

async function main() {
  let doc;
  try {
    doc = await loadYaml(YML_PATH);
  } catch (err) {
    console.error(`FAIL: could not parse ${YML_PATH}`);
    console.error(err.message ?? err);
    process.exitCode = 1;
    return;
  }

  if (!doc || typeof doc !== "object") {
    console.error("FAIL: sanitize-allowdeny.yml did not parse to an object");
    process.exitCode = 1;
    return;
  }

  console.log(`OK: parsed ${YML_PATH} (version ${doc.version ?? "unknown"})`);
  console.log("");
  console.log("Counts:");
  const sections = [
    "remove_paths",
    "remove_path_patterns",
    "keep_paths",
    "defer_review",
    "rewrite_rules",
    "secret_fail_patterns",
    "env_strip",
    "env_allow",
    "prisma_models_remove",
    "app_module_imports_remove",
  ];
  for (const key of sections) {
    console.log(`  ${key}: ${count(doc[key])}`);
  }

  console.log("");
  console.log(
    "This is the F3.1 stub — no files were read from or written to the",
    "product tree. Full export is F3.2.",
  );
}

await main();
