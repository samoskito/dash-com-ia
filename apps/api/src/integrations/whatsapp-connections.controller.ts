import { Controller, Get, Inject, Param, Post } from "@nestjs/common";
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
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.whatsappConnectionsService.listInstances(workspaceId);
  }

  @Get(":instanceId/status")
  async getStatus(
    @AuthToken() refreshToken: string,
    @Param("instanceId") instanceId: string
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.whatsappConnectionsService.getStatus(workspaceId, instanceId);
  }

  @Post(":instanceId/connect")
  async connect(
    @AuthToken() refreshToken: string,
    @Param("instanceId") instanceId: string
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.whatsappConnectionsService.connectInstance(
      workspaceId,
      instanceId
    );
  }

  @Get(":instanceId/qr")
  async getQr(
    @AuthToken() refreshToken: string,
    @Param("instanceId") instanceId: string
  ) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.whatsappConnectionsService.getQr(workspaceId, instanceId);
  }

  private async getCurrentWorkspaceId(refreshToken: string): Promise<string> {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return workspace.id;
  }
}
