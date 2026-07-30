const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_MAX_NODES = 10_000;
const CTWA_FIELD_KEYS = new Set(["ctwaclid", "ctwaclickid"]);

type AuditOptions = {
  maxDepth?: number;
  maxNodes?: number;
};

export type GupshupPayloadSignals = {
  ctwaFieldPaths: string[];
  ctwaValuePaths: string[];
  ctwaLikeFieldPaths: string[];
  referralPaths: string[];
  rootKeys: string[];
  payloadKeys: string[];
  nodesVisited: number;
  truncated: boolean;
};

export function auditGupshupPayload(
  payload: unknown,
  options: Readonly<AuditOptions> = {},
): GupshupPayloadSignals {
  const maxDepth = boundedPositiveInteger(
    options.maxDepth,
    DEFAULT_MAX_DEPTH,
  );
  const maxNodes = boundedPositiveInteger(
    options.maxNodes,
    DEFAULT_MAX_NODES,
  );
  const ctwaFieldPaths = new Set<string>();
  const ctwaValuePaths = new Set<string>();
  const ctwaLikeFieldPaths = new Set<string>();
  const referralPaths = new Set<string>();
  const stack: Array<{ value: unknown; path: string; depth: number }> = [
    { value: payload, path: "$", depth: 0 },
  ];
  let nodesVisited = 0;
  let truncated = false;

  while (stack.length > 0) {
    if (nodesVisited >= maxNodes) {
      truncated = true;
      break;
    }

    const current = stack.pop()!;
    nodesVisited += 1;

    if (current.depth >= maxDepth) {
      if (isContainer(current.value)) {
        truncated = true;
      }
      continue;
    }

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({
          value: current.value[index],
          path: `${current.path}[${index}]`,
          depth: current.depth + 1,
        });
      }
      continue;
    }

    if (!isRecord(current.value)) {
      continue;
    }

    const entries = Object.entries(current.value);

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, value] = entries[index]!;
      const path = appendJsonPath(current.path, key);
      const normalizedKey = normalizeKey(key);

      if (normalizedKey === "referral" && isContainer(value)) {
        referralPaths.add(path);
      }

      if (CTWA_FIELD_KEYS.has(normalizedKey)) {
        ctwaFieldPaths.add(path);

        if (hasScalarValue(value)) {
          ctwaValuePaths.add(path);
        }
      } else if (normalizedKey.includes("ctwa")) {
        ctwaLikeFieldPaths.add(path);
      }

      stack.push({
        value,
        path,
        depth: current.depth + 1,
      });
    }
  }

  return {
    ctwaFieldPaths: sorted(ctwaFieldPaths),
    ctwaValuePaths: sorted(ctwaValuePaths),
    ctwaLikeFieldPaths: sorted(ctwaLikeFieldPaths),
    referralPaths: sorted(referralPaths),
    rootKeys: objectKeys(payload),
    payloadKeys: isRecord(payload) ? objectKeys(payload.payload) : [],
    nodesVisited,
    truncated,
  };
}

function appendJsonPath(base: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)
    ? `${base}.${key}`
    : `${base}[${JSON.stringify(key)}]`;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function hasScalarValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return typeof value === "number" || typeof value === "bigint";
}

function objectKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).sort() : [];
}

function isContainer(value: unknown): value is unknown[] | Record<string, unknown> {
  return Array.isArray(value) || isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

function sorted(values: ReadonlySet<string>): string[] {
  return [...values].sort();
}
