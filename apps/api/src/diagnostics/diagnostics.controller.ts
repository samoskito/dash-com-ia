import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req
} from "@nestjs/common";
import {
  diagnosticConversionEventLogListQuerySchema,
  diagnosticAuditLogListQuerySchema,
  diagnosticEventCreateSchema,
  diagnosticEventListQuerySchema,
  diagnosticIntegrationLogListQuerySchema,
  diagnosticJobAttemptListQuerySchema,
  diagnosticWebhookLogListQuerySchema,
  diagnosticRetryInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { DiagnosticsService } from "./diagnostics.service";

type DiagnosticsRequest = {
  ip?: string;
};

@Controller("backoffice/diagnostics")
export class DiagnosticsController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(DiagnosticsService)
    private readonly diagnosticsService: DiagnosticsService
  ) {}

  @Get("events")
  async listEvents(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = diagnosticEventListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.diagnosticsService.listEvents(parsed.data);
  }

  @Get("webhooks")
  async listWebhookLogs(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = diagnosticWebhookLogListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.diagnosticsService.listWebhookLogs(parsed.data);
  }

  @Get("webhooks/:id/payload")
  async getWebhookPayload(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Req() request: DiagnosticsRequest
  ) {
    const operator =
      await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.diagnosticsService.getWebhookPayload(id, {
      actorUserId: operator.id,
      sourceIp: request.ip ?? null
    });
  }

  @Get("jobs")
  async listJobAttempts(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = diagnosticJobAttemptListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.diagnosticsService.listJobAttempts(parsed.data);
  }

  @Get("integrations")
  async listIntegrationLogs(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = diagnosticIntegrationLogListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.diagnosticsService.listIntegrationLogs(parsed.data);
  }

  @Get("conversions")
  async listConversionEventLogs(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = diagnosticConversionEventLogListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.diagnosticsService.listConversionEventLogs(parsed.data);
  }

  @Get("audit")
  async listAuditLogs(
    @AuthToken() refreshToken: string,
    @Query() query: Record<string, unknown>
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = diagnosticAuditLogListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.diagnosticsService.listAuditLogs(parsed.data);
  }

  @Get("events/:id")
  async getEvent(@AuthToken() refreshToken: string, @Param("id") id: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.diagnosticsService.getEvent(id);
  }

  @Post("events")
  async recordEvent(@AuthToken() refreshToken: string, @Body() body: unknown) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = diagnosticEventCreateSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.diagnosticsService.recordEvent(parsed.data);
  }

  @Post("events/:id/retry")
  async retryEvent(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = diagnosticRetryInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.diagnosticsService.retryEvent(id, parsed.data);
  }
}
