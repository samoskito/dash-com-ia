import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";

function findEnvFile(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const candidate = join(currentDir, ".env");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir || parsePath(currentDir).root === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if (
    (quote === `"` || quote === "'") &&
    trimmed.length >= 2 &&
    trimmed[trimmed.length - 1] === quote
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function loadLocalEnv(startDir = process.cwd()): void {
  const envFile = findEnvFile(startDir);

  if (!envFile) {
    return;
  }

  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValue] = line.split("=");
    const key = rawKey.trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = normalizeEnvValue(rawValue.join("="));
  }
}
