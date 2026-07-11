import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import {
  externalDataConnectorCreateInputSchema,
  externalDataConnectorUpdateInputSchema,
  externalSyncInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { ExternalDataService } from "./external-data.service";

@Controller("backoffice/external-data/connectors")
export class BackofficeExternalDataController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(ExternalDataService)
    private readonly externalDataService: ExternalDataService
  ) {}

  @Get()
  async list(
    @AuthToken() refreshToken: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.externalDataService.listConnectors(workspaceId?.trim() || undefined);
  }

  @Post()
  async create(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const admin = await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const parsed = externalDataConnectorCreateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.externalDataService.createConnector(parsed.data, admin.id);
  }

  @Patch(":connectorId")
  async update(
    @AuthToken() refreshToken: string,
    @Param("connectorId") connectorId: string,
    @Body() body: unknown
  ) {
    const admin = await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const parsed = externalDataConnectorUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.externalDataService.updateConnector(connectorId, parsed.data, admin.id);
  }

  @Post(":connectorId/test")
  async testConnection(
    @AuthToken() refreshToken: string,
    @Param("connectorId") connectorId: string
  ) {
    const admin = await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.externalDataService.testConnection(connectorId, admin.id);
  }

  @Post(":connectorId/sync")
  async sync(
    @AuthToken() refreshToken: string,
    @Param("connectorId") connectorId: string,
    @Body() body: unknown
  ) {
    const admin = await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const parsed = externalSyncInputSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.externalDataService.enqueueSync(connectorId, parsed.data, admin.id);
  }

  @Get(":connectorId/health")
  async health(
    @AuthToken() refreshToken: string,
    @Param("connectorId") connectorId: string
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.externalDataService.getHealth(connectorId);
  }
}
