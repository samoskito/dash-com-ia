import { HttpException, HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { hashLicenseKey } from "./license-key.generator";

export const LICENSE_RATE_LIMIT_OPTIONS = "LICENSE_RATE_LIMIT_OPTIONS";

export type LicenseRateLimitOptions = {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
};

const DEFAULT_MAX_REQUESTS = 30;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const KEY_HASH_PREFIX_LENGTH = 16;

function throwRateLimited(): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      code: "license_rate_limited",
      message: "Limite de requisições de licença atingido.",
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

// Process-local only: counters live in this Node process and are not shared across replicas.
@Injectable()
export class LicenseRateLimitService {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(
    @Optional()
    @Inject(LICENSE_RATE_LIMIT_OPTIONS)
    options: LicenseRateLimitOptions = {},
  ) {
    this.maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
  }

  assertAllowed(route: string, ip: string, rawKey?: unknown): void {
    try {
      this.consume(`${route}:${ip || "unknown"}`);
      if (typeof rawKey === "string" && rawKey.trim()) {
        const keyHashPrefix = hashLicenseKey(rawKey).slice(0, KEY_HASH_PREFIX_LENGTH);
        this.consume(`${route}:${keyHashPrefix}`);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throwRateLimited();
    }
  }

  private consume(bucketKey: string): void {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(bucketKey) ?? []).filter((ts) => ts > windowStart);
    if (recent.length >= this.maxRequests) {
      this.hits.set(bucketKey, recent);
      throwRateLimited();
    }
    recent.push(now);
    this.hits.set(bucketKey, recent);
  }
}
