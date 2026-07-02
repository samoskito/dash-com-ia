import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch
} from "@nestjs/common";
import { workspaceBillingUpdateInputSchema } from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { WorkspacesService } from "./workspaces.service";

@Controller("backoffice/workspaces")
export class BackofficeWorkspacesController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService
  ) {}

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
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = workspaceBillingUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.workspacesService.updateBillingConfiguration(
      workspaceId,
      parsed.data
    );
  }
}
