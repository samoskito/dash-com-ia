import { Body, Controller, Headers, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { GuruLicenseWebhookService } from "./guru-license-webhook.service";
import { LicenseRateLimitService } from "./license-rate-limit.service";

type GuruWebhookRequest = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type StatusResponse = {
  status: (statusCode: number) => unknown;
};

function clientIp(req: GuruWebhookRequest): string {
  const xf = req.headers?.["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",")[0]!.trim();
  }
  return req.ip || "unknown";
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return undefined;
}

function enforceRateLimit(
  rateLimit: LicenseRateLimitService,
  req: GuruWebhookRequest,
): void {
  const reportedIp = clientIp(req);
  const socketIp = req.ip || "unknown";
  rateLimit.assertAllowed("guru-webhook", reportedIp);
  if (socketIp !== reportedIp) {
    rateLimit.assertAllowed("guru-webhook", socketIp);
  }
}

@Controller("license")
export class GuruLicenseWebhookController {
  constructor(
    @Inject(GuruLicenseWebhookService)
    private readonly webhooks: GuruLicenseWebhookService,
    @Inject(LicenseRateLimitService)
    private readonly rateLimit: LicenseRateLimitService,
  ) {}

  @Post("webhooks/guru")
  @HttpCode(200)
  async handle(
    @Body() body: unknown,
    @Headers("x-guru-webhook-secret") guruSecret: string | string[] | undefined,
    @Headers("x-webhook-secret") webhookSecret: string | string[] | undefined,
    @Req() req: GuruWebhookRequest,
    @Res({ passthrough: true }) response: StatusResponse,
  ) {
    enforceRateLimit(this.rateLimit, req);
    const secret =
      firstHeader(guruSecret) ??
      firstHeader(webhookSecret) ??
      firstHeader(req.headers?.["x-guru-webhook-secret"]) ??
      firstHeader(req.headers?.["x-webhook-secret"]);
    const result = await this.webhooks.handle(body, secret);
    response.status(result.httpStatus);
    return result.body;
  }
}
