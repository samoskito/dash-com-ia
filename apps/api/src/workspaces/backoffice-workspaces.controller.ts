import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post
} from "@nestjs/common";
import {
  clientWorkspaceProvisionInputSchema,
  workspaceBillingUpdateInputSchema,
  workspaceOperationalStatusUpdateInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { WorkspacesService } from "./workspaces.service";
import { PlatformWorkspaceAccessService } from "./platform-workspace-access.service";

@Controller("backoffice/workspaces")
export class BackofficeWorkspacesController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(PlatformWorkspaceAccessService)
    private readonly platformWorkspaceAccessService: PlatformWorkspaceAccessService
  ) {}

  @Get()
  async list(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.workspacesService.listClientWorkspaces();
  }

  @Post()
  async provision(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const platformAdmin =
      await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const parsed = clientWorkspaceProvisionInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.workspacesService.provisionClientWorkspace(
      parsed.data,
      platformAdmin.id
    );
  }

  @Post(":workspaceId/support-access")
  async startSupportAccess(
    @AuthToken() refreshToken: string,
    @Param("workspaceId") workspaceId: string
  ) {
    const platformAdmin =
      await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.platformWorkspaceAccessService.start(
      refreshToken,
      workspaceId,
      platformAdmin
    );
  }

  @Delete("support-access")
  async stopSupportAccess(@AuthToken() refreshToken: string) {
    const platformAdmin =
      await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.platformWorkspaceAccessService.stop(
      refreshToken,
      platformAdmin
    );
  }

  @Get("billing")
  async listBilling(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.workspacesService.listBillingConfigurations();
  }

  @Get("whatsapp-instances")
  async listWhatsappInstances(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.workspacesService.listBackofficeWhatsappInstances();
  }

  @Get(":workspaceId/billing")
  async getBilling(
    @AuthToken() refreshToken: string,
    @Param("workspaceId") workspaceId: string
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.workspacesService.getBillingConfiguration(workspaceId);
  }

  @Patch(":workspaceId/billing")
  async updateBilling(
    @AuthToken() refreshToken: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown
  ) {
    const platformAdmin =
      await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = workspaceBillingUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.workspacesService.updateBillingConfiguration(
      workspaceId,
      parsed.data,
      platformAdmin.id
    );
  }

  @Patch(":workspaceId/operational-status")
  async updateOperationalStatus(
    @AuthToken() refreshToken: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown
  ) {
    const platformAdmin =
      await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = workspaceOperationalStatusUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.workspacesService.updateOperationalStatus(
      workspaceId,
      parsed.data,
      platformAdmin.id
    );
  }
}
