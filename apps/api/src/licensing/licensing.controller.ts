import { Body, Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { LicenseCryptoService } from "./license-crypto.service";
import { LicenseRateLimitService } from "./license-rate-limit.service";
import { LicensingService } from "./licensing.service";

type LicenseRequest = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ActivateBody = {
  key?: unknown;
  fingerprint?: unknown;
  accountIdentity?: unknown;
  appVersion?: unknown;
  deployLabel?: unknown;
};

type HeartbeatBody = {
  key?: unknown;
  fingerprint?: unknown;
};

function clientIp(req: LicenseRequest): string {
  const xf = req.headers?.["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  if (typeof raw === "string" && raw.trim()) return raw.split(",")[0]!.trim();
  return req.ip || "unknown";
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function enforceRateLimit(
  rateLimit: LicenseRateLimitService,
  route: string,
  req: LicenseRequest,
  rawKey?: unknown,
): string {
  const reportedIp = clientIp(req);
  const socketIp = req.ip || "unknown";
  rateLimit.assertAllowed(route, reportedIp, rawKey);
  // Also bucket the socket IP so a spoofed X-Forwarded-For cannot bypass the limiter.
  if (socketIp !== reportedIp) {
    rateLimit.assertAllowed(route, socketIp);
  }
  return reportedIp;
}

@Controller("license")
export class LicensingController {
  constructor(
    @Inject(LicensingService) private readonly licensing: LicensingService,
    @Inject(LicenseCryptoService) private readonly crypto: LicenseCryptoService,
    @Inject(LicenseRateLimitService)
    private readonly rateLimit: LicenseRateLimitService,
  ) {}

  @Post("activate")
  @HttpCode(200)
  async activate(@Body() body: ActivateBody, @Req() req: LicenseRequest) {
    const ip = enforceRateLimit(this.rateLimit, "activate", req, body?.key);
    return this.licensing.activate({
      key: body?.key as string,
      fingerprint: body?.fingerprint as string,
      accountIdentity: body?.accountIdentity as string,
      appVersion: optionalText(body?.appVersion),
      deployLabel: optionalText(body?.deployLabel),
      ipAddress: ip,
    });
  }

  @Post("heartbeat")
  @HttpCode(200)
  async heartbeat(@Body() body: HeartbeatBody, @Req() req: LicenseRequest) {
    const ip = enforceRateLimit(this.rateLimit, "heartbeat", req, body?.key);
    return this.licensing.heartbeat({
      key: body?.key as string,
      fingerprint: body?.fingerprint as string,
      ipAddress: ip,
    });
  }

  @Get("public-key")
  getPublicKey(@Req() req: LicenseRequest) {
    enforceRateLimit(this.rateLimit, "public-key", req);
    return {
      alg: "Ed25519" as const,
      publicKey: this.crypto.getPublicKeyExport(),
    };
  }
}
