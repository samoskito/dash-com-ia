import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post
} from "@nestjs/common";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { WhatsappConnectionsService } from "./whatsapp-connections.service";

@Controller("integrations/whatsapp/instances")
export class WhatsappConnectionsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(WhatsappConnectionsService)
    private readonly whatsappConnectionsService: WhatsappConnectionsService
  ) {}

  @Get()
  async listInstances(@AuthToken() refreshToken: string) {
    const { workspaceId } = await this.getCurrentWorkspaceContext(refreshToken);

    return this.whatsappConnectionsService.listInstances(workspaceId);
  }

  @Get(":instanceId/status")
  async getStatus(
    @AuthToken() refreshToken: string,
    @Param("instanceId") instanceId: string
  ) {
    const { workspaceId } = await this.getCurrentWorkspaceContext(refreshToken);

    return this.whatsappConnectionsService.getStatus(workspaceId, instanceId);
  }

  @Post(":instanceId/connect")
  async connect(
    @AuthToken() refreshToken: string,
    @Param("instanceId") instanceId: string
  ) {
    const { canManageIntegrations, userId, workspaceId } =
      await this.getCurrentWorkspaceContext(refreshToken);

    if (!canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.whatsappConnectionsService.connectInstance(
      workspaceId,
      instanceId,
      userId
    );
  }

  @Get(":instanceId/qr")
  async getQr(
    @AuthToken() refreshToken: string,
    @Param("instanceId") instanceId: string
  ) {
    const { workspaceId } = await this.getCurrentWorkspaceContext(refreshToken);

    return this.whatsappConnectionsService.getQr(workspaceId, instanceId);
  }

  @Get(":instanceId/labels")
  async listLabels(
    @AuthToken() refreshToken: string,
    @Param("instanceId") instanceId: string
  ) {
    const { workspaceId } = await this.getCurrentWorkspaceContext(refreshToken);

    return this.whatsappConnectionsService.listLabels(workspaceId, instanceId);
  }

  private async getCurrentWorkspaceContext(refreshToken: string): Promise<{
    canManageIntegrations: boolean;
    userId: string;
    workspaceId: string;
  }> {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return {
      canManageIntegrations: workspace.permissions.canManageIntegrations,
      userId: authenticated.user.id,
      workspaceId: workspace.id
    };
  }
}
