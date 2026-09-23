import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  RUNTIME_ENV,
  type RuntimeEnv,
} from "../common/runtime/runtime.module";
import { LicenseClaimCaptchaService } from "./license-claim-captcha.service";
import {
  hashClaimEmail,
  normalizeClaimEmail,
  readLicenseClaimConfig,
} from "./license-claim.config";
import { LicenseClaimService } from "./license-claim.service";
import { LicenseRateLimitService } from "./license-rate-limit.service";

type ClaimRequest = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type HeaderResponse = {
  setHeader: (name: string, value: string) => unknown;
};

type ClaimRateLimit = {
  ipMax: number;
  ipWindowMs: number;
  emailMax: number;
  emailWindowMs: number;
};

const REQUEST_RATE_LIMIT: ClaimRateLimit = {
  ipMax: 5,
  ipWindowMs: 15 * 60_000,
  emailMax: 3,
  emailWindowMs: 60 * 60_000,
};

const CONFIRM_RATE_LIMIT: ClaimRateLimit = {
  ipMax: 10,
  ipWindowMs: 15 * 60_000,
  emailMax: 10,
  emailWindowMs: 60 * 60_000,
};

function readField(body: unknown, field: string): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  return (body as Record<string, unknown>)[field];
}

function clientIp(req: ClaimRequest): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",")[0]!.trim();
  }
  return req.ip || "unknown";
}

function enforceClaimRateLimit(
  rateLimit: LicenseRateLimitService,
  route: "claim-request" | "claim-confirm",
  req: ClaimRequest,
  normalizedEmail: string | null,
  limits: ClaimRateLimit,
): string {
  const reportedIp = clientIp(req);
  const socketIp = req.ip || "unknown";
  rateLimit.consume(
    `${route}:ip:${reportedIp}`,
    limits.ipMax,
    limits.ipWindowMs,
  );
  if (socketIp !== reportedIp) {
    rateLimit.consume(
      `${route}:ip:${socketIp}`,
      limits.ipMax,
      limits.ipWindowMs,
    );
  }
  if (normalizedEmail) {
    rateLimit.consume(
      `${route}:email:${hashClaimEmail(normalizedEmail)}`,
      limits.emailMax,
      limits.emailWindowMs,
    );
  }
  return reportedIp;
}

@Controller("license/claim")
export class LicenseClaimController {
  private readonly logger = new Logger(LicenseClaimController.name);

  constructor(
    @Inject(LicenseClaimService)
    private readonly claims: LicenseClaimService,
    @Inject(LicenseClaimCaptchaService)
    private readonly captcha: LicenseClaimCaptchaService,
    @Inject(LicenseRateLimitService)
    private readonly rateLimit: LicenseRateLimitService,
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  @Post("request")
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @Body() body: unknown,
    @Req() req: ClaimRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    this.assertEnabled();
    const rawEmail = readField(body, "email");
    const normalizedEmail = normalizeClaimEmail(rawEmail);
    const ip = enforceClaimRateLimit(
      this.rateLimit,
      "claim-request",
      req,
      normalizedEmail,
      REQUEST_RATE_LIMIT,
    );

    let captchaOk = false;
    try {
      captchaOk = await this.captcha.verify(
        readField(body, "captchaToken"),
        ip,
      );
    } catch {
      captchaOk = false;
    }

    if (captchaOk) {
      try {
        void this.claims.processRequest(rawEmail).catch(() => {
          this.logger.warn("license_claim_request_failed");
        });
      } catch {
        this.logger.warn("license_claim_request_failed");
      }
    } else {
      this.logger.warn("license_claim_request_result result=captcha_failed");
    }

    response.setHeader("Cache-Control", "no-store");
    return { status: "code_sent_if_eligible" as const };
  }

  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Body() body: unknown,
    @Req() req: ClaimRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    this.assertEnabled();
    const rawEmail = readField(body, "email");
    enforceClaimRateLimit(
      this.rateLimit,
      "claim-confirm",
      req,
      normalizeClaimEmail(rawEmail),
      CONFIRM_RATE_LIMIT,
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    return this.claims.confirm(rawEmail, readField(body, "code"));
  }

  private assertEnabled(): void {
    if (readLicenseClaimConfig(this.env).enabled) {
      return;
    }
    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: "license_claim_disabled",
        message: "Resgate de licença indisponível.",
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
