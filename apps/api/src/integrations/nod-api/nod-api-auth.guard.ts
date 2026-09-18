import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LicenseAccountBindingService } from "../../licensing/license-account-binding.service";
import { hashLicenseKey } from "../../licensing/license-key.generator";
import { LicenseRateLimitService } from "../../licensing/license-rate-limit.service";
import { LicensingService } from "../../licensing/licensing.service";
import { throwNodApiError } from "./nod-api.errors";
import type { NodApiAuthContext, NodApiRequest } from "./nod-api.types";

const ROUTE = "nod-api";

function headerValue(req: NodApiRequest, name: string): string | undefined {
  const value = req.headers?.[name];
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

function bodyText(req: NodApiRequest, field: string): string | undefined {
  const value = req.body?.[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function clientIp(req: NodApiRequest): string {
  const xf = req.headers?.["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  if (typeof raw === "string" && raw.trim()) return raw.split(",")[0]!.trim();
  return req.ip || "unknown";
}

type AuthDeps = {
  prisma: PrismaService;
  licensing: LicensingService;
  binding: LicenseAccountBindingService;
  rateLimit: LicenseRateLimitService;
};

/**
 * Shared auth logic for the NOD API broker, reused by both guards below.
 * Reads `x-license-key` / `x-license-fingerprint` / `x-license-account-identity`
 * headers, falling back to the equivalent `licenseKey` / `fingerprint` /
 * `accountIdentity` body fields (documented in README.md).
 *
 * Fails closed: any missing/invalid/blocked condition throws before returning.
 * `options.requireNodApiActive` gates the nodApiEnabled/nodApiExpiresAt checks —
 * the health endpoint intentionally skips them so a licensed-but-not-yet-enabled
 * client can still see its own flags.
 */
export async function authenticateNodApiRequest(
  deps: AuthDeps,
  req: NodApiRequest,
  options: { requireNodApiActive: boolean },
): Promise<NodApiAuthContext> {
  const rawKey = headerValue(req, "x-license-key") ?? bodyText(req, "licenseKey");
  const fingerprint =
    headerValue(req, "x-license-fingerprint") ?? bodyText(req, "fingerprint");
  const accountIdentity =
    headerValue(req, "x-license-account-identity") ??
    bodyText(req, "accountIdentity");

  const reportedIp = clientIp(req);
  const socketIp = req.ip || "unknown";
  deps.rateLimit.assertAllowed(ROUTE, reportedIp, rawKey);
  if (socketIp !== reportedIp) {
    // Also bucket the socket IP so a spoofed X-Forwarded-For cannot bypass the limiter.
    deps.rateLimit.assertAllowed(ROUTE, socketIp);
  }

  if (!rawKey || !fingerprint) {
    throwNodApiError(
      HttpStatus.BAD_REQUEST,
      "nod_api_invalid_request",
      "x-license-key and x-license-fingerprint are required",
    );
  }

  const license = await deps.prisma.license.findUnique({
    where: { keyHash: hashLicenseKey(rawKey) },
  });
  if (!license) {
    throwNodApiError(
      HttpStatus.UNAUTHORIZED,
      "nod_api_invalid_license",
      "Licença inválida.",
    );
  }

  const state = deps.licensing.deriveRuntimeState(license);
  if (!state.usable) {
    throwNodApiError(
      HttpStatus.FORBIDDEN,
      "nod_api_license_blocked",
      "Licença bloqueada.",
    );
  }

  if (options.requireNodApiActive) {
    if (license.nodApiEnabled !== true) {
      throwNodApiError(
        HttpStatus.FORBIDDEN,
        "nod_api_disabled",
        "NOD API não está habilitada para esta licença.",
      );
    }
    if (license.nodApiExpiresAt && license.nodApiExpiresAt.getTime() <= Date.now()) {
      throwNodApiError(
        HttpStatus.FORBIDDEN,
        "nod_api_expired",
        "Acesso à NOD API expirado.",
      );
    }
  }

  if (accountIdentity) {
    const bound = license.boundAccountEmail ?? license.boundAccountId ?? null;
    if (bound) {
      const normalized = deps.binding.normalizeAccountIdentity(accountIdentity);
      if (normalized !== bound) {
        throwNodApiError(
          HttpStatus.FORBIDDEN,
          "nod_api_account_mismatch",
          "Esta licença está vinculada a outra conta.",
        );
      }
    }
  }

  return { license, fingerprint };
}

/** Full gate: usable license + nodApiEnabled + not nodApiExpiresAt-expired. */
@Injectable()
export class NodApiAuthGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LicensingService) private readonly licensing: LicensingService,
    @Inject(LicenseAccountBindingService)
    private readonly binding: LicenseAccountBindingService,
    @Inject(LicenseRateLimitService)
    private readonly rateLimit: LicenseRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    req.nodApiAuth = await authenticateNodApiRequest(
      {
        prisma: this.prisma,
        licensing: this.licensing,
        binding: this.binding,
        rateLimit: this.rateLimit,
      },
      req,
      { requireNodApiActive: true },
    );
    return true;
  }
}

/** Lighter gate for GET /nod-api/health: valid+usable license only, so the
 * client can see its own nodApiEnabled/nodApiExpiresAt flags even when they
 * would otherwise block it. */
@Injectable()
export class NodApiHealthAuthGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LicensingService) private readonly licensing: LicensingService,
    @Inject(LicenseAccountBindingService)
    private readonly binding: LicenseAccountBindingService,
    @Inject(LicenseRateLimitService)
    private readonly rateLimit: LicenseRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    req.nodApiAuth = await authenticateNodApiRequest(
      {
        prisma: this.prisma,
        licensing: this.licensing,
        binding: this.binding,
        rateLimit: this.rateLimit,
      },
      req,
      { requireNodApiActive: false },
    );
    return true;
  }
}
