import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query
} from "@nestjs/common";
import {
  diagnosticEventCreateSchema,
  diagnosticEventListQuerySchema,
  diagnosticRetryInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { DiagnosticsService } from "./diagnostics.service";

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
