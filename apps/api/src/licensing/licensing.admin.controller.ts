import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { LicenseNotificationService } from "./license-notification.service";
import { LicenseRateLimitService } from "./license-rate-limit.service";
import { LicensingService } from "./licensing.service";

function cleanQueryParam(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function parseTake(value: string | undefined): number {
  if (value == null || !value.trim()) {
    return 50;
  }
  if (!/^\d+$/.test(value.trim())) {
    throw new BadRequestException("take invalido");
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (parsed < 1) {
    throw new BadRequestException("take invalido");
  }
  return Math.min(parsed, 100);
}

function parseSkip(value: string | undefined): number {
  if (value == null || !value.trim()) {
    return 0;
  }
  if (!/^\d+$/.test(value.trim())) {
    throw new BadRequestException("skip invalido");
  }
  return Number.parseInt(value.trim(), 10);
}

function readStringField(body: unknown, field: string): unknown {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  return (body as Record<string, unknown>)[field];
}

@Controller("backoffice/licenses")
export class LicensingAdminController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(LicensingService) private readonly licensing: LicensingService,
    @Inject(LicenseNotificationService)
    private readonly notifications: LicenseNotificationService,
    @Inject(LicenseRateLimitService)
    private readonly rateLimit: LicenseRateLimitService,
  ) {}

  @Get()
  async list(
    @AuthToken() refreshToken: string,
    @Query("status") status?: string,
    @Query("email") email?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.licensing.listLicenses({
      status: cleanQueryParam(status),
      email: cleanQueryParam(email),
      take: parseTake(take),
      skip: parseSkip(skip),
    });
  }

  @Get(":id")
  async get(@AuthToken() refreshToken: string, @Param("id") id: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.licensing.getLicense(id);
  }

  @Post(":id/revoke")
  async revoke(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const reason = readStringField(body, "reason");
    if (typeof reason !== "string" || !reason.trim()) {
      throw new BadRequestException("reason is required");
    }
    return this.licensing.revokeLicense(id, reason.trim());
  }

  @Post(":id/rebind")
  async rebind(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const accountIdentity = readStringField(body, "accountIdentity");
    if (typeof accountIdentity !== "string" || !accountIdentity.trim()) {
      throw new BadRequestException("accountIdentity is required");
    }
    return this.licensing.rebindLicense(id, accountIdentity);
  }

  @Post(":id/resend")
  async resend(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: { ip?: string },
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    this.rateLimit.assertAllowed("admin-resend", req.ip || "unknown", id);

    const channelRaw = readStringField(body, "channel");
    let channel: "email" | "whatsapp" | "both" | undefined;
    if (channelRaw === undefined || channelRaw === null || channelRaw === "") {
      channel = "both";
    } else if (
      channelRaw === "email" ||
      channelRaw === "whatsapp" ||
      channelRaw === "both"
    ) {
      channel = channelRaw;
    } else {
      throw new BadRequestException("channel invalido");
    }

    const phoneRaw = readStringField(body, "phoneE164");
    const phoneE164 =
      typeof phoneRaw === "string" && phoneRaw.trim()
        ? phoneRaw.trim()
        : undefined;

    const result = await this.notifications.resendDelivery({
      licenseId: id,
      channel,
      phoneE164,
    });

    return {
      licenseId: result.licenseId,
      email: result.email,
      emailReason: result.emailReason,
      whatsapp: result.whatsapp,
      whatsappReason: result.whatsappReason,
    };
  }

  @Patch(":id/nod-api")
  async setNodApi(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const enabled = readStringField(body, "enabled");
    if (typeof enabled !== "boolean") {
      throw new BadRequestException("enabled is required");
    }

    const hasExpiresAt =
      !!body &&
      typeof body === "object" &&
      Object.prototype.hasOwnProperty.call(body, "expiresAt");
    let expiresAt: Date | null | undefined;
    if (hasExpiresAt) {
      const raw = readStringField(body, "expiresAt");
      if (raw === null) {
        expiresAt = null;
      } else if (typeof raw === "string" && raw.trim()) {
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException("expiresAt invalido");
        }
        expiresAt = parsed;
      } else {
        throw new BadRequestException("expiresAt invalido");
      }
    }

    return this.licensing.setNodApi(id, { enabled, expiresAt });
  }
}
