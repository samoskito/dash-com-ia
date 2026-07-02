import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import { metaOAuthCallbackQuerySchema } from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
export class IntegrationsController {
  constructor(
    @Inject(IntegrationsService)
    private readonly integrationsService: IntegrationsService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService
  ) {}

  @Get("health")
  getHealth() {
    return this.integrationsService.getHealthSummary();
  }

  @Get("meta/start")
  async startMeta(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.integrationsService.getMetaStartAction(workspaceId);
  }

  @Get("meta/callback")
  handleMetaCallback(
    @AuthToken() _refreshToken: string,
    @Query() query: Record<string, unknown>
  ) {
    const input = this.parseBody(metaOAuthCallbackQuerySchema.safeParse(query));

    return this.integrationsService.handleMetaCallback(input);
  }

  @Get("meta/connection")
  async getMetaConnection(@AuthToken() refreshToken: string) {
    const workspaceId = await this.getCurrentWorkspaceId(refreshToken);

    return this.integrationsService.getMetaConnection(workspaceId);
  }

  @Get("uazapi/start")
  startUazapi() {
    return this.integrationsService.getUazapiStartAction();
  }

  @Get("asaas/status")
  getAsaasStatus() {
    return this.integrationsService.getAsaasStatusAction();
  }

  private parseBody<T>(result: { success: true; data: T } | { success: false }): T {
    if (!result.success) {
      throw new BadRequestException("Payload invalido");
    }

    return result.data;
  }

  private async getCurrentWorkspaceId(refreshToken: string): Promise<string> {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return workspace.id;
  }
}
